"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Target, DollarSign, Award } from "lucide-react";
import { OTECalculationResult, OTESeller, OTEConfig } from "@/types/ote";

interface CommissionCardProps {
  data: OTECalculationResult;
}

interface SellerTargetInfo {
  seller_name: string;
  target_percentage: number;
  individual_target: number;
  achieved: number;
  remaining: number;
  progress_percentage: number;
}

export function CommissionCard({ data }: CommissionCardProps) {
  const [currentSellerInfo, setCurrentSellerInfo] =
    useState<SellerTargetInfo | null>(null);
  const [loadingSellers, setLoadingSellers] = useState(true);
  const [config, setConfig] = useState<OTEConfig | null>(null);

  // Buscar configuração OTE
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch("/api/ote/config");
        if (response.ok) {
          const result = await response.json();
          setConfig(result.config);
        }
      } catch (error) {
        console.error("Erro ao buscar configuração OTE:", error);
      }
    };
    fetchConfig();
  }, []);

  // Buscar informações apenas do vendedor atual
  useEffect(() => {
    const fetchSellersInfo = async () => {
      try {
        setLoadingSellers(true);
        console.log(
          `🎯 CommissionCard - Fetching sellers progress for ${data.month}/${data.year}`
        );
        const response = await fetch(
          `/api/ote/sellers-progress?month=${data.month}&year=${data.year}`
        );
        const result = await response.json();

        console.log("🎯 CommissionCard - API Response:", result);

        if (response.ok && result.sellers) {
          console.log(
            `🎯 CommissionCard - Received ${result.sellers.length} sellers with individual targets`
          );
          // Filtrar apenas o vendedor atual
          const currentSeller = result.sellers.find(
            (s: SellerTargetInfo) => s.seller_name === data.seller_name
          );
          console.log(
            `🎯 CommissionCard - Current seller (${data.seller_name}):`,
            currentSeller
          );
          setCurrentSellerInfo(currentSeller || null);
        } else {
          console.error("🎯 CommissionCard - API Error:", result);
        }
      } catch (error) {
        console.error("Erro ao buscar progresso dos vendedores:", error);
      } finally {
        setLoadingSellers(false);
      }
    };

    fetchSellersInfo();
  }, [data.month, data.year, data.seller_name]);

  const achievementColor =
    data.achievement_percentage >= 100
      ? "text-green-600"
      : data.achievement_percentage >= 85
      ? "text-yellow-600"
      : "text-red-600";

  const multiplierColor =
    data.multiplier >= 1.5
      ? "text-green-600"
      : data.multiplier >= 1
      ? "text-blue-600"
      : data.multiplier >= 0.5
      ? "text-yellow-600"
      : "text-gray-600";

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Card Principal: Meta do Mês - Destaque no topo */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-2 border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-2 sm:pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm sm:text-base font-semibold text-blue-900 dark:text-blue-100">
              Meta do Mês
            </CardTitle>
            <Target className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Progresso - Destaque no topo em mobile */}
          <div className="space-y-1 md:hidden">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Progresso
            </div>
            <div className={`text-3xl font-bold ${achievementColor}`}>
              {data.achievement_percentage.toFixed(1)}%
            </div>
            {/* Barra de progresso */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mt-2">
              <div
                className={`h-3 rounded-full transition-all ${
                  data.achievement_percentage >= 100
                    ? "bg-green-600"
                    : data.achievement_percentage >= 85
                    ? "bg-yellow-600"
                    : "bg-red-600"
                }`}
                style={{
                  width: `${Math.min(data.achievement_percentage, 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {/* Meta */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Meta
              </div>
              <div className="text-lg sm:text-2xl font-bold text-blue-900 dark:text-blue-100 break-words">
                {formatCurrency(data.target_amount, "BRL")}
              </div>
            </div>

            {/* Faturamento Total (Atingido) */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Faturamento
              </div>
              <div className="text-lg sm:text-2xl font-bold text-blue-900 dark:text-blue-100 break-words">
                {formatCurrency(data.achieved_amount, "BRL")}
              </div>
              <div className="text-xs text-muted-foreground">
                {data.deals_count} negócios
              </div>
              <div className="text-xs text-muted-foreground">
                {data.pairs_sold} pares
              </div>
            </div>

            {/* Progresso - Desktop */}
            <div className="space-y-1 hidden md:block">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Progresso
              </div>
              <div className={`text-3xl font-bold ${achievementColor}`}>
                {data.achievement_percentage.toFixed(1)}%
              </div>
              {/* Barra de progresso */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mt-2">
                <div
                  className={`h-3 rounded-full transition-all ${
                    data.achievement_percentage >= 100
                      ? "bg-green-600"
                      : data.achievement_percentage >= 85
                      ? "bg-yellow-600"
                      : "bg-red-600"
                  }`}
                  style={{
                    width: `${Math.min(data.achievement_percentage, 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card: Meta Individual do Vendedor */}
      {currentSellerInfo && (
        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 border-2 border-purple-200 dark:border-purple-800">
          <CardHeader className="pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm sm:text-base font-semibold text-purple-900 dark:text-purple-100">
                Minha Meta Individual
              </CardTitle>
              <Target className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {currentSellerInfo.target_percentage.toFixed(0)}% da meta da
              empresa
            </div>
          </CardHeader>
          <CardContent>
            {loadingSellers ? (
              <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      Meta Individual
                    </div>
                    <div className="text-lg sm:text-xl font-bold text-purple-900 dark:text-purple-100 break-words">
                      {formatCurrency(
                        currentSellerInfo.individual_target,
                        "BRL"
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      Vendido
                    </div>
                    <div className="text-lg sm:text-xl font-bold text-blue-600 break-words">
                      {formatCurrency(currentSellerInfo.achieved, "BRL")}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      Falta
                    </div>
                    <div className="text-lg sm:text-xl font-bold text-orange-600 break-words">
                      {formatCurrency(currentSellerInfo.remaining, "BRL")}
                    </div>
                  </div>
                </div>

                {/* Barra de progresso */}
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      currentSellerInfo.progress_percentage >= 100
                        ? "bg-green-600"
                        : currentSellerInfo.progress_percentage >= 70
                        ? "bg-blue-600"
                        : "bg-orange-600"
                    }`}
                    style={{
                      width: `${Math.min(
                        currentSellerInfo.progress_percentage,
                        100
                      )}%`,
                    }}
                  />
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground text-right">
                  {currentSellerInfo.progress_percentage.toFixed(1)}% da meta
                  individual atingida
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cards Secundários: Grid com 3 colunas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Card: Multiplicador */}
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                Multiplicador
              </CardTitle>
              <Award className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div
                className={`text-3xl sm:text-4xl font-bold ${multiplierColor}`}
              >
                {data.multiplier.toFixed(1)}x
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground">
                Baseado no atingimento de{" "}
                {data.achievement_percentage.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                {data.multiplier === 0 && "Abaixo de 71%"}
                {data.multiplier === 0.5 && "Entre 71% e 85%"}
                {data.multiplier === 0.7 && "Entre 86% e 99%"}
                {data.multiplier === 1 && "Entre 100% e 119%"}
                {data.multiplier === 1.5 && "Entre 120% e 149%"}
                {data.multiplier === 2 && "Acima de 150%"}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card: Comissão Total */}
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                Comissão Total
              </CardTitle>
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-xl sm:text-2xl font-bold text-green-600 break-words">
                {formatCurrency(data.total_commission, "BRL")}
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground truncate">
                    Tráfego Pago ({config?.paid_traffic_percentage || 80}%):
                  </span>
                  <span className="font-medium whitespace-nowrap">
                    {formatCurrency(data.commission_paid_traffic, "BRL")}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground truncate">
                    Orgânico ({config?.organic_percentage || 20}%):
                  </span>
                  <span className="font-medium whitespace-nowrap">
                    {formatCurrency(data.commission_organic, "BRL")}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card: Total de Ganhos */}
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                Total de Ganhos
              </CardTitle>
              <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-400 break-words">
                {formatCurrency(data.total_earnings, "BRL")}
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Salário Fixo:</span>
                  <span className="font-medium whitespace-nowrap">
                    {formatCurrency(data.salary_fixed, "BRL")}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Comissão:</span>
                  <span className="font-medium text-green-600 whitespace-nowrap">
                    {formatCurrency(data.total_commission, "BRL")}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
