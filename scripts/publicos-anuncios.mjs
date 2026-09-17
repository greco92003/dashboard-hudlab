// Gera as listas de público para Meta Ads e Google Ads a partir da base do GHL.
//
// Ordem: quem foi mais longe no processo primeiro -- Recebido Pedido,
// Expedição, Produção de Pedidos, Impressão de Fotolitos... descendo a
// esteira até fechar o tamanho pedido (padrão 1.000). Dentro da mesma etapa,
// o contato de movimento mais recente. Negócio ganho cuja etapa atual não
// está na dim (o pedido passa pela pipeline Fábrica de Mockups durante a
// produção) entra como Pagamento Confirmado, o mínimo que se sabe de quem
// comprou.
//
// Formatos (as duas plataformas criptografam no upload; o arquivo vai em
// texto normalizado, que é o que elas pedem):
//   Meta   -> email,phone,fn,ln,ct,st,country,value
//             value = faturamento do cliente, para público por valor.
//   Google -> Email,Phone
//             Só e-mail e telefone de propósito: casar por nome exige CEP
//             junto, e a base do GHL não tem CEP (0 de 907 clientes).
//
// Os arquivos têm dado pessoal de cliente: saem na pasta indicada por
// --saida e NUNCA no repositório.
//
// Uso:
//   node scripts/publicos-anuncios.mjs --saida "C:\\caminho\\pasta"
//   node scripts/publicos-anuncios.mjs --tamanho 2000 --saida ./publicos
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });

for (const nome of ["NEXT_PUBLIC_SUPABASE_URL", "DASHBOARD_SECRET"]) {
  if (!process.env[nome]) throw new Error(`${nome} não está configurado`);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.DASHBOARD_SECRET,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const argv = process.argv.slice(2);
const argValor = (nome) => {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] : undefined;
};
const tamanho = Number(argValor("--tamanho") ?? 1000);
// Piso de quem já comprou, quando a etapa atual não está na dim.
const ORDEM_PAGAMENTO_CONFIRMADO = 9;
const saida = argValor("--saida") ?? ".";

// Acento quebra o casamento: as plataformas comparam texto normalizado.
const semAcento = (texto) =>
  texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function limparNome(valor) {
  if (!valor) return "";
  return semAcento(String(valor))
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, "")
    .trim();
}

function limparCidade(valor) {
  if (!valor) return "";
  return semAcento(String(valor)).toLowerCase().replace(/[^a-z]/g, "");
}

function limparEmail(valor) {
  if (!valor) return "";
  const email = String(valor).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) ? email : "";
}

// E.164. O GHL já grava +55DDDNÚMERO, mas telefone digitado à mão aparece
// sem o +55 ou com o zero da operadora na frente.
function limparTelefone(valor) {
  if (!valor) return "";
  let digitos = String(valor).replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  if (digitos.startsWith("055")) digitos = digitos.slice(1);
  return digitos.length >= 12 && digitos.length <= 13 ? `+${digitos}` : "";
}

function csv(linhas) {
  const escapar = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${linhas.map((l) => l.map(escapar).join(",")).join("\r\n")}\r\n`;
}

async function paginar(construir, colunas) {
  const linhas = [];
  for (let from = 0; ; from += 1000) {
    let query = construir(from, from + 999);
    for (const coluna of colunas) query = query.order(coluna, { ascending: true });
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) return linhas;
  }
}

async function main() {
  const etapas = await paginar(
    (from, to) =>
      supabase.from("dim_pipeline_stages").select("stage_id, stage_order, stage_name").range(from, to),
    ["stage_id"],
  );
  const ordemDaEtapa = new Map(etapas.map((e) => [e.stage_id, e.stage_order]));

  const oportunidades = await paginar(
    (from, to) =>
      supabase
        .from("ghl_opportunities")
        .select("contact_id, stage_id, status, monetary_value, created_at")
        .not("contact_id", "is", null)
        .range(from, to),
    ["id"],
  );

  // Posição = etapa mais avançada que o contato alcançou.
  const porContato = new Map();
  for (const o of oportunidades) {
    const ganho = o.status === "won";
    const daEtapa = ordemDaEtapa.get(o.stage_id) ?? 0;
    const posicao = ganho
      ? Math.max(daEtapa, ORDEM_PAGAMENTO_CONFIRMADO)
      : daEtapa;
    const atual = porContato.get(o.contact_id) ?? {
      posicao: -1,
      ultima: "",
      faturamento: 0,
      ganhou: false,
    };
    atual.ganhou = atual.ganhou || ganho;
    atual.posicao = Math.max(atual.posicao, posicao);
    if (o.created_at > atual.ultima) atual.ultima = o.created_at;
    if (ganho && o.monetary_value > 0) atual.faturamento += Number(o.monetary_value);
    porContato.set(o.contact_id, atual);
  }

  const contatos = await paginar(
    (from, to) =>
      supabase
        .from("ghl_contacts")
        .select("id, first_name, last_name, email, phone, city, uf")
        .range(from, to),
    ["id"],
  );
  const fichaPorId = new Map(contatos.map((c) => [c.id, c]));

  const candidatos = [];
  for (const [contactId, info] of porContato) {
    const ficha = fichaPorId.get(contactId);
    if (!ficha) continue;
    const email = limparEmail(ficha.email);
    const telefone = limparTelefone(ficha.phone);
    if (!email && !telefone) continue; // sem identificador não há como casar
    candidatos.push({ ...info, ficha, email, telefone });
  }

  candidatos.sort(
    (a, b) => b.posicao - a.posicao || b.ultima.localeCompare(a.ultima),
  );

  // Mesmo e-mail/telefone em dois contatos vira uma pessoa só.
  const vistos = new Set();
  const publico = [];
  for (const c of candidatos) {
    const chave = c.email || c.telefone;
    if (vistos.has(chave)) continue;
    if (c.telefone && vistos.has(c.telefone)) continue;
    vistos.add(chave);
    if (c.telefone) vistos.add(c.telefone);
    publico.push(c);
    if (publico.length >= tamanho) break;
  }

  const meta = [["email", "phone", "fn", "ln", "ct", "st", "country", "value"]];
  const google = [["Email", "Phone"]];
  for (const c of publico) {
    meta.push([
      c.email,
      c.telefone,
      limparNome(c.ficha.first_name),
      limparNome(c.ficha.last_name),
      limparCidade(c.ficha.city),
      (c.ficha.uf ?? "").toLowerCase(),
      "br",
      c.faturamento > 0 ? c.faturamento.toFixed(2) : "",
    ]);
    google.push([c.email, c.telefone]);
  }

  fs.mkdirSync(saida, { recursive: true });
  const arquivoMeta = path.join(saida, "publico-meta.csv");
  const arquivoGoogle = path.join(saida, "publico-google.csv");
  fs.writeFileSync(arquivoMeta, csv(meta), "utf8");
  fs.writeFileSync(arquivoGoogle, csv(google), "utf8");

  const clientes = publico.filter((c) => c.ganhou).length;
  const nomeDaEtapa = new Map(etapas.map((e) => [e.stage_order, e.stage_name]));
  const porEtapa = new Map();
  for (const c of publico) {
    porEtapa.set(c.posicao, (porEtapa.get(c.posicao) ?? 0) + 1);
  }
  console.log(`Público: ${publico.length} pessoas`);
  console.log(`  clientes (negócio ganho): ${clientes}`);
  console.log(`  demais:                   ${publico.length - clientes}`);
  console.log("\n  Etapa mais avançada alcançada:");
  for (const [ordem, n] of [...porEtapa].sort((a, b) => b[0] - a[0])) {
    const nome = nomeDaEtapa.get(ordem) ?? "sem etapa";
    console.log(`    ${String(ordem).padStart(2)}  ${nome.padEnd(38)} ${n}`);
  }
  console.log("");
  console.log(`  com e-mail:   ${publico.filter((c) => c.email).length}`);
  console.log(`  com telefone: ${publico.filter((c) => c.telefone).length}`);
  console.log(`\n${arquivoMeta}\n${arquivoGoogle}`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
