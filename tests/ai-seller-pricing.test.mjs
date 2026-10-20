import test from "node:test";
import assert from "node:assert/strict";
import {
  hasFreeShipping,
  nextAdvantagePares,
  subtotalForPares,
  unitPriceForPares,
} from "../lib/ghl/ai-seller/pricing.ts";

test("preço por par segue as faixas do manual", () => {
  assert.equal(unitPriceForPares(12), 59.9);
  assert.equal(unitPriceForPares(23), 59.9);
  assert.equal(unitPriceForPares(24), 57.9);
  assert.equal(unitPriceForPares(99), 57.9);
  assert.equal(unitPriceForPares(100), 54.9);
  assert.equal(unitPriceForPares(499), 54.9);
  assert.equal(unitPriceForPares(500), 52.9);
  assert.equal(unitPriceForPares(999), 52.9);
  assert.equal(unitPriceForPares(1000), 49.9);
});

test("abaixo do mínimo ou quantidade inválida não tem preço", () => {
  assert.equal(unitPriceForPares(11), null);
  assert.equal(unitPriceForPares(0), null);
  assert.equal(unitPriceForPares(12.5), null);
});

test("subtotal pela tabela de 29/09 (Start 59,90; 24-99 a 57,90)", () => {
  assert.equal(subtotalForPares(12), 718.8);
  assert.equal(subtotalForPares(36), 2084.4);
  assert.equal(subtotalForPares(40), 2316);
  assert.equal(subtotalForPares(10), null);
});

test("frete grátis a partir de 36 pares", () => {
  assert.equal(hasFreeShipping(35), false);
  assert.equal(hasFreeShipping(36), true);
});

test("próxima faixa com vantagem só quando está perto (até 30% a mais de pares)", () => {
  // Exemplos da Schay: 20 → 24 (preço) e 30 → 36 (frete grátis).
  assert.equal(nextAdvantagePares(20, 500), 24);
  assert.equal(nextAdvantagePares(30, 500), 36);
  assert.equal(nextAdvantagePares(28, 500), 36);
  assert.equal(nextAdvantagePares(80, 500), 100);
  // Longe demais: oferecer seria empurrar outro pedido.
  assert.equal(nextAdvantagePares(12, 500), null);
  assert.equal(nextAdvantagePares(18, 500), null);
  assert.equal(nextAdvantagePares(26, 500), null);
  // Já na faixa de frete grátis, a próxima é 100 e está longe.
  assert.equal(nextAdvantagePares(40, 500), null);
  // Faixa de pedido grande fica com uma pessoa do time.
  assert.equal(nextAdvantagePares(450, 500), null);
});
