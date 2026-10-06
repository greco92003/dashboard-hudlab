import test from "node:test";
import assert from "node:assert/strict";
import {
  isStorableDealValue,
  isWithinWebhookGrace,
  shouldUpdateWonDeal,
  webhookMissedWonDeal,
} from "../lib/ghl/won-deal-diff.ts";

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

const now = Date.parse("2026-10-06T13:00:00Z");

test("mudança recente fica com o webhook; o sync só assume depois da janela", () => {
  const recent = { ...incoming, stage_id: "stage-2", api_updated_at: "2026-10-06T12:55:00Z" };
  const old = { ...incoming, stage_id: "stage-2", api_updated_at: "2026-10-06T12:45:00Z" };
  assert.equal(isWithinWebhookGrace(recent, now), true);
  assert.equal(isWithinWebhookGrace(old, now), false);
  assert.equal(isWithinWebhookGrace({ ...incoming, api_updated_at: null }, now), false);
});

test("conta como falha do webhook só mudança real em negócio ganho", () => {
  const old = "2026-10-06T12:00:00Z";
  assert.equal(webhookMissedWonDeal({ ...incoming, api_updated_at: old }, undefined), true);
  assert.equal(webhookMissedWonDeal({ ...incoming, status: "won", value: 99900, api_updated_at: old }, cached), true);
  assert.equal(webhookMissedWonDeal({ ...incoming, stage_id: "stage-2" }, cached), true);
  // Payload e fechamento diferem por mapeamento e por exceção manual
  // (deals_closing_date_overrides): não acusam o webhook.
  assert.equal(webhookMissedWonDeal({ ...incoming, title: "Pedido corrigido" }, cached), false);
  assert.equal(webhookMissedWonDeal({ ...incoming, closing_date: "2026-10-06" }, cached), false);
});

test("valor que não cabe em numeric(18,2) não é gravável", () => {
  assert.equal(isStorableDealValue(12500), true);
  assert.equal(isStorableDealValue(9_999_999_999_999_999), false);
  assert.equal(isStorableDealValue(-1e16), false);
  assert.equal(isStorableDealValue(Number.NaN), false);
});
