import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeSellerName } from "@/lib/utils/normalize-names";

/**
 * POST /api/ote/calculate
 * Calcula comissões OTE para um vendedor em um período específico
 *
 * Body: {
 *   seller_id: string,
 *   month: number,
 *   year: number
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // Parse do body
    const body = await request.json();
    const { seller_id, month, year } = body;

    if (!seller_id || !month || !year) {
      return NextResponse.json(
        { error: "seller_id, month e year são obrigatórios" },
        { status: 400 }
      );
    }

    // 1. Buscar dados do vendedor
    const { data: seller, error: sellerError } = await supabase
      .from("ote_sellers")
      .select("*")
      .eq("id", seller_id)
      .eq("active", true)
      .single();

    if (sellerError || !seller) {
      return NextResponse.json(
        { error: "Vendedor não encontrado ou inativo" },
        { status: 404 }
      );
    }

    // 2. Buscar meta do mês (meta única da empresa)
    const { data: target, error: targetError } = await supabase
      .from("ote_monthly_targets")
      .select("*")
      .eq("month", month)
      .eq("year", year)
      .single();

    if (targetError || !target) {
      return NextResponse.json(
        { error: "Meta não encontrada para este período" },
        { status: 404 }
      );
    }

    // 3. Buscar configuração OTE
    const { data: config, error: configError } = await supabase
      .from("ote_config")
      .select("*")
      .eq("active", true)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { error: "Configuração OTE não encontrada" },
        { status: 404 }
      );
    }

    // 4. Buscar deals do vendedor no período
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Último dia do mês

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    const { data: deals, error: dealsError } = await supabase
      .from("deals_cache")
      .select("*")
      .gte("closing_date", startDateStr)
      .lte("closing_date", endDateStr)
      .eq("status", "won");

    if (dealsError) {
      console.error("Erro ao buscar deals:", dealsError);
      return NextResponse.json(
        { error: "Erro ao buscar deals" },
        { status: 500 }
      );
    }

    // 5. Filtrar deals do vendedor (normalizar nomes)
    const normalizedSellerName = normalizeSellerName(seller.seller_name);
    const sellerDeals = (deals || []).filter((deal: any) => {
      const dealSellerName = normalizeSellerName(deal.vendedor || "");
      return dealSellerName === normalizedSellerName;
    });

    // 6. Calcular vendas totais
    const totalSales = sellerDeals.reduce((sum: number, deal: any) => {
      return sum + (deal.value || 0) / 100; // Dividir por 100 (valores estão multiplicados)
    }, 0);

    // 7. Separar vendas por canal (80% tráfego pago, 20% orgânico)
    const paidTrafficSales =
      totalSales * (config.paid_traffic_percentage / 100);
    const organicSales = totalSales * (config.organic_percentage / 100);

    // 8. Calcular % de atingimento da meta
    const achievementPercentage = (totalSales / target.target_amount) * 100;

    // 9. Determinar multiplicador
    const multipliers = config.multipliers as any[];
    const multiplier =
      multipliers.find(
        (m: any) =>
          achievementPercentage >= m.min && achievementPercentage <= m.max
      )?.multiplier || 0;

    // 10. Calcular comissões
    const baseCommission =
      target.target_amount * (seller.commission_percentage / 100);
    const commissionPaidTraffic =
      baseCommission * multiplier * (config.paid_traffic_percentage / 100);
    const commissionOrganic =
      baseCommission * multiplier * (config.organic_percentage / 100);
    const totalCommission = commissionPaidTraffic + commissionOrganic;

    // 11. Calcular total de ganhos
    const totalEarnings = seller.salary_fixed + totalCommission;

    // 12. Contar pares vendidos
    const pairsSold = sellerDeals.reduce((sum: number, deal: any) => {
      return sum + parseInt(deal["quantidade-de-pares"] || "0");
    }, 0);

    // 13. Preparar resultado
    const result = {
      seller_id: seller.id,
      seller_name: seller.seller_name,
      month,
      year,
      target_amount: target.target_amount,
      achieved_amount: totalSales,
      achievement_percentage: achievementPercentage,
      paid_traffic_sales: paidTrafficSales,
      organic_sales: organicSales,
      base_commission: baseCommission,
      multiplier,
      commission_paid_traffic: commissionPaidTraffic,
      commission_organic: commissionOrganic,
      total_commission: totalCommission,
      salary_fixed: seller.salary_fixed,
      total_earnings: totalEarnings,
      deals_count: sellerDeals.length,
      pairs_sold: pairsSold,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Erro ao calcular comissão OTE:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
