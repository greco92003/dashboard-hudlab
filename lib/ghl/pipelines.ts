export const GHL_MOCKUP_FACTORY_PIPELINE_ID = "ShSCF8BTLIdKHAjq491X";
export const GHL_MOCKUP_FACTORY_WON_STAGE_IDS = new Set([
  "49a81bf5-6148-4074-87d1-bc0aaed13a00", // Criar Arquivo Serigrafia
  "7fb18489-0d66-4591-be25-5146e669b4e8", // Arquivo Serigrafia Pronto
]);

/**
 * Venda já fechada que volta para a Fábrica de Mockups tem o status resetado
 * para `open` pelo GHL, e sem esta regra sumiria dos dashboards.
 *
 * A regra exige SINAL DE VENDA — valor maior que zero — porque as etapas de
 * serigrafia também recebem negócio que nunca foi vendido: em 25/08/2026 um
 * lead vindo do site, com R$ 0 e sem data de fechamento, estava sendo contado
 * como venda só por estar em "Criar Arquivo Serigrafia".
 *
 * O aperto é neutro em faturamento: só deixa de promover negócio que o GHL diz
 * não ser ganho E que vale R$ 0, ou seja, que somava zero em receita de todo
 * jeito. O que muda é a CONTAGEM de vendas, que para de incluir lead.
 */
export function isGhlWonDeal(
  pipelineId: string | null | undefined,
  stageId: string | null | undefined,
  status: string | null | undefined,
  monetaryValue?: number | null,
): boolean {
  if (status?.toLowerCase() === "won" || status === "1") return true;

  const naEtapaDeSerigrafia =
    pipelineId === GHL_MOCKUP_FACTORY_PIPELINE_ID &&
    !!stageId &&
    GHL_MOCKUP_FACTORY_WON_STAGE_IDS.has(stageId);

  return naEtapaDeSerigrafia && Number(monetaryValue ?? 0) > 0;
}

export function normalizeGhlDealStatus(
  pipelineId: string | null | undefined,
  stageId: string | null | undefined,
  status: string | null | undefined,
  monetaryValue?: number | null,
): string | null {
  return isGhlWonDeal(pipelineId, stageId, status, monetaryValue)
    ? "won"
    : status || null;
}
