import assert from "node:assert/strict";
import test from "node:test";
import { extractGhlProductModels } from "../lib/erp/ghl-product-models.ts";

test("relaciona o solado pelo nome do campo mesmo quando a fieldKey do GHL está incorreta", () => {
  const definitions = [
    {
      id: "sole-3",
      name: "Solado Modelo 3",
      fieldKey: "opportunity.soladosolado_modelo_1",
      model: "opportunity",
      dataType: "SINGLE_OPTIONS",
      picklistOptions: ["Branco", "Preto"],
    },
    {
      id: "grade-3",
      name: "Grade Modelo 3 Adulto",
      fieldKey: "opportunity.grade_modelo_3_adulto",
      model: "opportunity",
      dataType: "TEXTBOX_LIST",
      picklistOptions: [{ id: "size-3637", label: "36/37" }],
    },
  ];
  const opportunity = {
    id: "deal-1",
    name: "Pedido",
    customFields: [
      { id: "sole-3", fieldValueString: "Branco" },
      { id: "grade-3", fieldValue: { "size-3637": "10" } },
    ],
  };

  const [model] = extractGhlProductModels(opportunity, definitions);
  assert.equal(model.modelNumber, 3);
  assert.equal(model.soleColor, "Branco");
  assert.equal(model.totalPairs, 10);
});
