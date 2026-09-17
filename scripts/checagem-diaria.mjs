// Checagem diária do pipeline de dados do GHL. Fala só quando algo está
// errado.
//
// Existe por causa de três falhas reais que ficaram escondidas em 2026:
//   - o webhook do funil voltando 401 por 42 h (02-04/09), invisível porque
//     a recusa só virava console.warn;
//   - o sync enxergando 1/3 dos contatos em Negociação por semanas, o que
//     fazia a M2 do follow-up aparecer para 2 clientes quando eram 71
//     (17/09, corte de 1.000 linhas do PostgREST);
//   - a chave da Anthropic expirada em 28/08, com a análise de Meta x GHL
//     falhando toda manhã até 17/09.
//
// Nenhuma apareceu sozinha: as três foram achadas porque alguém desconfiou
// de um número. As checagens abaixo são as que dariam para automatizar.
//
// Uso:
//   node scripts/checagem-diaria.mjs            (relatório completo)
//   node scripts/checagem-diaria.mjs --silencio (só imprime se houver alerta)
//
// Sai com código 1 quando há alerta, para o agendador saber que falou algo.
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });

const obrigatorias = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "DASHBOARD_SECRET",
  "GHL_PRIVATE_INTEGRATION_TOKEN",
  "GHL_LOCATION_ID",
];
for (const nome of obrigatorias) {
  if (!process.env[nome]) throw new Error(`${nome} não está configurado`);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.DASHBOARD_SECRET,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const GHL = (process.env.GHL_API_BASE_URL ?? "https://services.leadconnectorhq.com")
  .replace(/\/$/, "");
const cabecalho = {
  Authorization: `Bearer ${process.env.GHL_PRIVATE_INTEGRATION_TOKEN}`,
  Version: "2021-07-28",
  Accept: "application/json",
  "Content-Type": "application/json",
};

const soSilencio = process.argv.includes("--silencio");
const alertas = [];
const linhas = [];
const ok = (texto) => linhas.push(`  ok      ${texto}`);
const alerta = (texto) => {
  alertas.push(texto);
  linhas.push(`  ALERTA  ${texto}`);
};
const horas = (desde) => (Date.now() - new Date(desde).getTime()) / 3_600_000;
const hhmm = (iso) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

// 1. O sync do GHL rodou e terminou?
//
// A cadeia é opportunities -> tags -> contacts -> snapshot. Snapshot é o
// último elo: sem ele, não há foto de etapa do dia e a régua de follow-up
// para de medir avanço.
async function checarSync() {
  const { data, error } = await supabase
    .from("sync_log")
    .select("source, started_at, status, error")
    .gt("started_at", new Date(Date.now() - 26 * 3_600_000).toISOString())
    .order("started_at", { ascending: false });
  if (error) throw new Error(`sync_log: ${error.message}`);

  const fases = ["ghl_opportunities", "ghl_contact_tags", "ghl_contacts", "ghl_snapshots"];
  for (const fase of fases) {
    const ultima = data.find((l) => l.source === fase);
    if (!ultima) {
      alerta(`${fase}: nenhuma execução nas últimas 26 h`);
      continue;
    }
    ok(`${fase}: última em ${hhmm(ultima.started_at)}`);
  }

  // "contato(s) pulado(s)" é contato apagado no GHL: o sync pula e segue.
  const falhas = data.filter(
    (l) =>
      l.status === "error" &&
      l.source.startsWith("ghl") &&
      !/contato\(s\) pulado\(s\)/.test(l.error ?? ""),
  );
  for (const f of falhas) {
    alerta(`${f.source} falhou em ${hhmm(f.started_at)}: ${(f.error ?? "").slice(0, 160)}`);
  }

  // As outras automações (análises de Meta x GHL, Instagram) compartilham
  // secrets com o resto: chave vencida aparece aqui antes de alguém notar.
  const { data: outras } = await supabase
    .from("sync_log")
    .select("source, started_at, error")
    .eq("status", "error")
    .not("source", "like", "ghl%")
    .gt("started_at", new Date(Date.now() - 26 * 3_600_000).toISOString());
  for (const f of outras ?? []) {
    alerta(`${f.source} falhou em ${hhmm(f.started_at)}: ${(f.error ?? "").slice(0, 160)}`);
  }
}

// 2. O que o dashboard mostra bate com o GHL?
//
// Esta é a checagem que pega ponto cego novo: em vez de confiar na nossa
// contagem, pergunta ao GHL quantos contatos têm cada tag medida e compara.
async function checarTags() {
  const res = await fetch(`${GHL}/locations/${process.env.GHL_LOCATION_ID}/tags`, {
    headers: cabecalho,
  });
  if (!res.ok) {
    alerta(`GHL /tags devolveu ${res.status}`);
    return;
  }
  const todas = ((await res.json()).tags ?? [])
    .map((t) => String(t.name ?? ""))
    .filter((nome) => /^(follow_|campanha_)/i.test(nome))
    .sort();

  // Contagem por tag com count exato, uma consulta por tag: ler as linhas e
  // contar aqui traria no máximo 1.000 (o PostgREST corta toda resposta
  // nesse tamanho, sem avisar -- foi o bug de 17/09 que escondeu a M2).
  const contarAqui = async (tag) => {
    const { count, error } = await supabase
      .from("ghl_contact_tags")
      .select("tag", { count: "exact", head: true })
      .eq("tag", tag);
    if (error) throw new Error(`ghl_contact_tags (${tag}): ${error.message}`);
    return count ?? 0;
  };

  let divergentes = 0;
  for (const tag of todas) {
    const busca = await fetch(`${GHL}/contacts/search`, {
      method: "POST",
      headers: cabecalho,
      body: JSON.stringify({
        locationId: process.env.GHL_LOCATION_ID,
        page: 1,
        pageLimit: 1,
        filters: [{ field: "tags", operator: "contains", value: tag }],
      }),
    });
    if (!busca.ok) {
      alerta(`GHL /contacts/search (${tag}) devolveu ${busca.status}`);
      continue;
    }
    const noGhl = (await busca.json()).total ?? 0;
    const aqui = await contarAqui(tag);
    // Alguma diferença é normal: tag aplicada depois do sync da manhã só
    // aparece amanhã, e tag removida no GHL continua aqui (a tabela é
    // histórico, nunca apaga). O que interessa é buraco estrutural, como os
    // 731 contra 732 de 17/09 virando 141 contra 732.
    const tolerancia = Math.max(5, Math.round(noGhl * 0.01));
    if (Math.abs(noGhl - aqui) > tolerancia) {
      divergentes++;
      alerta(`tag ${tag}: GHL tem ${noGhl}, dashboard tem ${aqui}`);
    }
  }
  if (divergentes === 0) ok(`${todas.length} tags medidas conferem com o GHL`);
}

// 3. O funil está recebendo webhook?
//
// Em 02/09 os workflows do GHL seguiram disparando e TODAS as chamadas
// voltavam 401: do lado de cá, silêncio idêntico ao de um dia parado. Por
// isso a checagem olha os dois lados -- evento que entrou e recusa gravada.
async function checarFunil() {
  const { data: evento, error } = await supabase
    .from("ghl_funnel_events")
    .select("received_at")
    .neq("event_type", "reconstruido_de_tag")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`ghl_funnel_events: ${error.message}`);

  const horasParado = evento ? horas(evento.received_at) : Infinity;
  // Fora do horário comercial o silêncio é normal: 20 h cobre a noite e
  // ainda acusa um dia inteiro sem evento.
  if (horasParado > 20) {
    alerta(
      `funil sem evento há ${Math.floor(horasParado)} h (último em ${
        evento ? hhmm(evento.received_at) : "nunca"
      })`,
    );
  } else {
    ok(`funil recebeu evento em ${hhmm(evento.received_at)}`);
  }

  const { data: recusas } = await supabase
    .from("webhook_rejections")
    .select("motivo, received_at")
    .gt("received_at", new Date(Date.now() - 24 * 3_600_000).toISOString());
  const porMotivo = new Map();
  for (const r of recusas ?? []) {
    porMotivo.set(r.motivo, (porMotivo.get(r.motivo) ?? 0) + 1);
  }
  for (const [motivo, n] of porMotivo) {
    if (motivo === "evento_ignorado") continue; // esperado, não é falha
    alerta(`${n} webhook(s) recusado(s) em 24 h por ${motivo}`);
  }
  if (porMotivo.size === 0) ok("nenhum webhook recusado em 24 h");
}

async function main() {
  const etapas = [
    ["Sync do GHL", checarSync],
    ["Tags x GHL", checarTags],
    ["Webhook do funil", checarFunil],
  ];
  for (const [titulo, checar] of etapas) {
    linhas.push(titulo);
    try {
      await checar();
    } catch (erro) {
      alerta(`${titulo}: a checagem falhou (${erro instanceof Error ? erro.message : erro})`);
    }
    linhas.push("");
  }

  if (alertas.length === 0) {
    if (!soSilencio) console.log(`Tudo certo.\n\n${linhas.join("\n")}`);
    return;
  }
  console.log(
    `${alertas.length} alerta(s):\n${alertas.map((a) => `  - ${a}`).join("\n")}\n\n${linhas.join("\n")}`,
  );
  process.exitCode = 1;
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
