// Mede o acerto da Cami contra fichas do pedido já preenchidas à mão (só leitura: GHL + OpenAI).
// Uso: node --experimental-strip-types --import ./tests/ts-extension-resolve.mjs scripts/avaliar-ficha-cami.mjs [desde=2026-11-01] [saida.json]
import { registerHooks } from "node:module";
import { writeFileSync } from "node:fs";

// "server-only" é resolvido pelo Next; fora dele vira um módulo vazio.
registerHooks({
  resolve: (s, c, next) => (s === "server-only" ? { url: "data:text/javascript,", shortCircuit: true } : next(s, c)),
});
process.loadEnvFile(".env.local");

const { gerarRascunhoFicha } = await import("../lib/ghl/ficha-pedido/agente.ts");
const { fetchOpportunityById, fetchCustomFieldDefs } = await import("../lib/ghl/api.ts");
const { extractGhlProductModels } = await import("../lib/erp/ghl-product-models.ts");

const desde = process.argv[2] ?? "2026-11-01";
const saida = process.argv[3] ?? null;
const ETAPAS = [
  "Pagamento Confirmado/Completar Dados", "Cadastro ERP", "Impressão de Fotolitos", "Criar Arquivo Serigrafia",
  "Produção de Pedidos", "Expedição", "Aprovar Financeiro Pedido Total", "Cobrar Saldo", "Fiscal", "Coleta",
  "Em Trânsito", "Recebido Pedido",
];

const chaveSb = process.env.DASHBOARD_SECRET;
const filtroEtapas = encodeURIComponent(`(${ETAPAS.map((e) => `"${e}"`).join(",")})`);
const negocios = await (
  await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/deals_cache?select=deal_id,title,stage_title,closing_date&status=eq.won&closing_date=gte.${desde}&stage_title=in.${filtroEtapas}&order=closing_date.desc&limit=200`,
    { headers: { apikey: chaveSb, Authorization: `Bearer ${chaveSb}` } },
  )
).json();

const defs = await fetchCustomFieldDefs("opportunity");
const chavePorId = new Map(defs.map((d) => [d.id, d.fieldKey.split(".").pop()]));
const valorCampo = (e) => {
  for (const [k, v] of Object.entries(e)) if (k.startsWith("fieldValue") && v != null && v !== "") return v;
  return null;
};

function fichaHumana(o) {
  const campos = {};
  for (const e of o.customFields ?? []) {
    const v = valorCampo(e);
    if (v != null) campos[chavePorId.get(e.id)] = v;
  }
  const porNumero = new Map();
  for (const m of extractGhlProductModels(o, defs)) {
    const atual = porNumero.get(m.modelNumber) ?? { soleColor: m.soleColor, artUrl: m.artUrl, adult: {}, child: {} };
    for (const g of m.grades) (g.audience === "infantil" ? atual.child : atual.adult)[g.size] = g.quantity;
    porNumero.set(m.modelNumber, atual);
  }
  const comp = campos.comprovantes_de_pagamento;
  return {
    modelos: [...porNumero.values()],
    pares: Number(campos.nmero_quantidade_de_pares) || null,
    unit: Number(campos.valor_unitario_do_par) || null,
    forma: campos.forma_de_pagamento ?? null,
    frete: campos.condio_de_frete ?? null,
    freteCliente: campos.valor_do_frete_pago_cliente != null ? Number(campos.valor_do_frete_pago_cliente) : null,
    tipo: campos.tipo_do_pedido ?? null,
    bandeira: campos.bandeira_carto ?? null,
    parcelas: campos.parcelamento_carto_de_crdito_vezes != null ? Number(campos.parcelamento_carto_de_crdito_vezes) : null,
    comprovante: Boolean(comp && (!Array.isArray(comp) || comp.length)),
    evento: (String(campos.observao_importante ?? "").match(/evento\s*(\d{1,2})\/(\d{1,2})/i) ?? []).slice(1).map((x) => x.padStart(2, "0")).join("/") || null,
  };
}

const assinatura = (adult, child) => JSON.stringify([Object.entries(adult).sort(), Object.entries(child).sort()]);

async function avaliar(n) {
  const o = await fetchOpportunityById(n.deal_id);
  const humano = fichaHumana(o);
  if (humano.modelos.length === 0) return { n, pulado: "ficha sem grade (ainda não preenchida)" };
  const t0 = Date.now();
  let cami;
  try {
    cami = (await gerarRascunhoFicha(n.deal_id)).rascunho;
  } catch (e) {
    return { n, erro: e.message };
  }
  const segundos = Math.round((Date.now() - t0) / 1000);
  const comConversa = cami.modelos.some((m) => Object.keys(m.adultGrade).length + Object.keys(m.childGrade).length > 0);
  const assH = humano.modelos.map((m) => assinatura(m.adult, m.child));
  const assC = cami.modelos.map((m) => assinatura(m.adultGrade, m.childGrade));
  const restantes = [...assC];
  let gradesCertas = 0, soladosCertos = 0, soladosComparados = 0, artes = 0;
  humano.modelos.forEach((m, i) => {
    const j = restantes.indexOf(assH[i]);
    // Modelos com a mesma grade (ex.: preto e branco) se casam pela arte, depois pela grade.
    const porArte = m.artUrl ? cami.modelos.find((c) => c.artUrl === m.artUrl) : undefined;
    const par = porArte ?? (j >= 0 ? cami.modelos[assC.indexOf(assH[i])] : cami.modelos[i]);
    if (j >= 0) {
      gradesCertas++;
      restantes.splice(j, 1);
    }
    if (par && m.soleColor) {
      soladosComparados++;
      if (par.soleColor === m.soleColor) soladosCertos++;
    }
    if (par?.artUrl) artes++;
  });
  return {
    n,
    linha: {
      nome: o.name, etapa: n.stage_title, segundos, comConversa,
      modelos: [humano.modelos.length, cami.modelos.length],
      grade: [gradesCertas, humano.modelos.length],
      solado: [soladosCertos, soladosComparados],
      arte: [artes, humano.modelos.length],
      pares: [humano.pares, cami.quantityPairs],
      unit: [humano.unit, cami.unitPrice],
      forma: [humano.forma, cami.paymentForm],
      frete: [humano.frete, cami.freightCondition],
      freteCliente: [humano.freteCliente, cami.freightClientValue],
      tipo: [humano.tipo, cami.orderType],
      comprovante: [humano.comprovante, cami.comprovanteUrls.length > 0],
      bandeira: [humano.bandeira, cami.cardBrand],
      parcelas: [humano.parcelas, cami.cardInstallments],
      evento: [humano.evento, cami.observacaoImportante?.replace("EVENTO ", "") ?? null],
      avisos: cami.avisos,
      rascunho: cami,
      humano,
    },
  };
}

// Duas por vez: respeita o limite de rajada do GHL somado às rotinas que já rodam.
const resultados = [];
const fila = [...negocios];
await Promise.all(
  [0, 1].map(async () => {
    while (fila.length) {
      const n = fila.shift();
      resultados.push(await avaliar(n).catch((e) => ({ n, erro: e.message })));
      process.stderr.write(".");
    }
  }),
);

const perto = (a, b) => a != null && b != null && Math.abs(a - b) < 0.02;
const placar = {};
const marcar = (campo, ok) => {
  placar[campo] ??= { ok: 0, total: 0 };
  placar[campo].total++;
  if (ok) placar[campo].ok++;
};
for (const { linha: l } of resultados.filter((r) => r.linha)) {
  const g = l.comConversa ? "" : " [sem dados na conversa]";
  marcar(`modelos (quantidade)${g}`, l.modelos[0] === l.modelos[1]);
  marcar(`grade de cada modelo${g}`, l.grade[0] === l.grade[1]);
  if (l.solado[1]) marcar(`solado${g}`, l.solado[0] === l.solado[1]);
  marcar(`arte aprovada achada${g}`, l.arte[0] === l.arte[1]);
  if (l.pares[0]) marcar(`pares${g}`, l.pares[0] === l.pares[1]);
  if (l.unit[0]) marcar(`valor do par${g}`, perto(l.unit[0], l.unit[1]));
  if (l.forma[0]) marcar(`forma de pagamento${g}`, l.forma[0] === l.forma[1]);
  if (l.frete[0]) marcar(`condição de frete${g}`, l.frete[0] === l.frete[1]);
  if (l.frete[0] === "Frete Pago pelo Cliente" && l.freteCliente[0] != null) marcar(`valor do frete do cliente${g}`, perto(l.freteCliente[0], l.freteCliente[1]));
  if (l.tipo[0]) marcar(`tipo do pedido${g}`, l.tipo[0] === l.tipo[1]);
  if (l.comprovante[0]) marcar(`comprovante achado${g}`, l.comprovante[1]);
  if (l.bandeira[0]) marcar(`bandeira do cartão${g}`, l.bandeira[0] === l.bandeira[1]);
  if (l.evento[0]) marcar(`data do evento (EVENTO dd/mm)${g}`, l.evento[0] === l.evento[1]);
}

console.log(`\n\n== Acerto da Cami contra fichas preenchidas à mão (fechados desde ${desde}) ==`);
for (const [campo, { ok, total }] of Object.entries(placar).sort()) {
  console.log(`${campo.padEnd(52)} ${String(ok).padStart(3)}/${String(total).padEnd(3)} ${Math.round((100 * ok) / total)}%`);
}
console.log("\n== Pedido a pedido ==");
for (const r of resultados) {
  if (!r.linha) {
    console.log(`- ${r.n.title}: ${r.pulado ?? `ERRO ${r.erro}`}`);
    continue;
  }
  const l = r.linha;
  const dif = [];
  if (l.modelos[0] !== l.modelos[1]) dif.push(`modelos ${l.modelos[0]}→${l.modelos[1]}`);
  if (l.grade[0] !== l.grade[1]) dif.push(`grade ${l.grade[0]}/${l.grade[1]}`);
  if (l.solado[1] && l.solado[0] !== l.solado[1]) dif.push(`solado ${l.solado[0]}/${l.solado[1]}`);
  if (l.arte[0] !== l.arte[1]) dif.push(`arte ${l.arte[0]}/${l.arte[1]}`);
  for (const c of ["pares", "unit", "forma", "frete", "freteCliente", "tipo", "bandeira", "evento"]) {
    const [h, m] = l[c];
    if (h == null || h === "") continue;
    if (!(typeof h === "number" ? perto(h, m) : h === m)) dif.push(`${c} ${h}→${m ?? "vazio"}`);
  }
  if (l.comprovante[0] && !l.comprovante[1]) dif.push("comprovante não achado");
  console.log(`- ${l.nome} [${l.etapa}, ${l.segundos}s${l.comConversa ? "" : ", SEM DADOS NA CONVERSA"}]: ${dif.length ? dif.join(" | ") : "tudo igual"}`);
}
if (saida) writeFileSync(saida, JSON.stringify(resultados, null, 2));
