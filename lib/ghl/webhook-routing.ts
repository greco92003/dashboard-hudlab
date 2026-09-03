import { GHL_MOCKUP_FACTORY_PIPELINE_ID } from "./pipelines";

export function isGhlOpportunityEvent(eventType: string): boolean {
  return eventType.toLowerCase().includes("opportunity");
}

export function shouldRunMockupWebhookConsumer(
  pipelineId: string | null,
): boolean {
  // Custom Workflow payloads do not always include pipelineId. In that case
  // the processor resolves the opportunity and performs the definitive filter.
  return !pipelineId || pipelineId === GHL_MOCKUP_FACTORY_PIPELINE_ID;
}
