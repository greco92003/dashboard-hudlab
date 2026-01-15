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
    // Usar a mesma lógica do /dashboard para garantir consistência
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Último dia do mês

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    console.log("🔍 OTE Calculate - Buscando deals:", {
      seller_name: seller.seller_name,
      month,
      year,
      startDateStr,
      endDateStr,
    });

    // Buscar TODOS os deals do período (mesma query do /dashboard)
    // Filtrar por closing_date e sync_status = "synced"
    const { data: allDeals, error: dealsError } = await supabase
      .from("deals_cache")
      .select("*")
      .eq("sync_status", "synced")
      .not("closing_date", "is", null)
      .gte("closing_date", startDateStr)
      .lte("closing_date", endDateStr);

    if (dealsError) {
      console.error("❌ Erro ao buscar deals:", dealsError);
      return NextResponse.json(
        { error: "Erro ao buscar deals" },
        { status: 500 }
      );
    }

    console.log(
      `📊 Total de deals encontrados no período: ${allDeals?.length || 0}`
    );

    // Calcular faturamento total de TODOS os vendedores (para a meta da empresa)
    const totalCompanySales = (allDeals || []).reduce(
      (sum: number, deal: any) => {
        // Apenas deals ganhos (won ou status = 1)
        // ActiveCampaign usa status = "1" para deals ganhos
        if (deal.status === "won" || deal.status === "1" || deal.status === 1) {
          return sum + (deal.value || 0) / 100;
        }
        return sum;
      },
      0
    );

    console.log(
      `💰 Faturamento total da empresa: R$ ${totalCompanySales.toFixed(2)}`
    );

    // 5. Filtrar deals do vendedor específico (normalizar nomes)
    const normalizedSellerName = normalizeSellerName(seller.seller_name);
    const sellerDeals = (allDeals || []).filter((deal: any) => {
      // Apenas deals ganhos do vendedor (won ou status = 1)
      if (deal.status !== "won" && deal.status !== "1" && deal.status !== 1) {
        return false;
      }
      const dealSellerName = normalizeSellerName(deal.vendedor || "");
      return dealSellerName === normalizedSellerName;
    });

    console.log(`👤 Deals do vendedor "${seller.seller_name}":`, {
      normalizedSellerName,
      totalDeals: sellerDeals.length,
      sampleDeals: sellerDeals.slice(0, 3).map((d: any) => ({
        deal_id: d.deal_id,
        title: d.title,
        value: d.value,
        vendedor: d.vendedor,
        closing_date: d.closing_date,
      })),
    });

    // 6. Calcular vendas totais do vendedor e separar por tipo de tráfego
    // Classificar cada deal baseado no utm-source:
    // - Se utm-source contém "prospecção" (case-insensitive) → tráfego orgânico
    // - Caso contrário → tráfego pago
    let paidTrafficSales = 0;
    let organicSales = 0;
    let totalSales = 0;

    sellerDeals.forEach((deal: any) => {
      const dealValue = (deal.value || 0) / 100; // Dividir por 100 (valores estão multiplicados)
      totalSales += dealValue;

      // Verificar utm-source para classificar o tipo de tráfego
      const utmSource = (deal["utm-source"] || "").toLowerCase();
      const isOrganic = utmSource.includes("prospec");

      if (isOrganic) {
        organicSales += dealValue;
      } else {
        paidTrafficSales += dealValue;
      }
    });

    console.log(`💰 Vendas do vendedor por tipo de tráfego:`, {
      totalSales: totalSales.toFixed(2),
      paidTrafficSales: paidTrafficSales.toFixed(2),
      organicSales: organicSales.toFixed(2),
      paidPercentage: ((paidTrafficSales / totalSales) * 100).toFixed(2) + "%",
      organicPercentage: ((organicSales / totalSales) * 100).toFixed(2) + "%",
    });

    // 8. Calcular % de atingimento da meta
    // IMPORTANTE: Usar faturamento total da EMPRESA para calcular o atingimento
    // Todos os vendedores trabalham juntos para atingir a meta da empresa
    const achievementPercentage =
      (totalCompanySales / target.target_amount) * 100;

    console.log(`📊 Atingimento da meta:`, {
      metaEmpresa: target.target_amount,
      faturamentoEmpresa: totalCompanySales,
      percentual: achievementPercentage.toFixed(2) + "%",
    });

    // 9. Determinar multiplicador
    const multipliers = config.multipliers as any[];
    const multiplier =
      multipliers.find(
        (m: any) =>
          achievementPercentage >= m.min && achievementPercentage <= m.max
      )?.multiplier || 0;

    console.log(`🎯 Multiplicador aplicado: ${multiplier}x`);

    // 10. Calcular comissões com percentuais diferenciados por tipo de tráfego
    // Comissão base para tráfego pago: meta * % comissão tráfego pago
    const baseCommissionPaidTraffic =
      target.target_amount * (seller.commission_paid_traffic / 100);
    // Comissão base para tráfego orgânico: meta * % comissão orgânico
    const baseCommissionOrganic =
      target.target_amount * (seller.commission_organic / 100);

    // Aplicar multiplicador e distribuição de tráfego
    const commissionPaidTraffic =
      baseCommissionPaidTraffic *
      multiplier *
      (config.paid_traffic_percentage / 100);
    const commissionOrganic =
      baseCommissionOrganic * multiplier * (config.organic_percentage / 100);
    const totalCommission = commissionPaidTraffic + commissionOrganic;

    console.log(`💵 Comissão calculada:`, {
      baseCommissionPaidTraffic: baseCommissionPaidTraffic.toFixed(2),
      baseCommissionOrganic: baseCommissionOrganic.toFixed(2),
      commissionPaidTraffic: commissionPaidTraffic.toFixed(2),
      commissionOrganic: commissionOrganic.toFixed(2),
      totalCommission: totalCommission.toFixed(2),
    });

    // 11. Calcular total de ganhos
    const totalEarnings = seller.salary_fixed + totalCommission;

    // 12. Contar negócios e pares vendidos da EMPRESA (todos os vendedores)
    // Filtrar apenas deals ganhos
    const wonDeals = (allDeals || []).filter(
      (deal: any) =>
        deal.status === "won" || deal.status === "1" || deal.status === 1
    );

    const totalDealsCount = wonDeals.length;
    const totalPairsSold = wonDeals.reduce((sum: number, deal: any) => {
      const pairs = parseInt(deal["quantidade-de-pares"] || "0");
      return sum + pairs;
    }, 0);

    console.log(`📦 Totais da empresa:`, {
      negócios: totalDealsCount,
      pares: totalPairsSold,
    });

    // 13. Calcular meta individual do vendedor
    const individualTargetAmount =
      target.target_amount * (seller.target_percentage / 100);
    const remainingToTarget = Math.max(0, individualTargetAmount - totalSales);

    console.log(`🎯 Meta individual:`, {
      porcentagem: seller.target_percentage + "%",
      metaIndividual: individualTargetAmount.toFixed(2),
      vendidoPeloVendedor: totalSales.toFixed(2),
      faltaParaMeta: remainingToTarget.toFixed(2),
    });

    // 14. Preparar resultado
    const result = {
      seller_id: seller.id,
      seller_name: seller.seller_name,
      month,
      year,
      target_amount: target.target_amount, // Meta total da empresa
      individual_target_amount: individualTargetAmount, // Meta individual do vendedor
      achieved_amount: totalCompanySales, // Faturamento total da empresa
      achievement_percentage: achievementPercentage,
      remaining_to_target: remainingToTarget, // Quanto falta para o vendedor atingir sua meta individual
      paid_traffic_sales: paidTrafficSales,
      organic_sales: organicSales,
      base_commission: baseCommissionPaidTraffic + baseCommissionOrganic, // Soma das comissões base
      multiplier,
      commission_paid_traffic: commissionPaidTraffic,
      commission_organic: commissionOrganic,
      total_commission: totalCommission,
      salary_fixed: seller.salary_fixed,
      total_earnings: totalEarnings,
      deals_count: totalDealsCount, // Total de negócios da empresa
      pairs_sold: totalPairsSold, // Total de pares da empresa
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
