import "server-only";

import { searchGhlOpportunitiesByContact, type GhlOpportunity } from "@/lib/ghl/api";
import { isGhlWonDeal } from "@/lib/ghl/pipelines";

/** Negociação aberta mais recente do contato; venda fechada (ex.: na Serigrafia) não conta. */
export async function findCurrentOpportunity(contactId: string): Promise<GhlOpportunity | null> {
  const opportunities = await searchGhlOpportunitiesByContact(contactId);
  const open = opportunities.filter(
    (o) =>
      (o.status ?? "open") === "open" &&
      !isGhlWonDeal(o.pipelineId, o.pipelineStageId, o.status, o.monetaryValue),
  );
  open.sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
  return open[0] ?? null;
}
