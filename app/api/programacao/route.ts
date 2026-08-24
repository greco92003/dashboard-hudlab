import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { createClient } from "@/utils/supabase/server";
import { fetchBoardDeals, type BoardDeal } from "@/lib/ghl/board-deals";
import {
  CONCLUIDO_STAGE_TITLES,
  EXPEDICAO_STAGE_TITLES,
  TIPO_PEDIDO_ORDER,
} from "@/lib/ghl/programacao-stages";

export const SEM_DATA_GROUP_ID = "sem-data";

/**
 * Board da produção: deals ganhos do GHL que ainda dependem da fábrica,
 * agrupados por Data de Embarque. Tudo a partir de "Cobrar Saldo" já é
 * responsabilidade da /expedicao e sai daqui.
 *
 * O corte é por exclusão (e não por lista branca) para que uma etapa nova ou
 * renomeada no CRM apareça neste board em vez de desaparecer das duas telas.
 */
export async function GET() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  try {
    const supabase = await createClient();

    const deals = await fetchBoardDeals(supabase, {
      excludeStageTitles: [
        ...EXPEDICAO_STAGE_TITLES,
        ...CONCLUIDO_STAGE_TITLES,
      ],
    });

    // Agrupa por Data de Embarque. O split de "Em atraso" fica no cliente, que
    // conhece o fuso do usuário e recalcula ao filtrar.
    const dealsByEmbarque = new Map<string, BoardDeal[]>();
    for (const deal of deals) {
      const key = deal.dataEmbarque || SEM_DATA_GROUP_ID;
      const bucket = dealsByEmbarque.get(key);
      if (bucket) bucket.push(deal);
      else dealsByEmbarque.set(key, [deal]);
    }

    const parseDate = (value: string) => {
      const [day, month, year] = value.split("/").map(Number);
      return new Date(year, month - 1, day).getTime();
    };

    const groups = Array.from(dealsByEmbarque.entries())
      .map(([dataEmbarque, groupDeals]) => ({
        id: dataEmbarque,
        title: dataEmbarque === SEM_DATA_GROUP_ID ? "Sem data" : dataEmbarque,
        dealsCount: groupDeals.length,
        deals: groupDeals,
      }))
      .sort((a, b) => {
        if (a.id === SEM_DATA_GROUP_ID) return 1;
        if (b.id === SEM_DATA_GROUP_ID) return -1;
        try {
          return parseDate(a.id) - parseDate(b.id);
        } catch {
          return 0;
        }
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
      message: "Programação carregada do cache unificado do GHL",
      summary: {
        totalDeals: deals.length,
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
    console.error("❌ Erro na rota /api/programacao:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
