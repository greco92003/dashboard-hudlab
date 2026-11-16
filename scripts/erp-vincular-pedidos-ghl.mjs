// Preenche erp_pedidos_venda (negócio do GHL → pedido de venda no Tiny) com os
// pedidos que o Cadastro ERP já criou.
//
// O Cadastro ERP grava "GHL-<deal>" no número de e-commerce e o Tiny copia
// para a ordem de compra. Ao faturar ou editar o pedido na tela do Tiny, o
// e-commerce é apagado; a ordem de compra sobrevive, mas a API não filtra por
// ela. Este script lê os dois campos e grava o vínculo de uma vez.
//
// Uso:
//   node scripts/erp-vincular-pedidos-ghl.mjs            (levantamento, não grava)
//   node scripts/erp-vincular-pedidos-ghl.mjs --aplicar  (grava os vínculos que faltam)
//
// Só insere vínculos novos: o que já está na tabela não é tocado. Um negócio
// pode ter vários pedidos (recompra/lotes); eles são listados para conferência.
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const APLICAR = process.argv.includes("--aplicar");
const V3 = "https://api.tiny.com.br/public-api/v3";
const OAUTH = "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token";
const PAUSA_MS = 700;
/** Primeiro pedido criado pelo Cadastro ERP (feat de 13/08/2026). Pedidos anteriores não têm GHL. */
const INICIO = "2026-08-01";

const obrigatorias = ["NEXT_PUBLIC_SUPABASE_URL", "DASHBOARD_SECRET", "TINY_CLIENT_ID", "TINY_CLIENT_SECRET"];
const faltando = obrigatorias.filter((nome) => !process.env[nome]);
if (faltando.length > 0) {
  console.error(`Faltam variáveis no .env.local: ${faltando.join(", ")}`);
  process.exit(1);
}

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.DASHBOARD_SECRET;
const cabecalhoSupabase = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json" };
const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** O refresh token do Tiny rotaciona a cada uso: o novo volta para o Supabase. */
async function acessoTiny() {
  const linhas = await (await fetch(`${SUPABASE}/rest/v1/system_config?key=eq.tiny_refresh_token&select=value`, {
    headers: cabecalhoSupabase,
  })).json();
  const refresh = linhas[0]?.value ?? process.env.TINY_REFRESH_TOKEN;
  if (!refresh) throw new Error("Sem refresh token do Tiny. Reconecte em /financial-dashboard.");

  const resposta = await fetch(OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: process.env.TINY_CLIENT_ID,
      client_secret: process.env.TINY_CLIENT_SECRET,
    }),
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(`Refresh do Tiny falhou: ${dados.error_description ?? resposta.status}`);
  if (dados.refresh_token) {
    await fetch(`${SUPABASE}/rest/v1/system_config?key=eq.tiny_refresh_token`, {
      method: "PATCH",
      headers: { ...cabecalhoSupabase, Prefer: "return=minimal" },
      body: JSON.stringify({ value: dados.refresh_token, updated_at: new Date().toISOString() }),
    });
  }
  return dados.access_token;
}

let token;
async function api(caminho) {
  token ??= await acessoTiny();
  for (let tentativa = 0; tentativa < 6; tentativa += 1) {
    const resposta = await fetch(`${V3}${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
    if (resposta.status === 429) {
      // Mesma regra de lib/tiny/rate-limit.ts: Retry-After/X-RateLimit-Reset, senão 10 s dobrando.
      const cabecalho = Math.max(Number(resposta.headers.get("retry-after")) || 0, Number(resposta.headers.get("x-ratelimit-reset")) || 0) * 1000;
      const pausa = Math.min(65_000, Math.max(cabecalho, 10_000 * 2 ** tentativa));
      process.stdout.write(`\n  Tiny pediu pausa: ${Math.round(pausa / 1000)} s\n`);
      await espera(pausa);
      continue;
    }
    if (!resposta.ok) throw new Error(`Tiny ${caminho} → HTTP ${resposta.status}: ${(await resposta.text()).slice(0, 200)}`);
    return resposta.json();
  }
  throw new Error(`Tiny ${caminho}: limite de chamadas não liberou.`);
}

const dealDe = (valor) => (valor ?? "").trim().match(/^GHL-(.+)$/)?.[1] ?? null;

async function vinculosExistentes() {
  const resposta = await fetch(`${SUPABASE}/rest/v1/erp_pedidos_venda?select=tiny_pedido_id`, { headers: cabecalhoSupabase });
  if (!resposta.ok) {
    const texto = (await resposta.text()).slice(0, 200);
    if (!APLICAR && /does not exist|PGRST205/.test(texto)) {
      console.log("Tabela erp_pedidos_venda ainda não existe (aplique supabase/migrations/erp_pedidos_venda.sql). Levantamento segue como se estivesse vazia.");
      return new Set();
    }
    throw new Error(`Supabase erp_pedidos_venda → HTTP ${resposta.status}: ${texto}`);
  }
  const linhas = await resposta.json();
  return new Set(linhas.map((l) => Number(l.tiny_pedido_id)));
}

async function listarPedidos() {
  const pedidos = [];
  let offset = 0;
  while (true) {
    const pagina = await api(`/pedidos?limit=100&offset=${offset}&orderBy=desc&dataInicial=${INICIO}`);
    const itens = pagina.itens ?? [];
    pedidos.push(...itens);
    offset += 100;
    if (itens.length < 100) break;
    await espera(PAUSA_MS);
  }
  return pedidos;
}

async function main() {
  const existentes = await vinculosExistentes();
  const pedidos = await listarPedidos();
  console.log(`Pedidos no Tiny desde ${INICIO}: ${pedidos.length}. Vínculos já gravados: ${existentes.size}.`);

  const novos = [];
  const semEcommerce = { total: 0, porSituacao: {} };
  let abertos = 0;
  for (const item of pedidos) {
    if (Number(item.situacao) === 2 || existentes.has(item.id)) continue;
    let dealId = dealDe(item.ecommerce?.numeroPedidoEcommerce);
    if (!dealId) {
      // A lista não traz a ordem de compra: só o detalhe.
      abertos += 1;
      if (abertos % 10 === 0) process.stdout.write(`  abrindo pedidos sem e-commerce… ${abertos}\r`);
      const detalhe = await api(`/pedidos/${item.id}`);
      await espera(PAUSA_MS);
      dealId = dealDe(detalhe.numeroOrdemCompra);
      if (!dealId) continue;
      semEcommerce.total += 1;
      semEcommerce.porSituacao[item.situacao] = (semEcommerce.porSituacao[item.situacao] ?? 0) + 1;
    }
    novos.push({
      deal_id: dealId,
      tiny_pedido_id: item.id,
      numero_pedido: String(item.numeroPedido ?? item.id),
      cliente: item.cliente?.nome?.trim() || null,
      origem: "script",
    });
  }

  console.log(`\nPedidos do GHL que perderam o e-commerce (só com ordem de compra): ${semEcommerce.total}`, semEcommerce.porSituacao);
  console.log(`Vínculos a gravar: ${novos.length}`);
  for (const novo of novos) console.log(`  ${novo.numero_pedido}  ${novo.deal_id}  ${novo.cliente ?? "-"}`);

  const porNegocio = new Map();
  for (const novo of novos) porNegocio.set(novo.deal_id, [...(porNegocio.get(novo.deal_id) ?? []), novo.numero_pedido]);
  const repetidos = [...porNegocio].filter(([, numeros]) => numeros.length > 1);
  if (repetidos.length > 0) {
    console.log(`\nNegócios com mais de um pedido ativo (recompra/lotes — o talão usa o mais novo): ${repetidos.length}`);
    for (const [dealId, numeros] of repetidos) console.log(`  ${dealId}  pedidos ${numeros.join(", ")}`);
  }

  if (!APLICAR || novos.length === 0) {
    if (!APLICAR) console.log("\nLevantamento apenas. Rode com --aplicar para gravar.");
    return;
  }
  const resposta = await fetch(`${SUPABASE}/rest/v1/erp_pedidos_venda?on_conflict=tiny_pedido_id`, {
    method: "POST",
    headers: { ...cabecalhoSupabase, Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(novos),
  });
  if (!resposta.ok) throw new Error(`Gravação falhou → HTTP ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
  console.log(`\nGravados ${novos.length} vínculos.`);
}

main().catch((erro) => {
  console.error(erro.message ?? erro);
  process.exit(1);
});
