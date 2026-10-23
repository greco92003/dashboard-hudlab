// Monta um lote do convite da Black VIP (23 a 25/10/2026) e aplica a tag do
// lote no GHL, para o Rodrigo só escolher a tag do dia e disparar.
//
// Regras decididas com o usuário em 23/10, etapa por etapa e PELO NOME (a
// ordem numérica das etapas muda quando o time cria etapa nova: "Stand by"
// empurrou "Recebido Pedido" de 22 para 23):
//
//   Lote 1 (sex 23/10): ganho em Recebido Pedido ou em Recebido Amostra.
//   Lote 2 (sáb 24/10): aberto em Atendimento, Negociação ou Prioridade de
//                       Fechamento.
//   Lote 3 (dom 25/10): aberto em Orçamento Gerado, Amostra Digital Enviada ou
//                       Amostra Alterada Enviada; aberto em Cadastro Inicial
//                       com 100 a 1050 pares; e quem tinha tag de lote 1/2 mas
//                       não recebeu (sem campanha_blackvip_enviado).
//
//   Fica fora, em qualquer lote, quem tiver QUALQUER negócio:
//     - ganho fora de Recebido Pedido / Recebido Amostra (pedido pago ainda
//       não entregue: quem acabou de pagar não pode receber a promoção);
//     - aberto em etapa depois do pagamento (Stand by -> Em Trânsito);
//     - aberto em Finalizando Venda;
//     - no pipeline Representantes.
//   E quem já recebeu o convite ou já está em outro lote.
//
// Fonte: deals_cache (atualizado por webhook em segundos), para que quem
// pagou hoje de manhã já saia do lote de hoje. ghl_opportunities entra só
// para o nome da etapa e os pares do Cadastro Inicial.
//
// Uso (rodar na pasta do projeto que tem o .env.local):
//   node scripts/publico-black-vip.mjs --lote 1             (simulação)
//   node scripts/publico-black-vip.mjs --lote 1 --aplicar
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });

const argv = process.argv.slice(2);
const lote = Number(argv[argv.indexOf("--lote") + 1]);
const aplicar = argv.includes("--aplicar");
if (![1, 2, 3].includes(lote)) throw new Error("use --lote 1, 2 ou 3");

for (const nome of ["DATABASE_URL", "GHL_PRIVATE_INTEGRATION_TOKEN"]) {
  if (!process.env[nome]) throw new Error(`${nome} não está configurado`);
}

const TAG = `campanha_blackvip_lote${lote}`;
const POS_PAGAMENTO = [
  "Stand by", "Pagamento Confirmado", "Pagamento Confirmado/Completar Dados",
  "Cadastro ERP", "Cadastro Contas a Receber", "Criar Arquivos Serigrafia",
  "Criar Arquivo Serigrafia", "Arquivo Serigrafia Pronto",
  "Impressão de Fotolitos", "Produção de Amostras", "Produção de Pedidos",
  "Expedição", "Cobrar Saldo", "Aprovar Financeiro Pedido Total", "Fiscal",
  "Coleta", "Em Trânsito (Link Rastreio)",
];

const SQL = `
  WITH etapa AS (
    SELECT DISTINCT ON (stage_id) stage_id, stage_name, pipeline_name
    FROM ghl_opportunities
    WHERE stage_id IS NOT NULL
    ORDER BY stage_id, synced_at DESC
  ),
  negocio AS (
    SELECT dc.contact_id, dc.status, e.stage_name, e.pipeline_name,
           public.ghl_deal_ganho(dc.status, dc.pipeline_id, dc.stage_id, dc.value) AS ganho
    FROM deals_cache dc
    LEFT JOIN etapa e USING (stage_id)
    WHERE dc.source_system = 'ghl' AND dc.sync_status = 'synced' AND dc.contact_id IS NOT NULL
  ),
  pares AS (
    SELECT o.contact_id, MAX(COALESCE(o.qty_pares, c.qty_pares)) AS pares
    FROM ghl_opportunities o
    LEFT JOIN ghl_contacts c ON c.id = o.contact_id
    WHERE o.status = 'open' AND o.stage_name = 'Cadastro Inicial'
    GROUP BY 1
  ),
  tag AS (
    SELECT contact_id,
      BOOL_OR(tag = 'campanha_blackvip_enviado') AS recebeu,
      BOOL_OR(tag IN ('campanha_blackvip_lote1','campanha_blackvip_lote2')) AS lote_anterior,
      BOOL_OR(tag = 'campanha_blackvip_lote3') AS lote3
    FROM ghl_contact_tags
    WHERE tag LIKE 'campanha\\_blackvip\\_%'
    GROUP BY 1
  ),
  por AS (
    SELECT n.contact_id,
      BOOL_OR(n.ganho AND n.stage_name IN ('Recebido Pedido','Recebido Amostra')) AS g1,
      BOOL_OR(n.status = 'open' AND NOT n.ganho AND n.pipeline_name = 'Atendimento'
              AND n.stage_name IN ('Atendimento','Negociação','Prioridade de Fechamento')) AS g2,
      BOOL_OR(n.status = 'open' AND NOT n.ganho AND n.pipeline_name = 'Atendimento'
              AND n.stage_name IN ('Orçamento Gerado','Amostra Digital Enviada','Amostra Alterada Enviada')) AS g3,
      BOOL_OR(n.status = 'open' AND NOT n.ganho AND n.pipeline_name = 'Atendimento'
              AND n.stage_name = 'Cadastro Inicial') AS cadastro,
      BOOL_OR(
        (n.ganho AND COALESCE(n.stage_name, '') NOT IN ('Recebido Pedido','Recebido Amostra'))
        OR (n.status = 'open' AND n.stage_name = ANY($1::text[]))
        OR (n.status = 'open' AND n.stage_name = 'Finalizando Venda')
        OR (n.status = 'open' AND n.pipeline_name = 'Representantes')
      ) AS excluido
    FROM negocio n
    GROUP BY 1
  )
  SELECT p.contact_id,
    CASE
      WHEN p.g1 THEN 1
      WHEN p.g2 THEN 2
      WHEN p.g3 OR (p.cadastro AND pa.pares BETWEEN 100 AND 1050) THEN 3
    END AS grupo,
    COALESCE(t.recebeu, false) AS recebeu,
    COALESCE(t.lote_anterior, false) AS lote_anterior,
    COALESCE(t.lote3, false) AS lote3,
    p.excluido
  FROM por p
  LEFT JOIN pares pa USING (contact_id)
  LEFT JOIN tag t USING (contact_id)
`;

const base = (process.env.GHL_API_BASE_URL ?? "https://services.leadconnectorhq.com").replace(/\/$/, "");
const cabecalho = {
  Authorization: `Bearer ${process.env.GHL_PRIVATE_INTEGRATION_TOKEN}`,
  Version: "2021-07-28",
  Accept: "application/json",
  "Content-Type": "application/json",
};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// A conexão direta do Supabase (db.<ref>.supabase.co) só responde por IPv6.
// Em rede sem IPv6 ela dá ETIMEDOUT; o pooler da mesma região aceita IPv4,
// com o usuário no formato postgres.<ref>.
async function conectar() {
  const direta = new URL(process.env.DATABASE_URL);
  const ref = direta.hostname.split(".")[1];
  const tentativas = [process.env.DATABASE_URL];
  for (const host of ["aws-0-sa-east-1.pooler.supabase.com", "aws-1-sa-east-1.pooler.supabase.com"]) {
    const u = new URL(process.env.DATABASE_URL);
    u.hostname = host;
    u.port = "5432";
    u.username = `postgres.${ref}`;
    tentativas.push(u.toString());
  }
  for (const url of tentativas) {
    const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try { await db.connect(); return db; } catch { await db.end().catch(() => {}); }
  }
  throw new Error("não consegui conectar no banco (direto nem pelo pooler)");
}

async function main() {
  const db = await conectar();
  const { rows } = await db.query(SQL, [POS_PAGAMENTO]);
  await db.end();

  const doLote = rows.filter((r) => {
    if (r.excluido || r.recebeu) return false;
    if (lote === 3 && r.lote_anterior) return true; // ficou de fora nos dias anteriores
    if (r.lote_anterior || r.lote3) return false;
    return r.grupo === lote;
  });
  const excluidos = rows.filter((r) => r.grupo === lote && r.excluido).length;

  console.log(`Lote ${lote} (${TAG}): ${doLote.length} contatos`);
  console.log(`  fora por pedido em andamento / Finalizando Venda / Representantes: ${excluidos}`);
  if (lote === 3) console.log(`  dos lotes anteriores, ainda sem convite: ${doLote.filter((r) => r.lote_anterior).length}`);
  if (doLote.length > 1000) console.log("  ATENÇÃO: acima de 1.000, o limite diário do WhatsApp pode cortar o envio");

  if (!aplicar) {
    console.log("\nSimulação. Rode com --aplicar para gravar a tag no GHL.");
    return;
  }

  let ok = 0;
  const falhas = [];
  for (const [i, r] of doLote.entries()) {
    for (let tentativa = 0; ; tentativa++) {
      const res = await fetch(`${base}/contacts/${r.contact_id}/tags`, {
        method: "POST",
        headers: cabecalho,
        body: JSON.stringify({ tags: [TAG] }),
      });
      if (res.status === 429 && tentativa < 4) { await espera(2000 * 2 ** tentativa); continue; }
      if (res.ok) ok++;
      else falhas.push(`${r.contact_id} ${res.status}`);
      break;
    }
    if ((i + 1) % 200 === 0) console.log(`  ${i + 1}/${doLote.length}`);
    await espera(220);
  }
  console.log(`\nTag aplicada: ${ok} de ${doLote.length} | falhas: ${falhas.length}`);
  for (const f of falhas.slice(0, 10)) console.log(`  ${f}`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
