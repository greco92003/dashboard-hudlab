"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Target, DollarSign, Award, Zap } from "lucide-react";
import { OTECalculationResult, OTEConfig } from "@/types/ote";

interface UnifiedPerformanceCardProps {
  data: OTECalculationResult;
  config: OTEConfig;
}

interface SellerTargetInfo {
  seller_name: string;
  target_percentage: number;
  individual_target: number;
  achieved: number;
  remaining: number;
  progress_percentage: number;
  paid_traffic_sales: number;
  organic_sales: number;
}

export function UnifiedPerformanceCard({
  data,
  config,
}: UnifiedPerformanceCardProps) {
  const [currentSellerInfo, setCurrentSellerInfo] =
    useState<SellerTargetInfo | null>(null);
  const [loadingSellers, setLoadingSellers] = useState(true);

  // Buscar informações do vendedor atual
  useEffect(() => {
    const fetchSellersInfo = async () => {
      try {
        setLoadingSellers(true);
        const response = await fetch(
          `/api/ote/sellers-progress?month=${data.month}&year=${data.year}`
        );
        const result = await response.json();

        if (response.ok && result.sellers) {
          const currentSeller = result.sellers.find(
            (s: SellerTargetInfo) => s.seller_name === data.seller_name
          );
          setCurrentSellerInfo(currentSeller || null);
        }
      } catch (error) {
        console.error("Erro ao buscar progresso dos vendedores:", error);
      } finally {
        setLoadingSellers(false);
      }
    };

    fetchSellersInfo();
  }, [data.month, data.year, data.seller_name]);

  // Calcular metas por tipo de tráfego
  const paidTrafficTarget =
    (currentSellerInfo?.individual_target || 0) *
    (config.paid_traffic_percentage / 100);
  const organicTarget =
    (currentSellerInfo?.individual_target || 0) *
    (config.organic_percentage / 100);

  const paidTrafficSales = currentSellerInfo?.paid_traffic_sales || 0;
  const organicSales = currentSellerInfo?.organic_sales || 0;

  const paidTrafficRemaining = Math.max(
    0,
    paidTrafficTarget - paidTrafficSales
  );
  const organicRemaining = Math.max(0, organicTarget - organicSales);

  const paidTrafficProgress =
    paidTrafficTarget > 0 ? (paidTrafficSales / paidTrafficTarget) * 100 : 0;
  const organicProgress =
    organicTarget > 0 ? (organicSales / organicTarget) * 100 : 0;

  const achievementColor =
    data.achievement_percentage >= 100
      ? "text-green-600"
      : data.achievement_percentage >= 85
      ? "text-yellow-600"
      : "text-red-600";

  return (
    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-2 border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3 sm:pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg font-bold text-blue-900 dark:text-blue-100">
            Desempenho do Mês
          </CardTitle>
          <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6">
        {/* Seção 1: Meta da Empresa */}
        <div className="space-y-3 pb-4 sm:pb-6 border-b border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2">
            <Target className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600" />
            <h4 className="text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-100">
              Meta da Empresa
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Meta Total
              </div>
              <div className="text-base sm:text-lg font-bold text-blue-900 dark:text-blue-100 break-words">
                {formatCurrency(data.target_amount, "BRL")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Faturado
              </div>
              <div className="text-base sm:text-lg font-bold text-green-600 break-words">
                {formatCurrency(data.achieved_amount, "BRL")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Atingimento
              </div>
              <div
                className={`text-base sm:text-lg font-bold ${achievementColor}`}
              >
                {data.achievement_percentage.toFixed(1)}%
              </div>
            </div>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
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

        {/* Seção 2: Minha Meta Individual */}
        {currentSellerInfo && !loadingSellers && (
          <div className="space-y-3 pb-4 sm:pb-6 border-b border-blue-200 dark:border-blue-800">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <Award className="h-3 w-3 sm:h-4 sm:w-4 text-purple-600" />
                <h4 className="text-xs sm:text-sm font-semibold text-purple-900 dark:text-purple-100">
                  Minha Meta Individual
                </h4>
              </div>
              <span className="text-xs text-muted-foreground">
                {currentSellerInfo.target_percentage.toFixed(0)}% da meta da
                empresa
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Meta Individual
                </div>
                <div className="text-base sm:text-lg font-bold text-purple-900 dark:text-purple-100 break-words">
                  {formatCurrency(currentSellerInfo.individual_target, "BRL")}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Vendido
                </div>
                <div className="text-base sm:text-lg font-bold text-blue-600 break-words">
                  {formatCurrency(currentSellerInfo.achieved, "BRL")}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Falta
                </div>
                <div className="text-base sm:text-lg font-bold text-orange-600 break-words">
                  {formatCurrency(currentSellerInfo.remaining, "BRL")}
                </div>
              </div>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
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
            <div className="text-xs text-muted-foreground text-right">
              {currentSellerInfo.progress_percentage.toFixed(1)}% da meta
              individual atingida
            </div>
          </div>
        )}

        {/* Seção 3: Distribuição de Tráfego */}
        {currentSellerInfo && !loadingSellers && (
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600" />
              <h4 className="text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-100">
                Distribuição de Tráfego
              </h4>
            </div>

            {/* Tráfego Pago */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span className="text-xs sm:text-sm font-medium">
                    Tráfego Pago ({config.paid_traffic_percentage}%)
                  </span>
                </div>
                {paidTrafficProgress >= 100 && (
                  <span className="text-xs font-semibold text-green-600">
                    ✓ Meta batida!
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Meta</div>
                  <div className="font-semibold break-words">
                    {formatCurrency(paidTrafficTarget, "BRL")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Realizado</div>
                  <div className="font-semibold text-blue-600 break-words">
                    {formatCurrency(paidTrafficSales, "BRL")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Falta</div>
                  <div className="font-semibold text-orange-600 break-words">
                    {formatCurrency(paidTrafficRemaining, "BRL")}
                  </div>
                </div>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all"
                  style={{
                    width: `${Math.min(paidTrafficProgress, 100)}%`,
                  }}
                />
              </div>
              <div className="text-xs text-muted-foreground text-right">
                {paidTrafficProgress.toFixed(1)}% atingido
              </div>
            </div>

            {/* Tráfego Orgânico */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="text-xs sm:text-sm font-medium">
                    Tráfego Orgânico ({config.organic_percentage}%)
                  </span>
                </div>
                {organicProgress >= 100 && (
                  <span className="text-xs font-semibold text-green-600">
                    ✓ Meta batida!
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Meta</div>
                  <div className="font-semibold break-words">
                    {formatCurrency(organicTarget, "BRL")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Realizado</div>
                  <div className="font-semibold text-green-600 break-words">
                    {formatCurrency(organicSales, "BRL")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Falta</div>
                  <div className="font-semibold text-orange-600 break-words">
                    {formatCurrency(organicRemaining, "BRL")}
                  </div>
                </div>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-green-500 transition-all"
                  style={{
                    width: `${Math.min(organicProgress, 100)}%`,
                  }}
                />
              </div>
              <div className="text-xs text-muted-foreground text-right">
                {organicProgress.toFixed(1)}% atingido
              </div>
            </div>
          </div>
        )}

        {/* Seção 4: Comissão e Multiplicador */}
        <div className="space-y-3 pt-3 sm:pt-4 border-t border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2">
            <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
            <h4 className="text-xs sm:text-sm font-semibold text-green-900 dark:text-green-100">
              Comissão do Mês
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Multiplicador
              </div>
              <div className="text-xl sm:text-2xl font-bold text-blue-600">
                {data.multiplier.toFixed(2)}x
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Comissão Total
              </div>
              <div className="text-xl sm:text-2xl font-bold text-green-600 break-words">
                {formatCurrency(data.total_commission, "BRL")}
              </div>
            </div>
          </div>
          <div className="space-y-1 text-xs bg-white/50 dark:bg-black/20 p-2 sm:p-3 rounded-lg">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                Tráfego Pago ({config.paid_traffic_percentage}%):
              </span>
              <span className="font-medium break-words text-right">
                {formatCurrency(data.commission_paid_traffic, "BRL")}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                Orgânico ({config.organic_percentage}%):
              </span>
              <span className="font-medium break-words text-right">
                {formatCurrency(data.commission_organic, "BRL")}
              </span>
            </div>
          </div>
          <div className="pt-2 border-t border-blue-200 dark:border-blue-800">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2">
              <span className="text-xs sm:text-sm font-medium">
                Total a Receber:
              </span>
              <span className="text-xl sm:text-2xl font-bold text-green-600 break-words">
                {formatCurrency(data.total_earnings, "BRL")}
              </span>
            </div>
            <div className="text-xs text-muted-foreground text-right mt-1">
              Salário fixo + Comissão
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
