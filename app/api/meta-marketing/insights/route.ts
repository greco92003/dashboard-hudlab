import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const accessToken = process.env.META_ACCESS_TOKEN;
    const businessId = process.env.META_BUSINESS_ID;

    if (!accessToken) {
      return NextResponse.json(
        { error: "META_ACCESS_TOKEN não configurado" },
        { status: 500 }
      );
    }

    if (!businessId) {
      return NextResponse.json(
        { error: "META_BUSINESS_ID não configurado" },
        { status: 500 }
      );
    }

    // Obter parâmetros da query string
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    console.log("Parâmetros recebidos:", { days, startDate, endDate });

    // Primeiro, buscar as contas de anúncios
    const businessUrl = `https://graph.facebook.com/v23.0/${businessId}/owned_ad_accounts`;
    const businessParams = new URLSearchParams({
      access_token: accessToken,
      fields: "id",
    });

    const businessResponse = await fetch(`${businessUrl}?${businessParams}`);

    if (!businessResponse.ok) {
      const errorText = await businessResponse.text();
      console.error("Erro na resposta do business:", errorText);
      return NextResponse.json(
        {
          error: `Erro ao buscar contas do business: ${businessResponse.status}`,
        },
        { status: businessResponse.status }
      );
    }

    const businessData = await businessResponse.json();

    if (!businessData.data || businessData.data.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma conta de anúncios encontrada" },
        { status: 404 }
      );
    }

    // Usar a primeira conta de anúncios
    const adAccountId = businessData.data[0].id;

    // Buscar insights da conta de anúncios
    const insightsUrl = `https://graph.facebook.com/v23.0/${adAccountId}/insights`;

    // Calcular datas baseado nos parâmetros
    let timeRange: any;
    let calculatedStartDate: Date;
    let calculatedEndDate: Date;

    const formatDate = (date: Date) => {
      return date.toISOString().split("T")[0];
    };

    if (startDate && endDate) {
      // Usar datas personalizadas
      calculatedStartDate = new Date(startDate);
      calculatedEndDate = new Date(endDate);
      timeRange = {
        since: startDate,
        until: endDate,
      };
      console.log("Período personalizado:", startDate, "até", endDate);
    } else {
      // Calcular datas baseado no número de dias
      const now = new Date();
      calculatedEndDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1
      ); // Ontem
      calculatedStartDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - days
      ); // N dias atrás

      timeRange = {
        since: formatDate(calculatedStartDate),
        until: formatDate(calculatedEndDate),
      };

      console.log(
        "Período calculado:",
        formatDate(calculatedStartDate),
        "até",
        formatDate(calculatedEndDate),
        `(${days} dias)`
      );
    }

    const insightsParams = new URLSearchParams({
      access_token: accessToken,
      fields: "impressions,clicks,spend,cpm,cpc,ctr",
      time_range: JSON.stringify(timeRange),
      level: "account",
    });

    console.log("Buscando insights para conta:", adAccountId);
    console.log("Time range:", timeRange);

    const insightsResponse = await fetch(`${insightsUrl}?${insightsParams}`);

    if (!insightsResponse.ok) {
      const errorText = await insightsResponse.text();
      console.error("Erro na resposta dos insights:", errorText);
      return NextResponse.json(
        { error: `Erro ao buscar insights: ${insightsResponse.status}` },
        { status: insightsResponse.status }
      );
    }

    const insightsData = await insightsResponse.json();
    console.log("Dados dos insights:", insightsData);

    // Se não há dados de insights, retornar valores zerados
    if (!insightsData.data || insightsData.data.length === 0) {
      return NextResponse.json({
        impressions: "0",
        clicks: "0",
        spend: "0",
        cpm: "0",
        cpc: "0",
        ctr: "0",
      });
    }

    // Agregar dados se houver múltiplos registros
    const aggregatedData = insightsData.data.reduce(
      (acc: any, item: any) => {
        return {
          impressions: (
            parseInt(acc.impressions || "0") + parseInt(item.impressions || "0")
          ).toString(),
          clicks: (
            parseInt(acc.clicks || "0") + parseInt(item.clicks || "0")
          ).toString(),
          spend: (
            parseFloat(acc.spend || "0") + parseFloat(item.spend || "0")
          ).toString(),
          cpm: item.cpm || "0",
          cpc: item.cpc || "0",
          ctr: item.ctr || "0",
        };
      },
      {
        impressions: "0",
        clicks: "0",
        spend: "0",
        cpm: "0",
        cpc: "0",
        ctr: "0",
      }
    );

    return NextResponse.json(aggregatedData);
  } catch (error) {
    console.error("Erro ao buscar insights da Meta:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
