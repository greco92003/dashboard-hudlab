import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContactSearchProbes,
  includesPtBrSearch,
  normalizePtBrSearch,
} from "../lib/search/pt-br.ts";

test("normaliza acentos e caixa para busca em português", () => {
  assert.equal(normalizePtBrSearch("  ANGÉLICA   Leal "), "angelica leal");
  assert.equal(normalizePtBrSearch("Conceição"), "conceicao");
});

test("encontra nomes com ou sem acentuação", () => {
  assert.equal(includesPtBrSearch("Angélica Leal", "angelica leal"), true);
  assert.equal(includesPtBrSearch("JOÃO ANTÔNIO", "joao antonio"), true);
  assert.equal(includesPtBrSearch("Mariana Leal", "angelica leal"), false);
});

test("cria sondagens estreitas para recuperar candidatos do GHL", () => {
  const probes = buildContactSearchProbes("angelica leal");
  assert.ok(probes.includes("leal"));
  assert.ok(probes.includes("angélica"));
  assert.ok(probes.includes("ang"));
  assert.ok(probes.includes("ica"));
});
