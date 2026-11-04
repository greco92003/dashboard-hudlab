import test from "node:test";
import assert from "node:assert/strict";
import { bonusDaFaixa, brl, freteDoCampo, orcamentoBlack, paresDoCampo } from "../lib/ghl/orcamento-black/calc.ts";

const par = (pares) => {
  const o = orcamentoBlack(pares, 100);
  return [o.parTabela, o.parCartao, o.parPix, o.pctCartao, o.pctPix];
};

test("as seis faixas batem com a tabela, arredondadas para baixo na dezena de centavos (cartão e PIX)", () => {
  assert.deepEqual(par(12), [59.9, 56.9, 53.9, 5, 10]);
  assert.deepEqual(par(23), [59.9, 56.9, 53.9, 5, 10]);
  assert.deepEqual(par(24), [57.9, 55, 52.1, 5, 10]);
  assert.deepEqual(par(36), [57.9, 53.8, 50.9, 7, 12]);
  assert.deepEqual(par(100), [54.9, 49.4, 46.6, 10, 15]);
  assert.deepEqual(par(500), [52.9, 44.9, 42.3, 15, 20]);
  assert.deepEqual(par(1000), [49.9, 42.4, 39.9, 15, 20]);
});

test("50 pares, frete grátis: preço normal em cima, Black embaixo, sem subtotal", () => {
  const o = orcamentoBlack(50, 119);
  assert.equal(o.freteGratis, true);
  assert.equal(o.frete, 0);
  assert.equal(o.totalCheio, 2895);
  assert.equal(o.totalCartao, 2690);
  assert.equal(o.totalPix, 2545);
  assert.equal(
    o.texto,
    [
      "📦 *Seu orçamento: 50 pares*",
      "",
      "*Preço normal*",
      "R$ 57,90 o par",
      "Frete: *GRÁTIS*",
      "Total: R$ 2.895,00",
      "",
      "🖤 *Com o desconto da Black*",
      "⚡ PIX à vista (12% OFF): R$ 50,90 o par",
      "Total: *R$ 2.545,00*",
      "",
      "💳 Cartão em até 6x sem juros (7% OFF): R$ 53,80 o par",
      "Total: *R$ 2.690,00* (6x de R$ 448,33)",
      "",
      "🎁 Bônus da sua faixa: arte digital de divulgação + frete grátis",
    ].join("\n"),
  );
});

test("34 pares com frete: subtotal e frete no preço normal, frete somado nos três totais", () => {
  const o = orcamentoBlack(34, 119);
  assert.equal(o.freteGratis, false);
  assert.equal(o.subtotalCartao, 1870);
  assert.equal(o.totalCartao, 1989);
  assert.equal(o.totalPix, 1890.4);
  assert.equal(o.totalCheio, 2087.6);
  assert.equal(
    o.texto,
    [
      "📦 *Seu orçamento: 34 pares*",
      "",
      "*Preço normal*",
      "R$ 57,90 o par",
      "Subtotal: R$ 1.968,60",
      "Frete: R$ 119,00",
      "Total: R$ 2.087,60",
      "",
      "🖤 *Com o desconto da Black*",
      "⚡ PIX à vista (10% OFF): R$ 52,10 o par",
      "Total: *R$ 1.890,40*",
      "",
      "💳 Cartão em até 6x sem juros (5% OFF): R$ 55,00 o par",
      "Total: *R$ 1.989,00* (6x de R$ 331,50)",
      "",
      "🎁 Bônus da sua faixa: arte digital de divulgação",
    ].join("\n"),
  );
});

test("sem frete gravado: cada total termina em + frete, sem parcela e sem subtotal, e a mensagem avisa", () => {
  const o = orcamentoBlack(20, null);
  assert.equal(o.frete, null);
  assert.equal(o.totalCartao, o.subtotalCartao);
  assert.match(o.texto, /Total: R\$ 1\.198,00 \+ frete/);
  assert.match(o.texto, /Total: \*R\$ 1\.078,00\* \+ frete/);
  assert.match(o.texto, /Total: \*R\$ 1\.138,00\* \+ frete\n/);
  assert.doesNotMatch(o.texto, /6x de/);
  assert.doesNotMatch(o.texto, /Subtotal/);
  assert.match(o.texto, /🚚 O frete é calculado pelo seu CEP antes do fechamento\./);
});

test("menos de 12 pares orça 12, como o 02 avisa", () => {
  const o = orcamentoBlack(5, 90);
  assert.equal(o.pares, 12);
  assert.equal(o.subtotalCartao, 682.8);
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
