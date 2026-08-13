import assert from "node:assert/strict";
import test from "node:test";
import {
  abbreviateColor,
  buildBaseSku,
  buildModelCode,
  buildProductTitle,
  buildVariationSku,
  inferUpperColorFromCloner,
  positiveQuantity,
} from "../lib/erp/product-rules.ts";

test("gera o código MMYYMODELO com dois dígitos", () => {
  assert.equal(buildModelCode(new Date("2026-08-03T12:00:00-03:00"), 1), "082601");
  assert.equal(buildModelCode(new Date("2026-08-03T12:00:00-03:00"), 10), "082610");
});

test("gera título, SKU pai e SKU de variação no padrão HudLab", () => {
  const title = buildProductTitle({
    opportunityName: "Metanoia",
    color: "Preta",
    modelNumber: 1,
    date: new Date("2026-08-03T12:00:00-03:00"),
  });
  assert.equal(title, "Chinelo Slide 082601 - METANOIA - Preto");
  assert.equal(buildBaseSku("Metanoia", "Preta"), "CH-SL-METANOIA-PRT");
  assert.equal(
    buildVariationSku("CH-SL-METANOIA-PRT", "34/35"),
    "CH-SL-METANOIA-PRT-3435",
  );
});

test("infere a cor da gáspea a partir dos nomes dos cloners", () => {
  assert.equal(
    inferUpperColorFromCloner("Chinelo Slide CLONER - SOLA (BRANCA) / GÁSPEA (PRETA)"),
    "Preto",
  );
  assert.equal(inferUpperColorFromCloner("Chinelo Slide CLONER - BRANCO (9 variações)"), "Branco");
  assert.equal(abbreviateColor("Branca"), "BRC");
});

test("considera somente quantidades numéricas positivas", () => {
  assert.equal(positiveQuantity("100"), 100);
  assert.equal(positiveQuantity("2,5"), 2.5);
  assert.equal(positiveQuantity(""), null);
  assert.equal(positiveQuantity("0"), null);
  assert.equal(positiveQuantity(-1), null);
});
