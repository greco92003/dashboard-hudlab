import { buildTinyProductFromCloner } from "../lib/erp/tiny-product-cloner.ts";
import { mergeTinyCreatedProductResponse } from "../lib/erp/tiny-created-product.ts";
import {
  buildTinyV2ManufacturedProduct,
  prepareTinyManufacturedVariations,
} from "../lib/erp/tiny-manufacturing-payload.ts";

const clonerId = Number(process.argv[2]);
const contactId = Number(process.argv[3]);
const liveConfirmed = process.argv.includes("--confirm-live");
if (!Number.isInteger(clonerId) || !Number.isInteger(contactId) || !liveConfirmed) {
  throw new Error(
    "Uso: node scripts/test-tiny-order-weight.mjs <clonerId> <contactId> --confirm-live (cria produto e pedido reais)",
  );
}

const v2Base = process.env.TINY_BASE_URL ?? "https://api.tiny.com.br/api2";
const v3Base = "https://api.tiny.com.br/public-api/v3";

async function v2(path, params = {}) {
  const response = await fetch(`${v2Base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({
      token: process.env.TINY_TOKEN,
      formato: "JSON",
      ...params,
    }),
  });
  const data = await response.json();
  if (!response.ok || data.retorno?.status !== "OK") {
    const errors = data.retorno?.erros?.map((item) => item.erro).filter(Boolean).join("; ");
    throw new Error(errors || `Tiny v2 ${path} falhou (HTTP ${response.status}).`);
  }
  return data.retorno;
}

async function oauthToken() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.DASHBOARD_SECRET;
  const tokenRows = await fetch(
    `${supabaseUrl}/rest/v1/system_config?key=eq.tiny_refresh_token&select=value`,
    { headers: { apikey: serviceKey } },
  ).then((response) => response.json());
  const refreshToken = tokenRows?.[0]?.value ?? process.env.TINY_REFRESH_TOKEN;
  const response = await fetch(
    "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.TINY_CLIENT_ID,
        client_secret: process.env.TINY_CLIENT_SECRET,
      }),
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "Falha no OAuth do Tiny.");
  if (data.refresh_token) {
    await fetch(`${supabaseUrl}/rest/v1/system_config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        key: "tiny_refresh_token",
        value: data.refresh_token,
        description: "Tiny ERP OAuth2 refresh token (auto-renovado pelo sistema)",
      }),
    });
  }
  return data.access_token;
}

const accessToken = await oauthToken();
async function v3(path, options = {}) {
  const response = await fetch(`${v3Base}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    throw new Error(`Tiny v3 ${path} falhou (HTTP ${response.status}): ${(await response.text()).slice(0, 400)}`);
  }
  return response.status === 204 ? undefined : response.json();
}

const parent = await v3(`/produtos/${clonerId}`);
if (parent.tipo !== "V" || parent.produtoPai?.id || !/cloner/i.test(parent.descricao ?? "")) {
  throw new Error("O ID informado não é um produto-cloner pai válido.");
}

const variations = [];
for (const variation of parent.variacoes ?? []) {
  const detail = await v3(`/produtos/${variation.id}`);
  let production = detail.producao;
  if (detail.tipo === "F" && !production?.produtos?.length && !production?.etapas?.length) {
    production = await v3(`/produtos/${variation.id}/fabricado`);
  }
  variations.push({
    ...variation,
    ...detail,
    grade: detail.grade ?? variation.grade,
    producao: production,
  });
}
const cloner = { ...parent, variacoes: variations };
const stamp = Date.now().toString(36).toUpperCase();
const sku = `TSTPESO-${stamp}`;
const title = `TESTE PESO API ${stamp}`;
const draft = buildTinyProductFromCloner({
  cloner,
  title,
  baseSku: sku,
  unitPrice: 1,
});
const created = await v3("/produtos", { method: "POST", body: draft });
const product = mergeTinyCreatedProductResponse(draft, created);
const prepared = prepareTinyManufacturedVariations(product, cloner, 1);
const manufacturedPayload = {
  produtos: prepared.pairs.map((pair, index) =>
    buildTinyV2ManufacturedProduct(pair, index + 1)),
};
await v2("/produto.alterar.php", { produto: JSON.stringify(manufacturedPayload) });

const checkedVariations = [];
for (const variation of product.variacoes ?? []) {
  const returned = await v2("/produto.obter.php", { id: String(variation.id) });
  checkedVariations.push({
    id: Number(variation.id),
    sku: variation.sku,
    net: Number(returned.produto?.peso_liquido ?? 0),
    gross: Number(returned.produto?.peso_bruto ?? 0),
  });
}
if (checkedVariations.some((variation) => variation.net <= 0 || variation.gross <= 0)) {
  throw new Error(`Alguma variação ficou sem peso: ${JSON.stringify(checkedVariations)}`);
}

const contact = (await v2("/contato.obter.php", { id: String(contactId) })).contato;
const item = checkedVariations[0];
const ecommerceNumber = `TESTE-PESO-${stamp}`;
const date = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
}).format(new Date());
const order = {
  data_pedido: date,
  data_prevista: date,
  cliente: {
    nome: (contact.nome || "TESTE").slice(0, 30),
    tipo_pessoa: contact.tipo_pessoa || "F",
    cpf_cnpj: contact.cpf_cnpj || "",
    endereco: contact.endereco || "",
    numero: contact.numero || "",
    bairro: contact.bairro || "",
    cep: contact.cep || "",
    cidade: contact.cidade || "",
    uf: contact.uf || "RS",
    pais: contact.pais || "Brasil",
    atualizar_cliente: "N",
  },
  itens: [{ item: {
    id_produto: item.id,
    codigo: item.sku,
    descricao: title,
    unidade: "PR",
    quantidade: "1.00",
    valor_unitario: "1.00",
  } }],
  nome_natureza_operacao: "Remessa de Amostra Grátis",
  valor_frete: "0.00",
  numero_pedido_ecommerce: ecommerceNumber,
  situacao: "Aberto",
  obs: "TESTE AUTOMATIZADO DA CORREÇÃO DE PESO — não faturar.",
};
const orderResult = await v2("/pedido.incluir.php", {
  pedido: JSON.stringify({ pedido: order }),
});
const records = Array.isArray(orderResult.registros)
  ? orderResult.registros
  : [orderResult.registros];
const orderId = Number(records[0]?.registro?.id);
if (!orderId) throw new Error("O Tiny aceitou o pedido, mas não retornou o ID.");

const pdv = await v2("/pdv.pedido.obter.php", { id: String(orderId) });
const grossWeight = Number(pdv.pedido?.pesoBruto ?? 0);
const netWeight = Number(pdv.pedido?.pesoLiquido ?? 0);
if (grossWeight <= 0) {
  throw new Error(`Pedido ${orderId} foi criado, mas retornou peso bruto ${grossWeight}.`);
}

console.log(JSON.stringify({
  product: { id: Number(created.id), sku, title },
  variation: item,
  order: {
    id: orderId,
    number: records[0]?.registro?.numero ?? null,
    ecommerceNumber,
    netWeight,
    grossWeight,
  },
}, null, 2));
