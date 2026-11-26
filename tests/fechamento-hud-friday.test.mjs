import assert from "node:assert/strict";
import test from "node:test";
import { hudFridayNoAr, mensagemOrcamentoFinal, precosDoPedido } from "../lib/fechamento/mensagens.ts";

const QUINTA = Date.parse("2026-11-26T15:00:00-03:00");
const SEXTA_CEDO = Date.parse("2026-11-27T00:00:00-03:00");
const SEXTA_NOITE = Date.parse("2026-11-27T23:59:00-03:00");
const SABADO = Date.parse("2026-11-28T00:00:00-03:00");

test("a chave só fica no ar na sexta, 27/11, de 00:00 a 23:59", () => {
  assert.equal(hudFridayNoAr(QUINTA), false);
  assert.equal(hudFridayNoAr(SEXTA_CEDO), true);
  assert.equal(hudFridayNoAr(SEXTA_NOITE), true);
  assert.equal(hudFridayNoAr(SABADO), false);
});

test("na sexta, com a chave ligada, 20% no Pix e 15% no cartão em qualquer faixa", () => {
  const casos = [
    [12, 47.9, 50.9],
    [50, 46.3, 49.2],
    [150, 43.9, 46.6],
    [600, 42.3, 44.9],
    [1200, 39.9, 42.4],
  ];
  for (const [pares, pix, cartao] of casos) {
    const o = precosDoPedido({ pares, frete: 0 }, SEXTA_CEDO, { hudFriday: true });
    assert.equal(o.parPix, pix, `${pares} pares no Pix`);
    assert.equal(o.parCartao, cartao, `${pares} pares no cartão`);
    assert.equal(o.promocao, "Hud Friday");
  }
});

test("com a chave desligada, ou fora da sexta, continua a Black", () => {
  assert.equal(precosDoPedido({ pares: 12, frete: 0 }, SEXTA_CEDO).parPix, 53.9);
  const quinta = precosDoPedido({ pares: 12, frete: 0 }, QUINTA, { hudFriday: true });
  assert.equal(quinta.parPix, 53.9);
  assert.equal(quinta.promocao, "Black November");
  assert.equal(precosDoPedido({ pares: 12, frete: 0 }, SABADO, { hudFriday: true }).promocao, "Black November");
});

test("o orçamento da sexta diz Hud Friday, não Black", () => {
  const texto = mensagemOrcamentoFinal(precosDoPedido({ pares: 40, frete: 0 }, SEXTA_CEDO, { hudFriday: true }));
  assert.match(texto, /Hud Friday: só hoje, até meia-noite/);
  assert.doesNotMatch(texto, /Black November/);
});
