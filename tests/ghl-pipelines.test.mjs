import test from "node:test";
import assert from "node:assert/strict";
import {
  GHL_MOCKUP_FACTORY_PIPELINE_ID,
  GHL_MOCKUP_FACTORY_WON_STAGE_IDS,
  isGhlWonDeal,
  normalizeGhlDealStatus,
} from "../lib/ghl/pipelines.ts";

test("considera etapas pós-venda da Fábrica de Mockups como ganho", () => {
  const productionStageId = Array.from(GHL_MOCKUP_FACTORY_WON_STAGE_IDS)[0];
  assert.equal(
    isGhlWonDeal(
      GHL_MOCKUP_FACTORY_PIPELINE_ID,
      productionStageId,
      "open",
      100,
    ),
    true,
  );
  assert.equal(
    normalizeGhlDealStatus(
      GHL_MOCKUP_FACTORY_PIPELINE_ID,
      productionStageId,
      "open",
      100,
    ),
    "won",
  );
});

test("não trata etapas de mockup pré-venda como vendas", () => {
  assert.equal(
    normalizeGhlDealStatus(
      GHL_MOCKUP_FACTORY_PIPELINE_ID,
      "mockup-prioridade",
      "open",
    ),
    "open",
  );
});

test("preserva os status dos demais pipelines", () => {
  assert.equal(
    normalizeGhlDealStatus("pipeline-comercial", "etapa", "open"),
    "open",
  );
  assert.equal(
    normalizeGhlDealStatus("pipeline-comercial", "etapa", "lost"),
    "lost",
  );
  assert.equal(
    normalizeGhlDealStatus("pipeline-comercial", "etapa", "won"),
    "won",
  );
});
