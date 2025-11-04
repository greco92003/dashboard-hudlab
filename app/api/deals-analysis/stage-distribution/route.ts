import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Endpoint de análise para descobrir a distribuição de stage_id
 * nos negócios ganhos (status = 1 ou "won")
 *
 * ⚠️ DISPONÍVEL APENAS EM DESENVOLVIMENTO
 */
export async function GET(request: NextRequest) {
  // Bloquear em produção
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      {
        error: "Análise disponível apenas em desenvolvimento",
        message: "Este endpoint de análise não está disponível em produção.",
      },
      { status: 503 }
    );
  }

  try {
    const supabase = await createClient();

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Buscar todos os deals ganhos com stage_id
    const { data: wonDeals, error: wonDealsError } = await supabase
      .from("deals_cache")
      .select("deal_id, title, value, status, stage_id, closing_date")
      .eq("sync_status", "synced")
      .or('status.eq.1,status.eq.won,status.ilike.won')
      .not("closing_date", "is", null)
      .order("closing_date", { ascending: false });

    if (wonDealsError) {
      return NextResponse.json(
        { error: "Erro ao buscar deals ganhos", details: wonDealsError },
        { status: 500 }
      );
    }

    // Buscar todos os deals para comparação
    const { data: allDeals, error: allDealsError } = await supabase
      .from("deals_cache")
      .select("deal_id, status, stage_id")
      .eq("sync_status", "synced")
      .limit(5000);

    if (allDealsError) {
      return NextResponse.json(
        { error: "Erro ao buscar todos os deals", details: allDealsError },
        { status: 500 }
      );
    }

    // Agrupar deals ganhos por stage_id
    const stageDistribution: Record<string, {
      count: number;
      totalValue: number;
      deals: Array<{ deal_id: string; title: string; value: number; closing_date: string | null }>;
    }> = {};

    wonDeals?.forEach((deal) => {
      const stageId = deal.stage_id || "null";
      
      if (!stageDistribution[stageId]) {
        stageDistribution[stageId] = {
          count: 0,
          totalValue: 0,
          deals: [],
        };
      }

      stageDistribution[stageId].count++;
      stageDistribution[stageId].totalValue += deal.value || 0;
      
      // Adicionar apenas os primeiros 5 deals de cada stage para não sobrecarregar a resposta
      if (stageDistribution[stageId].deals.length < 5) {
        stageDistribution[stageId].deals.push({
          deal_id: deal.deal_id,
          title: deal.title || "",
          value: deal.value || 0,
          closing_date: deal.closing_date,
        });
      }
    });

    // Calcular estatísticas de status únicos
    const statusDistribution: Record<string, number> = {};
    allDeals?.forEach((deal) => {
      const status = deal.status || "null";
      statusDistribution[status] = (statusDistribution[status] || 0) + 1;
    });

    // Calcular estatísticas de stage_id únicos (todos os deals)
    const allStageDistribution: Record<string, number> = {};
    allDeals?.forEach((deal) => {
      const stageId = deal.stage_id || "null";
      allStageDistribution[stageId] = (allStageDistribution[stageId] || 0) + 1;
    });

    // Ordenar por quantidade de deals
    const sortedStages = Object.entries(stageDistribution)
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([stageId, data]) => ({
        stage_id: stageId,
        count: data.count,
        totalValue: data.totalValue,
        totalValueFormatted: new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(data.totalValue / 100), // Dividir por 100 pois está em centavos
        averageValue: data.count > 0 ? data.totalValue / data.count : 0,
        averageValueFormatted: new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(data.count > 0 ? data.totalValue / data.count / 100 : 0),
        percentage: wonDeals ? ((data.count / wonDeals.length) * 100).toFixed(2) + "%" : "0%",
        sampleDeals: data.deals,
      }));

    return NextResponse.json({
      success: true,
      summary: {
        totalWonDeals: wonDeals?.length || 0,
        totalDealsInDatabase: allDeals?.length || 0,
        uniqueStagesInWonDeals: Object.keys(stageDistribution).length,
        uniqueStagesInAllDeals: Object.keys(allStageDistribution).length,
        uniqueStatuses: Object.keys(statusDistribution).length,
      },
      wonDealsDistribution: {
        byStage: sortedStages,
        mostCommonStage: sortedStages[0] || null,
      },
      allDealsDistribution: {
        byStatus: Object.entries(statusDistribution)
          .sort(([, a], [, b]) => b - a)
          .map(([status, count]) => ({
            status,
            count,
            percentage: allDeals ? ((count / allDeals.length) * 100).toFixed(2) + "%" : "0%",
          })),
        byStage: Object.entries(allStageDistribution)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10) // Top 10 stages
          .map(([stageId, count]) => ({
            stage_id: stageId,
            count,
            percentage: allDeals ? ((count / allDeals.length) * 100).toFixed(2) + "%" : "0%",
          })),
      },
      insights: {
        message: "A distribuição de stage_id mostra em quais etapas do pipeline os negócios foram ganhos.",
        note: "O campo 'status' (não o 'stage_id') é o que determina se um negócio está ganho (status=1 ou 'won').",
        recommendation: "Use sempre 'status' para filtrar negócios ganhos, não o 'stage_id'.",
      },
    });
  } catch (error: any) {
    console.error("Erro na análise:", error);
    return NextResponse.json(
      { error: "Erro interno", details: error.message },
      { status: 500 }
    );
  }
}

