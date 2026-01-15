import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeSellerName } from "@/lib/utils/normalize-names";

/**
 * GET /api/ote/sellers-progress?month=1&year=2026
 * Retorna o progresso de todos os vendedores ativos em relação às suas metas individuais
 */
export async function GET(request: NextRequest) {
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

    // Obter parâmetros
    const searchParams = request.nextUrl.searchParams;
    const month = parseInt(searchParams.get("month") || "");
    const year = parseInt(searchParams.get("year") || "");

    if (!month || !year) {
      return NextResponse.json(
        { error: "month e year são obrigatórios" },
        { status: 400 }
      );
    }

    // 1. Buscar vendedores ativos
    const { data: sellers, error: sellersError } = await supabase
      .from("ote_sellers")
      .select("*")
      .eq("active", true);

    if (sellersError) {
      console.error("Erro ao buscar vendedores:", sellersError);
      return NextResponse.json(
        { error: "Erro ao buscar vendedores" },
        { status: 500 }
      );
    }

    // 2. Buscar meta do mês
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

    // 3. Buscar todos os deals do mês (usar deals_cache como em /ote/calculate)
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Último dia do mês

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    console.log("📊 Sellers Progress - Buscando deals:", {
      month,
      year,
      startDateStr,
      endDateStr,
    });

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
      `📊 Sellers Progress - Total deals encontrados: ${allDeals?.length || 0}`
    );

    // 4. Calcular vendas por vendedor
    console.log("📊 Sellers Progress - Total sellers:", sellers.length);
    console.log(
      "📊 Sellers Progress - Sellers with target_percentage > 0:",
      sellers.filter((s) => s.target_percentage > 0).length
    );

    const sellersProgress = sellers
      .filter((seller) => seller.target_percentage > 0)
      .map((seller) => {
        const normalizedSellerName = normalizeSellerName(seller.seller_name);

        console.log(
          `📊 Processing seller: ${seller.seller_name} → Normalized: ${normalizedSellerName}`
        );

        // Filtrar deals do vendedor (apenas ganhos)
        const sellerDeals = (allDeals || []).filter((deal: any) => {
          if (
            deal.status !== "won" &&
            deal.status !== "1" &&
            deal.status !== 1
          ) {
            return false;
          }
          const dealSellerName = normalizeSellerName(deal.vendedor || "");
          return dealSellerName === normalizedSellerName;
        });

        console.log(
          `📊 Seller ${normalizedSellerName} - Deals found: ${sellerDeals.length}`
        );

        // Calcular total de vendas e separar por tipo de tráfego
        // Classificar cada deal baseado no utm-source:
        // - Se utm-source contém "prospecção" (case-insensitive) → tráfego orgânico
        // - Caso contrário → tráfego pago
        let paidTrafficSales = 0;
        let organicSales = 0;
        let achieved = 0;

        sellerDeals.forEach((deal: any) => {
          const dealValue = (deal.value || 0) / 100;
          achieved += dealValue;

          // Verificar utm-source para classificar o tipo de tráfego
          const utmSource = (deal["utm-source"] || "").toLowerCase();
          const isOrganic = utmSource.includes("prospec");

          if (isOrganic) {
            organicSales += dealValue;
          } else {
            paidTrafficSales += dealValue;
          }
        });

        // Calcular meta individual
        const individualTarget =
          target.target_amount * (seller.target_percentage / 100);
        const remaining = Math.max(0, individualTarget - achieved);
        const progressPercentage =
          individualTarget > 0 ? (achieved / individualTarget) * 100 : 0;

        console.log(
          `📊 Seller ${normalizedSellerName} - Target: R$ ${individualTarget.toFixed(
            2
          )}, Achieved: R$ ${achieved.toFixed(
            2
          )}, Progress: ${progressPercentage.toFixed(
            1
          )}%, Paid: R$ ${paidTrafficSales.toFixed(
            2
          )}, Organic: R$ ${organicSales.toFixed(2)}`
        );

        return {
          seller_name: seller.seller_name,
          target_percentage: seller.target_percentage,
          individual_target: individualTarget,
          achieved,
          remaining,
          progress_percentage: progressPercentage,
          paid_traffic_sales: paidTrafficSales,
          organic_sales: organicSales,
        };
      });

    console.log(
      "📊 Sellers Progress - Returning data for",
      sellersProgress.length,
      "sellers"
    );

    return NextResponse.json({ sellers: sellersProgress });
  } catch (error) {
    console.error("Erro ao buscar progresso dos vendedores:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
