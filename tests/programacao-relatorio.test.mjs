import test from "node:test";
import assert from "node:assert/strict";
import {
  agruparDeals,
  celulasDoDeal,
  colunasDoRelatorio,
  diasDeAtraso,
  estaEmAtraso,
  etapaForaDoPadrao,
  filtrarDeals,
  opcoesDe,
  tipoDoDeal,
} from "../lib/programacao/relatorio.ts";
import { nomeDoRelatorio } from "../lib/programacao/relatorio-pdf.ts";
// Pela constante, e não pelo nome escrito: a etapa já foi renomeada no GHL uma vez.
import { DADOS_EM_CONFERENCIA_STAGE_TITLE } from "../lib/ghl/programacao-stages.ts";

const deal = (id, dataEmbarque, extra = {}) => ({
  id,
  title: `Pedido ${id}`,
  value: 10000,
  currency: "BRL",
  stageTitle: "Produção de Pedidos",
  quantidadePares: "12",
  vendedor: "Ana",
  designer: null,
  dataEmbarque,
  tipoPedido: "Pedido",
  atualizadoEm: null,
  ...extra,
});

const tudo = (deals) => ({
  embarqueDe: "",
  embarqueAte: "",
  incluirSemData: true,
  etapas: new Set(deals.map((item) => item.stageTitle)),
  tipos: new Set(deals.map(tipoDoDeal)),
  vendedores: new Set(deals.map((item) => item.vendedor)),
});

test("o período vale sobre a data de embarque nos dois formatos do GHL", () => {
  const deals = [deal("a", "10/09/2026"), deal("b", "2026-09-20"), deal("c", "05/10/2026"), deal("d", null)];
  const filtros = { ...tudo(deals), embarqueDe: "2026-09-10", embarqueAte: "2026-09-30" };
  assert.deepEqual(filtrarDeals(deals, filtros).map((item) => item.id), ["a", "b", "d"]);
  assert.deepEqual(filtrarDeals(deals, { ...filtros, incluirSemData: false }).map((item) => item.id), ["a", "b"]);
});

test("filtra por etapa, tipo e vendedor", () => {
  const deals = [deal("a", "10/09/2026"), deal("b", "10/09/2026", { vendedor: "Bia", tipoPedido: null })];
  const filtros = tudo(deals);
  assert.deepEqual(opcoesDe(deals, tipoDoDeal), [{ valor: "Pedido", quantidade: 1 }, { valor: "Sem tipo", quantidade: 1 }]);
  assert.deepEqual(filtrarDeals(deals, { ...filtros, vendedores: new Set(["Bia"]) }).map((item) => item.id), ["b"]);
  assert.deepEqual(filtrarDeals(deals, { ...filtros, tipos: new Set(["Pedido"]) }).map((item) => item.id), ["a"]);
});

test("agrupa por embarque em ordem cronológica, com os sem data por último", () => {
  const grupos = agruparDeals([deal("a", null), deal("b", "20/09/2026"), deal("c", "10/09/2026"), deal("d", "10/09/2026", { quantidadePares: "6" })], "embarque");
  assert.deepEqual(grupos.map((grupo) => [grupo.titulo, grupo.pares]), [
    ["Embarque 10/09/2026", 18],
    ["Embarque 20/09/2026", 12],
    ["Sem data de embarque", 12],
  ]);
});

test("nome do arquivo sem acento", () => {
  assert.match(nomeDoRelatorio("Expedição"), /^relatorio-expedicao-\d{4}-\d{2}-\d{2}\.pdf$/);
});

// Datas relativas a hoje em Brasília, no formato do GHL (dd/mm/aaaa).
const diasAPartirDeHoje = (dias) => {
  const agora = new Date();
  const brasilia = new Date(agora.getTime() + agora.getTimezoneOffset() * 60000 - 3 * 3600000);
  brasilia.setDate(brasilia.getDate() + dias);
  const dd = String(brasilia.getDate()).padStart(2, "0");
  const mm = String(brasilia.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${brasilia.getFullYear()}`;
};

test("em atraso segue o board: data vencida, fora de conferência e de recebido", () => {
  const atrasado = deal("a", diasAPartirDeHoje(-5));
  assert.equal(estaEmAtraso(atrasado), true);
  assert.equal(diasDeAtraso(atrasado), 5);

  assert.equal(estaEmAtraso(deal("hoje", diasAPartirDeHoje(0))), false, "embarque hoje ainda não é atraso");
  assert.equal(estaEmAtraso(deal("futuro", diasAPartirDeHoje(3))), false);
  assert.equal(estaEmAtraso(deal("sem-data", null)), false, "sem data não tem como estar atrasado");
  assert.equal(
    estaEmAtraso(deal("conf", diasAPartirDeHoje(-5), { stageTitle: DADOS_EM_CONFERENCIA_STAGE_TITLE })),
    false,
    "em conferência a data ainda é suposta",
  );
  assert.equal(
    estaEmAtraso(deal("rec", diasAPartirDeHoje(-5), { stageTitle: "Recebido Pedido" })),
    false,
    "recebido chegou, não está atrasado",
  );
  assert.equal(estaEmAtraso(deal("exp", diasAPartirDeHoje(-2), { stageTitle: "Fiscal" })), true, "vale na expedição também");
});

test("filtro rápido de atraso combina com os demais e ignora 'incluir sem data'", () => {
  const deals = [
    deal("a", diasAPartirDeHoje(-10)),
    deal("b", diasAPartirDeHoje(-1), { vendedor: "Bia" }),
    deal("c", diasAPartirDeHoje(4)),
    deal("d", null),
  ];
  const filtros = { ...tudo(deals), soAtrasados: true, incluirSemData: true };
  assert.deepEqual(filtrarDeals(deals, filtros).map((item) => item.id), ["a", "b"]);
  assert.deepEqual(filtrarDeals(deals, { ...filtros, vendedores: new Set(["Bia"]) }).map((item) => item.id), ["b"]);
});

test("conferência e recebido abrem desmarcados", () => {
  assert.equal(etapaForaDoPadrao(DADOS_EM_CONFERENCIA_STAGE_TITLE), true);
  assert.equal(etapaForaDoPadrao("Recebido Pedido"), true);
  assert.equal(etapaForaDoPadrao("Recebido Amostra"), true);
  assert.equal(etapaForaDoPadrao("Produção de Pedidos"), false);
  assert.equal(etapaForaDoPadrao("Fiscal"), false);
});

test("prévia e PDF saem das mesmas colunas: atraso e valor entram e saem juntos com a célula", () => {
  const atrasado = deal("a", diasAPartirDeHoje(-1));
  const semNada = colunasDoRelatorio({ mostrarValor: false, mostrarAtraso: false });
  assert.deepEqual(semNada.map((c) => c.chave), ["embarque", "pedido", "tipo", "etapa", "vendedor", "pares"]);

  const tudoLigado = colunasDoRelatorio({ mostrarValor: true, mostrarAtraso: true });
  assert.deepEqual(tudoLigado.map((c) => c.chave), ["embarque", "atraso", "pedido", "tipo", "etapa", "vendedor", "pares", "valor"]);

  const celulas = celulasDoDeal(atrasado, tudoLigado);
  assert.equal(celulas.length, tudoLigado.length);
  assert.equal(celulas[1], "1 dia");
  assert.ok(celulas[7].startsWith("R$") && celulas[7].endsWith("100,00"), `valor formatado: ${celulas[7]}`);
});
