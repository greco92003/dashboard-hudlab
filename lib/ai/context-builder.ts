import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

type SupabaseClientType = SupabaseClient<Database>;

/**
 * Busca contexto de negócios para o analista IA
 * Retorna dados relevantes baseado no perfil e permissões do usuário
 * @param supabase - Cliente Supabase
 * @param userId - ID do usuário
 * @param periodDays - Número de dias para buscar (padrão: 30)
 */
export async function getBusinessContext(
  supabase: SupabaseClientType,
  userId: string,
  periodDays: number = 30
) {
  try {
    // Buscar perfil do usuário
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, first_name, last_name, email")
      .eq("id", userId)
      .single<{
        role: string;
        first_name: string;
        last_name: string;
        email: string;
      }>();

    if (!profile) {
      return { error: "Perfil não encontrado" };
    }

    // Calcular datas baseado no período solicitado
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    // Descrição do período
    let periodDescription = "";
    if (periodDays === 30) {
      periodDescription = "Último mês (30 dias)";
    } else if (periodDays === 60) {
      periodDescription = "Últimos 2 meses (60 dias)";
    } else if (periodDays === 90) {
      periodDescription = "Últimos 3 meses (90 dias)";
    } else {
      periodDescription = `Últimos ${periodDays} dias`;
    }

    const formatDate = (date: Date) => {
      return date.toISOString().split("T")[0];
    };

    // Buscar deals dos últimos 30 dias com TODOS os campos relevantes
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
      .limit(200)
      .returns<
        Array<{
          deal_id: string;
          title: string;
          value: number;
          status: string | null;
          closing_date: string | null;
          created_date: string | null;
          estado: string | null;
          "quantidade-de-pares": string | null;
          vendedor: string | null;
          designer: string | null;
          "utm-source": string | null;
          "utm-medium": string | null;
        }>
      >();

    if (dealsError) {
      console.error("Erro ao buscar deals:", dealsError);
    }

    console.log("📊 Deals encontrados:", {
      total: deals?.length || 0,
      periodo: `${formatDate(startDate)} até ${formatDate(endDate)}`,
      primeiros3: deals?.slice(0, 3).map((d) => ({
        title: d.title,
        value: d.value,
        status: d.status,
        closing_date: d.closing_date,
        quantidade_pares: d["quantidade-de-pares"],
        vendedor: d.vendedor,
      })),
    });

    // Calcular métricas de deals
    const totalDeals = deals?.length || 0;

    // Log para debug - ver status únicos
    const uniqueStatuses = [...new Set(deals?.map((d) => d.status))];
    console.log("📋 Status únicos encontrados:", uniqueStatuses);

    // Filtrar deals ganhos (pode ser "won" ou "1" dependendo da fonte)
    const wonDeals =
      deals?.filter(
        (d) =>
          d.status === "won" ||
          d.status === "1" ||
          d.status?.toLowerCase() === "won"
      ) || [];

    console.log("✅ Deals ganhos:", {
      total: wonDeals.length,
      primeiros3: wonDeals.slice(0, 3).map((d) => ({
        title: d.title,
        value: d.value,
        status: d.status,
      })),
    });

    // IMPORTANTE: O valor está em centavos, precisa dividir por 100
    const totalRevenue = wonDeals.reduce(
      (sum, d) => sum + (d.value || 0) / 100,
      0
    );
    const averageTicket =
      wonDeals.length > 0 ? totalRevenue / wonDeals.length : 0;

    // Calcular métricas de pares
    const dealsWithPairs = wonDeals.filter((d) => {
      const pairs = d["quantidade-de-pares"];
      return pairs && pairs !== "N/A" && pairs !== "" && !isNaN(Number(pairs));
    });

    console.log("🔍 DEBUG - Primeiros 5 deals com pares:", {
      deals: dealsWithPairs.slice(0, 5).map((d) => ({
        title: d.title,
        value_centavos: d.value,
        value_reais: (d.value || 0) / 100,
        quantidade_pares_raw: d["quantidade-de-pares"],
        quantidade_pares_number: Number(d["quantidade-de-pares"]),
        ticket_por_par: (d.value || 0) / 100 / Number(d["quantidade-de-pares"]),
        tipo: typeof d["quantidade-de-pares"],
      })),
    });

    const totalPairs = dealsWithPairs.reduce((sum, d) => {
      const pairs = Number(d["quantidade-de-pares"]) || 0;
      return sum + pairs;
    }, 0);

    // IMPORTANTE: O valor está em centavos, precisa dividir por 100
    const totalRevenueWithPairs = dealsWithPairs.reduce(
      (sum, d) => sum + (d.value || 0) / 100,
      0
    );

    const averageTicketPerPair =
      totalPairs > 0 ? totalRevenueWithPairs / totalPairs : 0;

    console.log("👟 Métricas de Pares:", {
      dealsComPares: dealsWithPairs.length,
      totalPares: totalPairs,
      receitaComPares: totalRevenueWithPairs,
      ticketMedioPorPar: averageTicketPerPair,
      calculoDetalhado: `R$ ${totalRevenueWithPairs.toFixed(
        2
      )} ÷ ${totalPairs} pares = R$ ${averageTicketPerPair.toFixed(2)}`,
    });

    // Agrupar por vendedor (apenas deals ganhos)
    // IMPORTANTE: Dividir valor por 100 (está em centavos)
    const sellerStats = wonDeals?.reduce((acc: any, deal) => {
      const seller = deal.vendedor || "Não atribuído";
      if (!acc[seller]) {
        acc[seller] = { count: 0, revenue: 0 };
      }
      acc[seller].count++;
      acc[seller].revenue += (deal.value || 0) / 100;
      return acc;
    }, {});

    // Agrupar por designer (apenas deals ganhos)
    // IMPORTANTE: Dividir valor por 100 (está em centavos)
    const designerStats = wonDeals?.reduce((acc: any, deal) => {
      const designer = deal.designer || "Não atribuído";
      if (!acc[designer]) {
        acc[designer] = { count: 0, revenue: 0 };
      }
      acc[designer].count++;
      acc[designer].revenue += (deal.value || 0) / 100;
      return acc;
    }, {});

    // Buscar produtos (top 20)
    const { data: products } = await supabase
      .from("nuvemshop_products")
      .select("product_id, name_pt, brand, price, published")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<
        Array<{
          product_id: string;
          name_pt: string;
          brand: string | null;
          price: number;
          published: boolean;
        }>
      >();

    // Buscar metas ativas
    const { data: goals } = await supabase
      .from("goals")
      .select(
        "id, title, goal_type, target_type, general_goal_value, start_date, end_date"
      )
      .eq("is_archived", false)
      .gte("end_date", formatDate(new Date()))
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<
        Array<{
          id: string;
          title: string;
          goal_type: string;
          target_type: string;
          general_goal_value: number | null;
          start_date: string;
          end_date: string;
        }>
      >();

    // Montar contexto estruturado
    const context = {
      user: {
        name: `${profile.first_name} ${profile.last_name}`,
        role: profile.role,
        email: profile.email,
      },
      period: {
        start: formatDate(startDate),
        end: formatDate(endDate),
        days: periodDays,
        description: periodDescription,
      },
      deals: {
        total: totalDeals,
        won: wonDeals.length,
        lost: deals?.filter((d) => d.status === "lost").length || 0,
        open: deals?.filter((d) => d.status === "open").length || 0,
        totalRevenue: totalRevenue,
        averageTicket: averageTicket,
        conversionRate:
          totalDeals > 0 ? (wonDeals.length / totalDeals) * 100 : 0,
        // Métricas de pares (PRÉ-CALCULADAS)
        totalPairs: totalPairs,
        dealsWithPairs: dealsWithPairs.length,
        averageTicketPerPair: averageTicketPerPair,
        // Lista completa de deals ganhos com todos os detalhes
        detailedList: wonDeals.map((d) => ({
          title: d.title,
          value: (d.value || 0) / 100, // Converter de centavos para reais
          closing_date: d.closing_date,
          created_date: d.created_date,
          estado: d.estado,
          quantidade_pares: d["quantidade-de-pares"],
          vendedor: d.vendedor,
          designer: d.designer,
          utm_source: d["utm-source"],
          utm_medium: d["utm-medium"],
        })),
      },
      sellers: Object.entries(sellerStats || {})
        .map(([name, stats]: [string, any]) => ({
          name,
          deals: stats.count,
          revenue: stats.revenue,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
      designers: Object.entries(designerStats || {})
        .map(([name, stats]: [string, any]) => ({
          name,
          deals: stats.count,
          revenue: stats.revenue,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
      products: {
        total: products?.length || 0,
        topProducts: products?.slice(0, 10).map((p) => ({
          name: p.name_pt,
          brand: p.brand,
          price: p.price,
        })),
      },
      goals: goals?.map((g) => ({
        title: g.title,
        type: g.goal_type,
        target: g.target_type,
        value: g.general_goal_value,
        period: `${g.start_date} a ${g.end_date}`,
      })),
    };

    return context;
  } catch (error) {
    console.error("Erro ao buscar contexto:", error);
    return { error: "Erro ao buscar dados" };
  }
}

/**
 * Formata o contexto em texto para o prompt do ChatGPT
 */
export function formatContextForPrompt(context: any): string {
  if (context.error) {
    return `Erro ao carregar dados: ${context.error}`;
  }

  return `
# Contexto de Dados do Dashboard HUDLAB

## Usuário
- Nome: ${context.user.name}
- Cargo: ${context.user.role}
- Email: ${context.user.email}

## Período de Análise
${context.period.description} (${context.period.start} até ${
    context.period.end
  })

## Negócios (Deals) - Resumo
- Total de negócios: ${context.deals.total}
- Negócios ganhos: ${context.deals.won}
- Negócios perdidos: ${context.deals.lost}
- Negócios em aberto: ${context.deals.open}
- Receita total: R$ ${context.deals.totalRevenue.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
  })}
- Ticket médio por negócio: R$ ${context.deals.averageTicket.toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits: 2,
    }
  )}
- Taxa de conversão: ${context.deals.conversionRate.toFixed(2)}%

## Métricas de Pares (PRÉ-CALCULADAS)
⚠️ IMPORTANTE: Use estes valores já calculados, não tente recalcular!
- Total de pares vendidos: ${context.deals.totalPairs} pares
- Negócios com quantidade de pares informada: ${context.deals.dealsWithPairs}
- **TICKET MÉDIO POR PAR: R$ ${context.deals.averageTicketPerPair.toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits: 2,
    }
  )}**
- Cálculo: R$ ${context.deals.totalRevenue.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
  })} ÷ ${
    context.deals.totalPairs
  } pares = R$ ${context.deals.averageTicketPerPair.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
  })}

## Lista Detalhada de Negócios Ganhos (Primeiros 20)
⚠️ Use esta lista apenas para análises específicas. Para métricas gerais, use os valores pré-calculados acima.
${
  context.deals.detailedList && context.deals.detailedList.length > 0
    ? context.deals.detailedList
        .slice(0, 20) // Limitar a 20 para reduzir tokens
        .map(
          (deal: any, i: number) =>
            `${i + 1}. ${deal.title} | R$ ${
              deal.value?.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              }) || "0,00"
            } | ${deal.quantidade_pares || "?"} pares | ${
              deal.vendedor || "?"
            } | ${deal.estado || "?"}`
        )
        .join("\n")
    : "Nenhum negócio ganho no período"
}
${
  context.deals.detailedList && context.deals.detailedList.length > 20
    ? `\n... e mais ${context.deals.detailedList.length - 20} negócios`
    : ""
}

## Top 5 Vendedores
${context.sellers
  .map(
    (s: any, i: number) =>
      `${i + 1}. ${s.name} - ${
        s.deals
      } negócios - R$ ${s.revenue.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
      })}`
  )
  .join("\n")}

## Top 5 Designers
${context.designers
  .map(
    (d: any, i: number) =>
      `${i + 1}. ${d.name} - ${
        d.deals
      } negócios - R$ ${d.revenue.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
      })}`
  )
  .join("\n")}

## Produtos
- Total de produtos ativos: ${context.products.total}
- Top 10 produtos recentes:
${
  context.products.topProducts
    ?.map(
      (p: any, i: number) =>
        `  ${i + 1}. ${p.name} (${p.brand}) - R$ ${p.price}`
    )
    .join("\n") || "Nenhum produto encontrado"
}

## Metas Ativas
${
  context.goals?.length > 0
    ? context.goals
        .map(
          (g: any, i: number) =>
            `${i + 1}. ${g.title} (${g.type}) - Valor: R$ ${
              g.value || "N/A"
            } - Período: ${g.period}`
        )
        .join("\n")
    : "Nenhuma meta ativa"
}
`;
}
