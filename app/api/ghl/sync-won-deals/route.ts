import { NextRequest, NextResponse } from "next/server";
import { syncWonGhlDeals } from "@/lib/ghl/deals-cache";
import { requireAdminOrCron } from "@/lib/security/route-guards";

/**
 * Sync leve, usado pelo botão "Atualizar" dos boards.
 *
 * Traz só os negócios ganhos — que é tudo que /programacao, /expedicao e
 * /producao mostram — e leva ~15s contra os ~2min do sync completo, que
 * reconcilia as quase 15 mil oportunidades da conta. Ninguém clica em
 * "Atualizar" querendo reconciliar o histórico inteiro: quer ver o campo que
 * acabou de preencher no CRM.
 *
 * Não remove linha nenhuma; a limpeza de negócio que sumiu do GHL continua
 * sendo responsabilidade do sync completo, no cron diário.
 */
async function run(request: NextRequest) {
  const accessError = await requireAdminOrCron(request);
  if (accessError) return accessError;

  try {
    const result = await syncWonGhlDeals({
      source: request.headers.has("authorization") ? "cron" : "manual",
      requestId: request.headers.get("x-vercel-id") || crypto.randomUUID(),
    });
    return NextResponse.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GHL won deals sync failed", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = run;
export const POST = run;
export const maxDuration = 120;
export const runtime = "nodejs";
