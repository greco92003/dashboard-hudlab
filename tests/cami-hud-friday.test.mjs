import test from "node:test";
import assert from "node:assert/strict";
import { contextoHudFriday, faixaHudFriday, promocaoDoContato } from "../lib/ghl/ai-seller/hud-friday.ts";
import { PROMO_BLACK_NOVEMBER } from "../lib/ghl/orcamento-black/calc.ts";
import { precoComPromocao } from "../lib/ghl/ai-seller/vigentes.ts";

const QUINTA = Date.parse("2026-11-26T20:00:00-03:00");
const SEXTA = Date.parse("2026-11-27T09:00:00-03:00");
const SEXTA_FIM = Date.parse("2026-11-27T23:59:00-03:00");
const SABADO = Date.parse("2026-11-28T00:00:00-03:00");
const RECEBEU = ["campanha_blackhudfriday_enviado"];
const CLICOU = [...RECEBEU, "campanha_blackhudfriday_quero_pedido", "hudfriday_ate99"];

test("orçamento: Hud Friday só na sexta e só para quem recebeu", () => {
  assert.equal(promocaoDoContato(PROMO_BLACK_NOVEMBER, CLICOU, QUINTA), PROMO_BLACK_NOVEMBER);
  assert.equal(promocaoDoContato(PROMO_BLACK_NOVEMBER, CLICOU, SEXTA).nome, "Hud Friday");
  assert.equal(promocaoDoContato(PROMO_BLACK_NOVEMBER, RECEBEU, SEXTA_FIM).nome, "Hud Friday");
  assert.equal(promocaoDoContato(PROMO_BLACK_NOVEMBER, ["lead"], SEXTA), PROMO_BLACK_NOVEMBER);
  assert.equal(promocaoDoContato(PROMO_BLACK_NOVEMBER, CLICOU, SABADO), PROMO_BLACK_NOVEMBER);
  assert.equal(promocaoDoContato(null, null, SEXTA), null);
});

test("preço da Hud Friday: 12 pares a R$ 47,90 no PIX (20%) e R$ 50,90 no cartão (15%)", () => {
  const p = precoComPromocao(12, promocaoDoContato(PROMO_BLACK_NOVEMBER, RECEBEU, SEXTA));
  assert.equal(p.pixUnitario, 47.9);
  assert.equal(p.pixDescontoPct, 20);
  assert.equal(p.descontoPct, 15);
  assert.equal(p.unitario, 50.9);
});

test("contexto: quinta avisa sem antecipar preço, sexta manda usar a ferramenta, sábado some", () => {
  const quinta = contextoHudFriday(CLICOU, QUINTA);
  assert.match(quinta, /amanhã, sexta 27\/11/);
  assert.match(quinta, /12 a 99 pares/);
  assert.match(quinta, /Não calcule nem grave orçamento com a Hud Friday antes de sexta/);
  assert.match(contextoHudFriday(RECEBEU, SEXTA), /Hud Friday HOJE/);
  assert.equal(contextoHudFriday(CLICOU, SABADO), "");
  assert.equal(contextoHudFriday(["lead"], QUINTA), "");
  assert.ok(!/—/.test(quinta + contextoHudFriday(RECEBEU, SEXTA)), "sem travessão");
});

test("faixa pelo botão", () => {
  assert.equal(faixaHudFriday(["hudfriday_100mais"]), "100 pares ou mais");
  assert.equal(faixaHudFriday(RECEBEU), null);
});
