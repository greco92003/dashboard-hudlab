import test from "node:test";
import assert from "node:assert/strict";
import { agruparDeals, filtrarDeals, opcoesDe, tipoDoDeal } from "../lib/programacao/relatorio.ts";
import { nomeDoRelatorio } from "../lib/programacao/relatorio-pdf.ts";

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
