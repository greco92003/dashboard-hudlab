import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import {
  extractOpportunityFieldValue,
  fetchGhlDealContext,
  mapGhlDealContext,
  updateGhlOpportunity,
} from "@/lib/ghl/api";
import { upsertGhlDeals } from "@/lib/ghl/deals-cache";
import {
  DEAL_EDITABLE_FIELDS,
  isDealEditableColumn,
  parseDealFieldValue,
} from "@/lib/ghl/deal-fields";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

function erro(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

/**
 * Preenche um campo vazio do negócio direto da planilha de /deals. Grava na
 * oportunidade do GHL, que é a fonte da verdade, e já atualiza o deals_cache
 * sem esperar o webhook. Só preenche: campo que já tem valor no GHL volta 409,
 * para a planilha nunca sobrescrever o que alguém digitou no CRM.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return erro("Dados inválidos.", 400);
  }
  const { campo, valor } = (body ?? {}) as { campo?: unknown; valor?: unknown };
  if (!isDealEditableColumn(campo)) {
    return erro("Esse campo não pode ser editado pela planilha.", 400);
  }
  const parsed = parseDealFieldValue(campo, valor);
  if (!parsed.ok) return erro(parsed.error, 422);

  const { fieldKey, label } = DEAL_EDITABLE_FIELDS[campo];
  try {
    const { opportunity, definitions } = await fetchGhlDealContext(id);
    const definition = definitions.find(
      (field) => field.fieldKey === `opportunity.${fieldKey}`,
    );
    if (!definition) return erro(`Campo "${label}" não encontrado no GHL.`, 502);

    const current = opportunity.customFields?.find(
      (field) => field.id === definition.id,
    );
    const currentValue = current ? extractOpportunityFieldValue(current)?.trim() : null;
    // Em campo de dinheiro, R$ 0 é o que a equipe grava no lado de quem não
    // pagou o frete: conta como vazio.
    const preenchido =
      Boolean(currentValue) &&
      !(DEAL_EDITABLE_FIELDS[campo].kind === "dinheiro" && Number(currentValue) === 0);
    if (preenchido) {
      return erro(
        `${label} já está preenchido no GHL (${currentValue}). Atualize a lista.`,
        409,
      );
    }

    await updateGhlOpportunity(id, {
      customFields: [{ id: definition.id, fieldValue: parsed.value }],
    });

    const deal = mapGhlDealContext(await fetchGhlDealContext(id));
    await upsertGhlDeals([deal], "manual", crypto.randomUUID());
    console.info("Negócio preenchido pela planilha", {
      dealId: id,
      campo,
      userId: access.user.id,
    });

    const campos = Object.fromEntries(
      Object.keys(DEAL_EDITABLE_FIELDS).map((column) => [column, deal[column] ?? null]),
    );
    return NextResponse.json(
      { deal: { deal_id: deal.deal_id, ...campos } },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Falha ao preencher campo do negócio no GHL", { dealId: id, campo, error });
    return erro("Não foi possível gravar no GHL. Tente de novo.", 502);
  }
}
