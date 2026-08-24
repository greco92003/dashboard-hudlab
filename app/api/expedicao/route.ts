import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { createClient } from "@/utils/supabase/server";
import { fetchBoardDeals, type BoardDeal } from "@/lib/ghl/board-deals";
import {
  CONCLUIDO_STAGE_TITLES,
  EXPEDICAO_COLUMNS,
  getExpedicaoColumnId,
  TIPO_PEDIDO_ORDER,
} from "@/lib/ghl/programacao-stages";

export const RECEBIDOS_DIAS_PADRAO = 30;

const EM_ANDAMENTO_STAGE_TITLES = EXPEDICAO_COLUMNS.filter(
  (column) => column.id !== "recebido",
).flatMap((column) => column.stageTitles);

/**
 * Board da expedição: o que já saiu da produção e caminha para o cliente —
 * cobrança do saldo, aprovação financeira, fiscal, coleta e trânsito, até
 * "Recebido".
 *
 * A coluna "Recebido" é histórica (quase mil deals) e vem limitada por uma
 * janela de dias sobre a DATA DE EMBARQUE. O recorte não pode usar
 * `api_updated_at` nem `last_status_change`: a migração do ActiveCampaign para
 * o GHL reescreveu esses timestamps em todos os negócios de uma vez, e os 981
 * recebidos passariam por "atualizados hoje". A data de embarque é digitada
 * pela operação e escapou dessa distorção. `?recebidosDias=0` traz tudo.
 */
export async function GET(request: NextRequest) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  try {
    const supabase = await createClient();

    const diasParam = request.nextUrl.searchParams.get("recebidosDias");
    const parsedDias = diasParam === null ? NaN : Number(diasParam);
    const recebidosDias =
      Number.isFinite(parsedDias) && parsedDias >= 0
        ? parsedDias
        : RECEBIDOS_DIAS_PADRAO;

    const embarqueDesde =
      recebidosDias > 0
        ? new Date(Date.now() - recebidosDias * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10)
        : undefined;

    const [emAndamento, recebidos] = await Promise.all([
      fetchBoardDeals(supabase, { stageTitles: EM_ANDAMENTO_STAGE_TITLES }),
      fetchBoardDeals(supabase, {
        stageTitles: CONCLUIDO_STAGE_TITLES,
        embarqueDesde,
      }),
    ]);

    const deals = [...emAndamento, ...recebidos];

    const dealsByColumn = new Map<string, BoardDeal[]>();
    for (const deal of deals) {
      const columnId = getExpedicaoColumnId(deal.stageTitle);
      if (!columnId) continue;
      const bucket = dealsByColumn.get(columnId);
      if (bucket) bucket.push(deal);
      else dealsByColumn.set(columnId, [deal]);
    }

    const groups = EXPEDICAO_COLUMNS.map((column) => {
      const groupDeals = dealsByColumn.get(column.id) || [];
      return {
        id: column.id,
        title: column.title,
        dealsCount: groupDeals.length,
        deals: groupDeals,
      };
    });

    const porTipo: Record<string, number> = { "Sem tipo": 0 };
    for (const tipo of TIPO_PEDIDO_ORDER) porTipo[tipo] = 0;
    for (const deal of deals) porTipo[deal.tipoPedido ?? "Sem tipo"] += 1;

    const totalPares = deals.reduce(
      (sum, deal) => sum + (parseInt(deal.quantidadePares || "0", 10) || 0),
      0,
    );

    return NextResponse.json({
      success: true,
      message: "Expedição carregada do cache unificado do GHL",
      summary: {
        totalDeals: deals.length,
        emAndamento: emAndamento.length,
        recebidos: recebidos.length,
        recebidosDias,
        // O cache guarda centavos (herança do ActiveCampaign).
        totalValue: deals.reduce((sum, deal) => sum + (deal.value || 0), 0) / 100,
        totalGroups: groups.length,
        totalPares,
        porTipo,
      },
      groups,
      debug: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error("❌ Erro na rota /api/expedicao:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
