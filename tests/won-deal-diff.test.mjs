import test from "node:test";
import assert from "node:assert/strict";
import { shouldUpdateWonDeal } from "../lib/ghl/won-deal-diff.ts";

const incoming = {
  deal_id: "deal-1",
  status: "won",
  value: 12500,
  stage_id: "stage-1",
  pipeline_id: "pipeline-1",
  closing_date: "2026-10-01",
  api_updated_at: "2026-10-01T12:00:00Z",
  title: "Pedido",
};

const cached = {
  deal_id: "deal-1",
  provider_payload: { title: "Pedido", ...incoming },
  status: "won",
  value: "12500.00",
  stage_id: "stage-1",
  pipeline_id: "pipeline-1",
  closing_date: "2026-10-01T00:00:00+00:00",
};

test("não regrava venda ganha idêntica só por ordem de chaves ou formato numérico", () => {
  assert.equal(shouldUpdateWonDeal(incoming, cached), false);
});

test("grava venda nova, mudança no payload e mudança de estágio", () => {
  assert.equal(shouldUpdateWonDeal(incoming, undefined), true);
  assert.equal(
    shouldUpdateWonDeal({ ...incoming, title: "Pedido corrigido" }, cached),
    true,
  );
  assert.equal(
    shouldUpdateWonDeal({ ...incoming, stage_id: "stage-2" }, cached),
    true,
  );
});
