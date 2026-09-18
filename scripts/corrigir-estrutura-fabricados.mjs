// Conserta a estrutura dos produtos fabricados criados pelo Cadastro ERP.
//
// A API v2 do Tiny, usada para marcar as variações como Fabricadas, grava a
// estrutura arredondada em duas casas. Consumo de 0,0010 por par — etiqueta
// térmica e PVC Mônaco — virava zero, então o Tiny nunca baixou esses
// materiais do estoque nas ordens de produção já rodadas. A v3 aceita o valor
// cheio (confirmado em 18/09/2026), e é por ela que a estrutura é reescrita.
//
// Só mexe em componente que está zerado, copiando o valor do cloner
// correspondente. Nenhum outro componente é tocado.
//
// Uso:
//   node scripts/corrigir-estrutura-fabricados.mjs            (levantamento, não grava)
//   node scripts/corrigir-estrutura-fabricados.mjs --aplicar  (corrige no Tiny)
//
// A lista de produtos dos pedidos fica em cache local, porque a varredura leva
// minutos e o Tiny limita as chamadas. Apague node_modules/.cache para refazer.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const APLICAR = process.argv.includes("--aplicar");
const V3 = "https://api.tiny.com.br/public-api/v3";
const OAUTH = "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token";
const PAUSA_MS = 700;
const CACHE = "node_modules/.cache/estrutura-fabricados.json";
const CLONERS = ["Chinelo Slide CLONER", "Chinelo Slide Infantil CLONER"];

const obrigatorias = ["NEXT_PUBLIC_SUPABASE_URL", "DASHBOARD_SECRET", "TINY_CLIENT_ID", "TINY_CLIENT_SECRET"];
const faltando = obrigatorias.filter((nome) => !process.env[nome]);
if (faltando.length > 0) {
  console.error(`Faltam variáveis no .env.local: ${faltando.join(", ")}`);
  process.exit(1);
}

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.DASHBOARD_SECRET;
const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** O refresh token do Tiny rotaciona a cada uso: o novo volta para o Supabase. */
async function acessoTiny() {
  const linhas = await (await fetch(`${SUPABASE}/rest/v1/system_config?key=eq.tiny_refresh_token&select=value`, {
    headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` },
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
      headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ value: dados.refresh_token, updated_at: new Date().toISOString() }),
    });
  }
  return dados.access_token;
}

let token;

/** O Tiny devolve 429 com frequência nessa varredura: espera o que ele pedir. */
function esperaDo429(resposta, tentativa) {
  const cabecalho = Number(resposta.headers.get("retry-after") ?? resposta.headers.get("x-ratelimit-reset"));
  const pedido = Number.isFinite(cabecalho) && cabecalho > 0 ? Math.ceil(cabecalho * 1_000) : 0;
  return Math.min(65_000, Math.max(pedido, 5_000 * 2 ** tentativa));
}

async function api(caminho, opcoes = {}) {
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    const resposta = await fetch(`${V3}${caminho}`, {
      ...opcoes,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    await espera(PAUSA_MS);
    if (resposta.status === 429) {
      await espera(esperaDo429(resposta, tentativa));
      continue;
    }
    if (resposta.status === 401) {
      // Varredura longa: o access token expira no meio do caminho.
      token = await acessoTiny();
      continue;
    }
    if (resposta.status === 204) return null;
    const texto = await resposta.text();
    if (!resposta.ok) throw new Error(`${opcoes.method ?? "GET"} ${caminho} → ${resposta.status}: ${texto.slice(0, 200)}`);
    return texto ? JSON.parse(texto) : null;
  }
  throw new Error(`${caminho}: excesso de 429 do Tiny.`);
}

/**
 * A leitura dos pedidos leva minutos e não muda nada no Tiny: fica em cache
 * para que uma nova rodada (ou o --aplicar) comece da estrutura dos produtos.
 */
function lerCache() {
  try {
    const dados = JSON.parse(readFileSync(CACHE, "utf8"));
    return new Map(dados.produtos.map(([id, info]) => [Number(id), info]));
  } catch {
    return null;
  }
}

function gravarCache(produtos) {
  try {
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, JSON.stringify({ gravadoEm: new Date().toISOString(), produtos: [...produtos] }));
  } catch (erro) {
    console.warn(`Não consegui gravar o cache: ${erro.message}`);
  }
}

const normalizar = (texto) => (texto ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const ehInfantil = (descricao) => /infantil/i.test(descricao ?? "");
const numero = (valor) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);

/** Consumo por par de cada material, no cloner adulto e no infantil. */
async function lerReferencia() {
  const referencia = { adulto: new Map(), infantil: new Map() };
  for (const nome of CLONERS) {
    const busca = await api(`/produtos?nome=${encodeURIComponent(nome)}&limit=100`);
    for (const item of busca.itens ?? []) {
      if (item.tipo !== "F") continue;
      const alvo = ehInfantil(item.descricao) ? referencia.infantil : referencia.adulto;
      const ficha = await api(`/produtos/${item.id}/fabricado`);
      for (const componente of ficha.produtos ?? []) {
        const chave = normalizar(componente.produto?.descricao);
        const quantidade = numero(componente.quantidade);
        // Sola e caixa mudam por cor/tamanho; interessa o maior valor visto
        // de cada material, que é o consumo por par cadastrado no cloner.
        if (chave && quantidade > (alvo.get(chave) ?? 0)) alvo.set(chave, quantidade);
      }
    }
  }
  return referencia;
}

/** Produtos fabricados que apareceram em pedidos criados pelo Cadastro ERP. */
async function lerProdutosDosPedidos() {
  const produtos = new Map();
  let offset = 0;
  let total = Infinity;
  const pedidos = [];

  while (offset < total) {
    const pagina = await api(`/pedidos?limit=100&offset=${offset}&orderBy=desc`);
    total = pagina.paginacao?.total ?? 0;
    for (const item of pagina.itens ?? []) {
      if ((item.ecommerce?.numeroPedidoEcommerce ?? "").startsWith("GHL-")) pedidos.push(item.id);
    }
    offset += 100;
    if (!pagina.itens?.length) break;
  }
  console.log(`Pedidos do Cadastro ERP encontrados: ${pedidos.length} (de ${total} no Tiny).`);

  for (const [indice, id] of pedidos.entries()) {
    if (indice % 25 === 0) process.stdout.write(`  lendo pedidos… ${indice}/${pedidos.length}\r`);
    const pedido = await api(`/pedidos/${id}`);
    for (const item of pedido.itens ?? []) {
      const produtoId = item.produto?.id;
      const quantidade = numero(item.quantidade);
      if (!produtoId || quantidade <= 0) continue;
      if (/livro digital/i.test(item.produto?.descricao ?? "")) continue;
      const atual = produtos.get(produtoId) ?? { descricao: item.produto?.descricao ?? "", pares: 0 };
      atual.pares += quantidade;
      produtos.set(produtoId, atual);
    }
  }
  console.log(`\nProdutos distintos nesses pedidos: ${produtos.size}.`);
  return produtos;
}

async function main() {
  token = await acessoTiny();
  const referencia = await lerReferencia();
  console.log(
    `Referência do cloner: ${referencia.adulto.size} materiais (adulto), ${referencia.infantil.size} (infantil).`,
  );

  const cache = lerCache();
  const produtos = cache ?? await lerProdutosDosPedidos();
  if (cache) console.log(`Produtos lidos do cache local: ${produtos.size}.`);
  else gravarCache(produtos);
  const faltante = new Map();
  const corrigidos = [];
  const semReferencia = [];

  for (const [indice, [id, info]] of [...produtos.entries()].entries()) {
    if (indice % 25 === 0) process.stdout.write(`  conferindo estruturas… ${indice}/${produtos.size}\r`);
    let ficha;
    try {
      ficha = await api(`/produtos/${id}/fabricado`);
    } catch {
      continue; // Produto comprado, não fabricado: não tem ficha.
    }
    const componentes = ficha.produtos ?? [];
    if (componentes.length === 0) continue;

    const mapa = ehInfantil(info.descricao) ? referencia.infantil : referencia.adulto;
    const reserva = ehInfantil(info.descricao) ? referencia.adulto : referencia.infantil;
    let mudou = false;
    const novos = componentes.map((componente) => {
      const quantidade = numero(componente.quantidade);
      const nome = componente.produto?.descricao?.trim() ?? "";
      if (quantidade > 0) return { produto: { id: componente.produto?.id, tipo: "P" }, quantidade };

      const correto = mapa.get(normalizar(nome)) ?? reserva.get(normalizar(nome)) ?? 0;
      if (correto <= 0) {
        semReferencia.push(`${info.descricao} · ${nome}`);
        return { produto: { id: componente.produto?.id, tipo: "P" }, quantidade };
      }
      mudou = true;
      const perdido = faltante.get(nome) ?? { porPar: correto, total: 0, produtos: 0 };
      perdido.total += correto * info.pares;
      perdido.produtos += 1;
      faltante.set(nome, perdido);
      return { produto: { id: componente.produto?.id, tipo: "P" }, quantidade: correto };
    });

    if (!mudou) continue;
    corrigidos.push({ id, descricao: info.descricao, pares: info.pares });
    if (APLICAR) {
      await api(`/produtos/${id}/fabricado`, {
        method: "PUT",
        body: JSON.stringify({ produtos: novos, etapas: ficha.etapas ?? [] }),
      });
    }
  }

  console.log(`\n\n${APLICAR ? "CORRIGIDOS" : "A CORRIGIR"}: ${corrigidos.length} produtos.`);
  console.log("\nMaterial não baixado do estoque (consumo por par × pares vendidos):");
  for (const [nome, dados] of [...faltante.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(
      `  ${nome.padEnd(42)} ${dados.porPar.toLocaleString("pt-BR", { minimumFractionDigits: 4 })} × pares`
      + ` = ${dados.total.toLocaleString("pt-BR", { minimumFractionDigits: 4 })} em ${dados.produtos} produto(s)`,
    );
  }
  if (semReferencia.length > 0) {
    console.log(`\nComponentes zerados sem valor no cloner (${semReferencia.length}), deixados como estão:`);
    for (const linha of [...new Set(semReferencia)].slice(0, 20)) console.log(`  ${linha}`);
  }
  if (!APLICAR) console.log("\nNada foi gravado. Rode com --aplicar para corrigir no Tiny.");
}

main().catch((erro) => {
  console.error(`\nFalhou: ${erro.message}`);
  process.exit(1);
});
