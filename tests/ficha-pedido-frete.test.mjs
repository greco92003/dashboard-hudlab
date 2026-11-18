import assert from "node:assert/strict";
import test from "node:test";
import { escolherFrete, freteBate } from "../lib/ghl/ficha-pedido/frete.ts";

const opcoes = [
  { transportadora: "Braspress", total: 169.43 },
  { transportadora: "Transduarte", total: 160.9 },
];

test("frete da empresa: a mais barata, e o valor dela vira o frete pago pela Hud", () => {
  assert.deepEqual(escolherFrete(opcoes, "Frete Pago pela Empresa (Frete Grátis)", null), {
    transportadora: "Transduarte",
    valorHud: 160.9,
    aviso: null,
  });
});

test("frete do cliente: a transportadora que bate com o valor combinado, sem mexer no valor", () => {
  const r = escolherFrete(opcoes, "Frete Pago pelo Cliente", 169);
  assert.equal(r.transportadora, "Braspress");
  assert.equal(r.valorHud, null);
  assert.equal(r.aviso, null);
});

test("frete do cliente que não bate com nada: a mais barata, com aviso", () => {
  const r = escolherFrete(opcoes, "Frete Pago pelo Cliente", 59);
  assert.equal(r.transportadora, "Transduarte");
  assert.match(r.aviso, /R\$\s?59,00.*Transduarte/);
});

test("tolerância de R$ 1 ou 3%; cotação vazia vira aviso", () => {
  assert.equal(freteBate(60.9, 60), true);
  assert.equal(freteBate(103, 100), true);
  assert.equal(freteBate(104, 100), false);
  assert.equal(escolherFrete([], "Frete Pago pelo Cliente", 59).transportadora, null);
});
