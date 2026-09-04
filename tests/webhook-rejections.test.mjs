import test from "node:test";
import assert from "node:assert/strict";
import { impressaoDaAutorizacao } from "../lib/security/webhook-verification.ts";

test("sem cabecalho, registra so a ausencia", () => {
  assert.deepEqual(impressaoDaAutorizacao(null), {
    autorizacao_presente: false,
  });
});

test("o token recebido NUNCA aparece no que e gravado", () => {
  const segredo = "Bearer super-secreto-do-ghl-123456";
  const impressao = impressaoDaAutorizacao(segredo);
  const serializado = JSON.stringify(impressao);

  assert.ok(!serializado.includes(segredo));
  assert.ok(!serializado.includes("super-secreto"));
  assert.ok(!serializado.includes("123456"));
});

test("hash e estavel e distingue tokens diferentes", () => {
  const a = impressaoDaAutorizacao("Bearer token-a");
  const b = impressaoDaAutorizacao("Bearer token-a");
  const c = impressaoDaAutorizacao("Bearer token-b");

  assert.equal(a.autorizacao_hash, b.autorizacao_hash);
  assert.notEqual(a.autorizacao_hash, c.autorizacao_hash);
  assert.equal(a.autorizacao_hash.length, 12);
});

test("guarda o tamanho, que ajuda a diferenciar token trocado de ausente", () => {
  const impressao = impressaoDaAutorizacao("Bearer abc");
  assert.equal(impressao.autorizacao_presente, true);
  assert.equal(impressao.autorizacao_tamanho, "Bearer abc".length);
});
