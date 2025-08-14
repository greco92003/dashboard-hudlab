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

    console.log(
      "🔍 Buscando anúncios ativos com insights (versão otimizada)..."
    );

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
    console.log("📊 Conta de anúncios:", adAccountId);

    // Buscar campanhas ativas (limite aumentado para 100)
    const campaignsUrl = `https://graph.facebook.com/v23.0/${adAccountId}/campaigns`;
    const campaignsParams = new URLSearchParams({
      access_token: accessToken,
      fields: "id,name,status,objective",
      filtering: JSON.stringify([
        {
          field: "delivery_info",
          operator: "IN",
          value: ["active", "limited"],
        },
      ]),
      limit: "100", // Aumentado para 100
    });

    console.log("🎯 Buscando campanhas ativas...");
    const campaignsResponse = await fetch(`${campaignsUrl}?${campaignsParams}`);

    if (!campaignsResponse.ok) {
      const errorText = await campaignsResponse.text();
      console.error("Erro ao buscar campanhas:", errorText);
      return NextResponse.json(
        { error: `Erro ao buscar campanhas: ${campaignsResponse.status}` },
        { status: campaignsResponse.status }
      );
    }

    const campaignsData = await campaignsResponse.json();
    console.log(`📈 Encontradas ${campaignsData.data?.length || 0} campanhas`);

    if (!campaignsData.data || campaignsData.data.length === 0) {
      return NextResponse.json([]);
    }

    // OTIMIZAÇÃO: Buscar anúncios de todas as campanhas em paralelo
    console.log(
      `🚀 Buscando anúncios de ${campaignsData.data.length} campanhas em paralelo...`
    );

    // Função para buscar anúncios de uma campanha
    const fetchCampaignAds = async (campaign: {
      id: string;
      name: string;
      objective?: string;
    }) => {
      console.log(`🔍 Buscando anúncios da campanha: ${campaign.name}`);

      const adsUrl = `https://graph.facebook.com/v23.0/${campaign.id}/ads`;
      const adsParams = new URLSearchParams({
        access_token: accessToken,
        fields:
          "id,name,status,creative{object_story_spec,effective_object_story_id},adset_id",
        filtering: JSON.stringify([
          {
            field: "delivery_info",
            operator: "IN",
            value: ["active", "limited"],
          },
        ]),
        limit: "100", // Aumentado para 100
      });

      try {
        const adsResponse = await fetch(`${adsUrl}?${adsParams}`);

        if (adsResponse.ok) {
          const adsData = await adsResponse.json();

          if (adsData.data && adsData.data.length > 0) {
            console.log(
              `📱 Encontrados ${adsData.data.length} anúncios ativos na campanha ${campaign.name}`
            );

            // OTIMIZAÇÃO: Buscar insights em paralelo para todos os anúncios desta campanha
            const adsWithInsights = await Promise.all(
              adsData.data.map(async (ad: any) => {
                try {
                  let spend = "0";
                  let costPerResult = "0";

                  // Buscar insights do anúncio (últimos 30 dias)
                  const insightsUrl = `https://graph.facebook.com/v23.0/${ad.id}/insights`;
                  const insightsParams = new URLSearchParams({
                    access_token: accessToken,
                    fields:
                      "spend,cost_per_result,cost_per_action_type,actions",
                    time_range: JSON.stringify({
                      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                        .toISOString()
                        .split("T")[0],
                      until: new Date().toISOString().split("T")[0],
                    }),
                    level: "ad",
                  });

                  const insightsResponse = await fetch(
                    `${insightsUrl}?${insightsParams}`
                  );

                  if (insightsResponse.ok) {
                    const insightsData = await insightsResponse.json();

                    if (insightsData.data && insightsData.data.length > 0) {
                      const insights = insightsData.data[0];
                      spend = insights.spend || "0";

                      // Priorizar cost_per_result direto da API (baseado no objetivo da campanha)
                      if (insights.cost_per_result) {
                        // cost_per_result pode vir como array de objetos, extrair o valor correto
                        if (
                          Array.isArray(insights.cost_per_result) &&
                          insights.cost_per_result.length > 0
                        ) {
                          const resultData = insights.cost_per_result[0];
                          if (
                            resultData.values &&
                            resultData.values.length > 0 &&
                            resultData.values[0].value
                          ) {
                            costPerResult = resultData.values[0].value;
                          } else {
                            // Se não tem values ou value, pode ser que o valor esteja em outro lugar
                            // ou que não haja dados suficientes para calcular
                            costPerResult = "0";
                          }
                        } else if (
                          typeof insights.cost_per_result === "string" ||
                          typeof insights.cost_per_result === "number"
                        ) {
                          costPerResult = insights.cost_per_result.toString();
                        }
                        console.log(
                          `✅ Cost per result direto da API para anúncio ${ad.name}:`,
                          {
                            raw: insights.cost_per_result,
                            extracted: costPerResult,
                          }
                        );
                      } else if (
                        insights.cost_per_action_type &&
                        insights.cost_per_action_type.length > 0
                      ) {
                        // Mapear objetivo da campanha para tipo de ação específico
                        let targetActionType = null;

                        switch (campaign.objective) {
                          case "OUTCOME_SALES":
                            targetActionType = "subscribe";
                            break;
                          case "OUTCOME_TRAFFIC":
                            targetActionType = "instagram_profile_visit";
                            break;
                          case "OUTCOME_LEADS":
                            targetActionType = "lead";
                            break;
                          case "OUTCOME_ENGAGEMENT":
                            targetActionType = "post_engagement";
                            break;
                          case "OUTCOME_APP_PROMOTION":
                            targetActionType = "app_install";
                            break;
                          case "OUTCOME_AWARENESS":
                            targetActionType = "reach";
                            break;
                          default:
                            // Fallback para objetivos não mapeados
                            targetActionType = null;
                        }

                        let foundCostPerAction = null;

                        // Primeiro, tentar encontrar o tipo de ação específico do objetivo
                        if (targetActionType) {
                          foundCostPerAction =
                            insights.cost_per_action_type.find(
                              (action: any) =>
                                action.action_type === targetActionType
                            );
                        }

                        // Se não encontrou o tipo específico, usar fallback com prioridades gerais
                        if (!foundCostPerAction) {
                          const fallbackActionTypes = [
                            "purchase",
                            "lead",
                            "complete_registration",
                            "subscribe",
                            "add_to_cart",
                            "initiate_checkout",
                            "add_payment_info",
                          ];

                          for (const actionType of fallbackActionTypes) {
                            foundCostPerAction =
                              insights.cost_per_action_type.find(
                                (action: any) =>
                                  action.action_type === actionType
                              );
                            if (foundCostPerAction) break;
                          }
                        }

                        // Se ainda não encontrou, pega o primeiro disponível
                        if (
                          !foundCostPerAction &&
                          insights.cost_per_action_type.length > 0
                        ) {
                          foundCostPerAction = insights.cost_per_action_type[0];
                        }

                        if (foundCostPerAction && foundCostPerAction.value) {
                          costPerResult = foundCostPerAction.value;
                          console.log(
                            `💰 Cost per result encontrado para anúncio ${ad.name}:`,
                            {
                              campaign_objective: campaign.objective,
                              action_type: foundCostPerAction.action_type,
                              cost_per_result: costPerResult,
                            }
                          );
                        } else {
                          console.log(
                            `⚠️ Nenhum cost per result encontrado para anúncio ${ad.name}:`,
                            {
                              campaign_objective: campaign.objective,
                              available_action_types:
                                insights.cost_per_action_type?.map(
                                  (a: any) => a.action_type
                                ) || [],
                            }
                          );
                        }
                      }
                    }
                  }

                  // Garantir que cost_per_result seja sempre uma string válida
                  const validCostPerResult =
                    costPerResult && !isNaN(parseFloat(costPerResult))
                      ? costPerResult
                      : "0";

                  return {
                    id: ad.id,
                    name: ad.name,
                    status: ad.status,
                    campaign_id: campaign.id,
                    campaign_name: campaign.name,
                    campaign_objective: campaign.objective,
                    adset_id: ad.adset_id,
                    spend: spend,
                    cost_per_result: validCostPerResult,
                  };
                } catch (error) {
                  console.error(`Erro ao processar anúncio ${ad.id}:`, error);
                  // Retornar anúncio mesmo sem insights
                  return {
                    id: ad.id,
                    name: ad.name,
                    status: ad.status,
                    campaign_id: campaign.id,
                    campaign_name: campaign.name,
                    campaign_objective: campaign.objective,
                    adset_id: ad.adset_id,
                    spend: "0",
                    cost_per_result: "0",
                  };
                }
              })
            );

            return adsWithInsights;
          }
        } else {
          console.error(
            `Erro ao buscar anúncios da campanha ${campaign.id}:`,
            adsResponse.status
          );
        }
      } catch (error) {
        console.error(`Erro ao processar campanha ${campaign.id}:`, error);
      }

      return [];
    };

    // OTIMIZAÇÃO: Executar busca de anúncios para todas as campanhas em paralelo
    const campaignAdsResults = await Promise.all(
      campaignsData.data.map((campaign: any) => fetchCampaignAds(campaign))
    );

    // Flatten dos resultados
    const allAds: any[] = [];
    campaignAdsResults.forEach((campaignAds: any) => {
      allAds.push(...campaignAds);
    });

    console.log(
      `✅ Total de anúncios ativos com insights encontrados: ${allAds.length} (versão otimizada)`
    );
    return NextResponse.json(allAds);
  } catch (error) {
    console.error("Erro ao buscar anúncios da Meta:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
