// Reconstrói eventos do funil a partir das tags do contato, para períodos em
// que o webhook do GHL deixou de chegar.
//
// Contexto (02-03/09/2026): os workflows do GHL pararam de chamar
// /api/webhooks/ghl/funnel às 15:09 de 02/09 e a operação seguiu rodando --
// oportunidades criadas, tags aplicadas, leads entrando. Sem os webhooks o
// funil fica cego, mas `ghl_contact_tags` continua registrando as tags que o
// sync diário de contatos enxerga, e é daí que dá para reconstruir.
//
// LIMITES, porque o resultado NÃO é equivalente ao webhook:
//   - O horário é aproximado. A tag não tem data própria no GHL, então a
//     âncora é `dateAdded` do contato para as etapas de entrada (lead e
//     marcador de braço, atribuídos na mensagem de boas-vindas) e
//     `dateUpdated` para as demais. Um contato que avançou duas etapas entre
//     dois syncs recebe as duas no mesmo instante -- a ordem dentro do dia se
//     perde, o dia continua certo.
//   - Só alcança o que o sync de contatos já viu. Ele roda ~1x/dia, então o
//     movimento posterior ao último sync é invisível até o próximo.
//   - Só cria etapa que o contato ainda não tem, nunca duplica nem sobrescreve.
//
// As linhas entram com event_type = 'reconstruido_de_tag', o que permite
// separá-las de webhook real em qualquer análise posterior.
//
// Uso:
//   node scripts/reconstruir-funil-de-tags.mjs                  (simulação)
//   node scripts/reconstruir-funil-de-tags.mjs --aplicar
//   node scripts/reconstruir-funil-de-tags.mjs --desde 2026-09-02T15:09:35-03:00
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  GHL_FUNNEL_STAGES,
  normalizeGhlFunnelStage,
} from "../lib/ghl/funnel.ts";

dotenv.config({ path: ".env.local", quiet: true });

const required = ["NEXT_PUBLIC_SUPABASE_URL", "DASHBOARD_SECRET"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} não está configurado`);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.DASHBOARD_SECRET,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const argv = process.argv.slice(2);
const aplicar = argv.includes("--aplicar");

function argValor(nome) {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] : undefined;
}

// Etapas que entram na abertura da conversa, atribuídas junto com o lead.
// Para elas a âncora é a criação do contato, não a última atualização.
const ETAPAS_DE_ENTRADA = new Set([
  "lead",
  "commockautomatico",
  "semmockautomatico",
  "atendimentoladob",
]);

// `negociofechado` fica de fora de propósito: o funil já lê venda do
// deals_cache, com a data canônica de fechamento.
const ETAPAS_IGNORADAS = new Set(["negociofechado"]);

// A ordem estável é obrigatória: sem ela o .range() devolve fatias
// arbitrárias, e a leitura de "o que o contato já tem" sai diferente a cada
// execução -- o que faria o script inserir duplicata. Aconteceu de verdade
// aqui antes deste guard: duas execuções seguidas viram 59 e 7 pendências
// sobre exatamente o mesmo banco.
async function paginar(construirQuery, colunasDeOrdem) {
  if (!Array.isArray(colunasDeOrdem) || colunasDeOrdem.length === 0) {
    throw new Error("paginar exige coluna(s) de ordenação estável");
  }
  const linhas = [];
  for (let from = 0; ; from += 1000) {
    let query = construirQuery(from, from + 999);
    for (const coluna of colunasDeOrdem) {
      query = query.order(coluna, { ascending: true });
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) return linhas;
  }
}

async function main() {
  const { data: ultimo, error: erroUltimo } = await supabase
    .from("ghl_funnel_events")
    .select("received_at")
    .neq("event_type", "reconstruido_de_tag")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroUltimo) throw new Error(erroUltimo.message);

  const desde = new Date(argValor("--desde") ?? ultimo?.received_at ?? 0);
  const ate = new Date(argValor("--ate") ?? Date.now());
  if (!Number.isFinite(desde.getTime()) || !Number.isFinite(ate.getTime())) {
    throw new Error("--desde / --ate precisam ser datas ISO válidas");
  }

  console.log(`Janela: ${desde.toISOString()} → ${ate.toISOString()}`);
  console.log(
    aplicar ? "Modo: APLICAR (grava no banco)" : "Modo: simulação (--aplicar para gravar)",
  );

  const tags = await paginar(
    (from, to) =>
      supabase.from("ghl_contact_tags").select("contact_id, tag").range(from, to),
    ["contact_id", "tag"],
  );

  // Só interessa tag que corresponde a uma etapa do funil.
  const porContato = new Map();
  for (const linha of tags) {
    const slug = normalizeGhlFunnelStage(linha.tag);
    if (!slug || ETAPAS_IGNORADAS.has(slug)) continue;
    if (!porContato.has(linha.contact_id)) {
      porContato.set(linha.contact_id, new Set());
    }
    porContato.get(linha.contact_id).add(slug);
  }
  console.log(`Contatos com tag de etapa: ${porContato.size}`);

  const contatos = await paginar(
    (from, to) =>
      supabase
        .from("ghl_contacts")
        .select("id, first_name, last_name, email, phone, qty_pares, raw")
        .range(from, to),
    ["id"],
  );
  const contatoPorId = new Map(contatos.map((c) => [c.id, c]));

  const eventos = await paginar(
    (from, to) =>
      supabase
        .from("ghl_funnel_events")
        .select("id, contact_id, stage_slug")
        .range(from, to),
    ["id"],
  );
  const jaTem = new Set(eventos.map((e) => `${e.contact_id}|${e.stage_slug}`));

  const novos = [];
  const porEtapa = new Map();

  for (const [contactId, slugs] of porContato) {
    const contato = contatoPorId.get(contactId);
    if (!contato) continue;

    const criadoEm = contato.raw?.dateAdded
      ? new Date(contato.raw.dateAdded)
      : null;
    const atualizadoEm = contato.raw?.dateUpdated
      ? new Date(contato.raw.dateUpdated)
      : null;

    for (const slug of slugs) {
      if (jaTem.has(`${contactId}|${slug}`)) continue;

      const ancora = ETAPAS_DE_ENTRADA.has(slug)
        ? (criadoEm ?? atualizadoEm)
        : (atualizadoEm ?? criadoEm);
      if (!ancora || !Number.isFinite(ancora.getTime())) continue;
      if (ancora <= desde || ancora > ate) continue;

      const nome =
        [contato.first_name, contato.last_name].filter(Boolean).join(" ") || null;

      novos.push({
        event_type: "reconstruido_de_tag",
        stage_slug: slug,
        stage_name: GHL_FUNNEL_STAGES[slug],
        contact_id: contactId,
        contact_name: nome,
        contact_email: contato.email,
        contact_phone: contato.phone,
        quantidade_pares: contato.qty_pares,
        tags: Array.isArray(contato.raw?.tags) ? contato.raw.tags : [],
        contact_created_at: criadoEm?.toISOString() ?? null,
        received_at: ancora.toISOString(),
        raw_payload: {
          reconstruido: true,
          motivo: "webhook do GHL fora do ar",
          fonte: "ghl_contact_tags + ghl_contacts",
          ancora: ETAPAS_DE_ENTRADA.has(slug) ? "dateAdded" : "dateUpdated",
          gerado_em: new Date().toISOString(),
        },
      });

      porEtapa.set(slug, (porEtapa.get(slug) ?? 0) + 1);
    }
  }

  if (novos.length === 0) {
    console.log("Nada a reconstruir nessa janela.");
    return;
  }

  console.log(`\nEventos a reconstruir: ${novos.length}`);
  for (const [slug, n] of [...porEtapa].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${GHL_FUNNEL_STAGES[slug]}: ${n}`);
  }

  if (!aplicar) {
    console.log("\nSimulação apenas. Rode com --aplicar para gravar.");
    return;
  }

  for (let i = 0; i < novos.length; i += 200) {
    const lote = novos.slice(i, i + 200);
    const { error } = await supabase.from("ghl_funnel_events").insert(lote);
    if (error) throw new Error(`Insert falhou: ${error.message}`);
    console.log(`  gravados ${Math.min(i + 200, novos.length)}/${novos.length}`);
  }
  console.log("\nPronto.");
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
