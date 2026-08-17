export const GHL_MOCKUP_FACTORY_PIPELINE_ID = "ShSCF8BTLIdKHAjq491X";
export const GHL_MOCKUP_FACTORY_WON_STAGE_IDS = new Set([
  "49a81bf5-6148-4074-87d1-bc0aaed13a00", // Criar Arquivo Serigrafia
  "7fb18489-0d66-4591-be25-5146e669b4e8", // Arquivo Serigrafia Pronto
]);

/**
 * Opportunities moved to the Mockup Factory are already completed sales.
 * GHL resets them to `open` when they enter the operational pipeline, so the
 * analytical cache must keep treating them as won.
 */
export function isGhlWonDeal(
  pipelineId: string | null | undefined,
  stageId: string | null | undefined,
  status: string | null | undefined,
): boolean {
  return (
    status?.toLowerCase() === "won" ||
    status === "1" ||
    (pipelineId === GHL_MOCKUP_FACTORY_PIPELINE_ID &&
      !!stageId &&
      GHL_MOCKUP_FACTORY_WON_STAGE_IDS.has(stageId))
  );
}

export function normalizeGhlDealStatus(
  pipelineId: string | null | undefined,
  stageId: string | null | undefined,
  status: string | null | undefined,
): string | null {
  return isGhlWonDeal(pipelineId, stageId, status) ? "won" : status || null;
}
