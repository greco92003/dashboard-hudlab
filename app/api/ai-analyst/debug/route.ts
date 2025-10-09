import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Endpoint de debug para verificar dados da tabela deals_cache
 * Útil para diagnosticar problemas com o Analista IA
 *
 * ⚠️ DISPONÍVEL APENAS EM DESENVOLVIMENTO
 */
export async function GET(request: NextRequest) {
  // Bloquear em produção
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      {
        error: "Debug disponível apenas em desenvolvimento",
        message: "Este endpoint de debug não está disponível em produção.",
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

    // Calcular datas (últimos 30 dias)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const formatDate = (date: Date) => {
      return date.toISOString().split("T")[0];
    };

    // Buscar deals com TODOS os campos
    const { data: deals, error: dealsError } = await supabase
      .from("deals_cache")
      .select(
        `deal_id, title, value, status, closing_date, created_date,
         estado, "quantidade-de-pares", vendedor, designer,
         "utm-source", "utm-medium"`
      )
      .eq("sync_status", "synced")
      .not("closing_date", "is", null)
      .gte("closing_date", formatDate(startDate))
      .lte("closing_date", formatDate(endDate))
      .order("closing_date", { ascending: false })
      .limit(10);

    if (dealsError) {
      return NextResponse.json(
        { error: "Erro ao buscar deals", details: dealsError },
        { status: 500 }
      );
    }

    // Buscar estatísticas gerais
    const { count: totalCount } = await supabase
      .from("deals_cache")
      .select("*", { count: "exact", head: true })
      .eq("sync_status", "synced");

    const { count: withClosingDate } = await supabase
      .from("deals_cache")
      .select("*", { count: "exact", head: true })
      .eq("sync_status", "synced")
      .not("closing_date", "is", null);

    // Buscar status únicos
    const { data: allDeals } = await supabase
      .from("deals_cache")
      .select("status")
      .eq("sync_status", "synced")
      .limit(1000);

    const uniqueStatuses = [...new Set(allDeals?.map((d) => d.status))];

    // Calcular totais
    const totalValue = deals?.reduce((sum, d) => sum + (d.value || 0), 0) || 0;

    return NextResponse.json({
      success: true,
      debug: {
        periodo: {
          inicio: formatDate(startDate),
          fim: formatDate(endDate),
        },
        estatisticas: {
          totalDealsNaTabela: totalCount,
          dealsComClosingDate: withClosingDate,
          dealsNoPeriodo: deals?.length || 0,
          statusUnicos: uniqueStatuses,
        },
        primeiros10Deals: deals?.map((d) => ({
          deal_id: d.deal_id,
          title: d.title,
          value: d.value,
          status: d.status,
          closing_date: d.closing_date,
          created_date: d.created_date,
          estado: d.estado,
          quantidade_pares: d["quantidade-de-pares"],
          vendedor: d.vendedor,
          designer: d.designer,
          utm_source: d["utm-source"],
          utm_medium: d["utm-medium"],
        })),
        totais: {
          valorTotal: totalValue,
          valorFormatado: new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
          }).format(totalValue),
        },
      },
    });
  } catch (error: any) {
    console.error("Erro no debug:", error);
    return NextResponse.json(
      { error: "Erro interno", details: error.message },
      { status: 500 }
    );
  }
}
