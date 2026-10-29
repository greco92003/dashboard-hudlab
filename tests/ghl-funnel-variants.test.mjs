import test from "node:test";
import assert from "node:assert/strict";
import {
  GHL_FUNNEL_PATHS,
  GHL_FUNNEL_RETIRED,
  GHL_FUNNEL_STAGES,
  GHL_FUNNEL_TITLES,
  GHL_FUNNEL_VARIANT_MARKER,
  GHL_FUNNEL_VARIANTS,
  getGhlFunnelVariant,
  normalizeGhlFunnelStage,
} from "../lib/ghl/funnel.ts";

test("Black November: o webhook reconhece a etapa e ela vira o braço novo", () => {
  // O webhook recusa etapa desconhecida (422): o workflow "[webhook] blacknovember"
  // do GHL só pode ser publicado depois que esta etapa estiver no ar.
  assert.equal(normalizeGhlFunnelStage("blacknovember"), "blacknovember");
  assert.equal(normalizeGhlFunnelStage("Black November"), "blacknovember");
  assert.equal(getGhlFunnelVariant("blacknovember"), "black_november");
  assert.equal(GHL_FUNNEL_STAGES.blacknovember, "Black November");
  assert.equal(GHL_FUNNEL_VARIANTS[0], "black_november");
});

test("todo braço tem título, etapa marcadora no caminho e caminho até o fechamento", () => {
  for (const variante of GHL_FUNNEL_VARIANTS) {
    const caminho = GHL_FUNNEL_PATHS[variante];
    assert.ok(GHL_FUNNEL_TITLES[variante], `${variante} sem título`);
    assert.equal(caminho[0], "lead");
    assert.equal(caminho.at(-1), "negociofechado");
    assert.equal(caminho[1], GHL_FUNNEL_VARIANT_MARKER[variante]);
    assert.equal(getGhlFunnelVariant(GHL_FUNNEL_VARIANT_MARKER[variante]), variante);
  }
});

test("Lado B aposentado em 01/11/2026; Sem Mockup segue, porque volta em dezembro", () => {
  assert.equal(GHL_FUNNEL_RETIRED.lado_b, "2026-11-01");
  assert.equal(GHL_FUNNEL_RETIRED.without_mockup, undefined);
  assert.equal(GHL_FUNNEL_RETIRED.black_november, undefined);
});
