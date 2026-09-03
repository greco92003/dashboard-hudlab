import test from "node:test";
import assert from "node:assert/strict";
import {
  isGhlOpportunityEvent,
  shouldRunMockupWebhookConsumer,
} from "../lib/ghl/webhook-routing.ts";
import { GHL_MOCKUP_FACTORY_PIPELINE_ID } from "../lib/ghl/pipelines.ts";

test("reconhece os eventos de oportunidade que alimentam o dashboard", () => {
  assert.equal(isGhlOpportunityEvent("OpportunityCreate"), true);
  assert.equal(isGhlOpportunityEvent("OpportunityUpdate"), true);
  assert.equal(isGhlOpportunityEvent("OpportunityDelete"), true);
  assert.equal(isGhlOpportunityEvent("ContactUpdate"), false);
});

test("só envia a pipeline de mockups ao consumidor dos designers", () => {
  assert.equal(
    shouldRunMockupWebhookConsumer(GHL_MOCKUP_FACTORY_PIPELINE_ID),
    true,
  );
  assert.equal(shouldRunMockupWebhookConsumer("pipeline-atendimento"), false);
  assert.equal(shouldRunMockupWebhookConsumer(null), true);
});
