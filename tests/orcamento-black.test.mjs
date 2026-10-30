import test from "node:test";
import assert from "node:assert/strict";
import { bonusDaFaixa, brl, freteDoCampo, orcamentoBlack, paresDoCampo } from "../lib/ghl/orcamento-black/calc.ts";

const par = (pares) => {
  const o = orcamentoBlack(pares, 100);
  return [o.parTabela, o.parCartao, o.parPix, o.pctCartao, o.pctPix];
};

test("as seis faixas batem com a tabela do plano (cartão e PIX)", () => {
  assert.deepEqual(par(12), [59.9, 56.91, 53.91, 5, 10]);
  assert.deepEqual(par(23), [59.9, 56.91, 53.91, 5, 10]);
  assert.deepEqual(par(24), [57.9, 55.01, 52.11, 5, 10]);
  assert.deepEqual(par(36), [57.9, 53.85, 50.95, 7, 12]);
  assert.deepEqual(par(100), [54.9, 49.41, 46.67, 10, 15]);
  assert.deepEqual(par(500), [52.9, 44.97, 42.32, 15, 20]);
  assert.deepEqual(par(1000), [49.9, 42.42, 39.92, 15, 20]);
});

test("exemplo do plano: 50 pares, frete grátis", () => {
  const o = orcamentoBlack(50, 119);
  assert.equal(o.freteGratis, true);
  assert.equal(o.frete, 0);
  assert.equal(o.totalCheio, 2895);
  assert.equal(o.totalCartao, 2692.5);
  assert.equal(o.totalPix, 2547.5);
  assert.equal(
    o.texto,
    [
      "📦 Quantidade: 50 pares",
      "💰 Valor do par: ~R$ 57,90~ *R$ 53,85* em até 6x sem juros (7% OFF)",
      "⚡ No PIX: *R$ 50,95* o par (12% OFF)",
      "🚚 Frete: *GRÁTIS*",
      "💳 Total: ~R$ 2.895,00~ *R$ 2.692,50* em até 6x sem juros ou *R$ 2.547,50* no PIX",
      "🎁 Bônus da sua faixa: arte digital de divulgação + frete grátis",
    ].join("\n"),
  );
});

test("abaixo de 36 pares o frete soma nos três totais", () => {
  const o = orcamentoBlack(25, 119);
  assert.equal(o.freteGratis, false);
  assert.equal(o.subtotalCartao, 1375.25);
  assert.equal(o.totalCartao, 1494.25);
  assert.equal(o.totalPix, 1302.75 + 119);
  assert.equal(o.totalCheio, 1447.5 + 119);
  assert.match(o.texto, /🚚 Frete: R\$ 119,00/);
});

test("sem frete gravado: total sem o frete, e a mensagem avisa", () => {
  const o = orcamentoBlack(20, null);
  assert.equal(o.frete, null);
  assert.equal(o.totalCartao, o.subtotalCartao);
  assert.match(o.texto, /🚚 Frete: a confirmar/);
  assert.match(o.texto, /💳 Total \(sem o frete\):/);
});

test("menos de 12 pares orça 12, como o 02 avisa", () => {
  const o = orcamentoBlack(5, 90);
  assert.equal(o.pares, 12);
  assert.equal(o.subtotalCartao, 682.92);
  assert.equal(orcamentoBlack(null, 90), null);
});

test("bônus que se somam por faixa", () => {
  assert.equal(bonusDaFaixa(12), "arte digital de divulgação");
  assert.equal(bonusDaFaixa(36), "arte digital de divulgação + frete grátis");
  assert.equal(bonusDaFaixa(100), "arte digital de divulgação + frete grátis + fotos de estúdio dos seus slides");
  assert.equal(
    bonusDaFaixa(800),
    "arte digital de divulgação + frete grátis + fotos de estúdio dos seus slides + takes de produção",
  );
});

test("leitura dos campos do GHL", () => {
  assert.equal(paresDoCampo(25), 25);
  assert.equal(paresDoCampo("40"), 40);
  assert.equal(paresDoCampo("abc"), null);
  assert.equal(paresDoCampo(0), null);
  assert.equal(freteDoCampo(119), 119);
  assert.equal(freteDoCampo(""), null);
  assert.equal(freteDoCampo(undefined), null);
  assert.equal(freteDoCampo(0), 0);
  assert.equal(brl(1234567.8), "R$ 1.234.567,80");
});
