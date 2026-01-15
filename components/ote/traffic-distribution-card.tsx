"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Target } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface TrafficDistributionCardProps {
  paidTrafficPercentage: number; // % configurado (ex: 80)
  organicPercentage: number; // % configurado (ex: 20)
  paidTrafficSales: number; // Vendas de tráfego pago
  organicSales: number; // Vendas de tráfego orgânico
  targetAmount: number; // Meta total
}

export function TrafficDistributionCard({
  paidTrafficPercentage,
  organicPercentage,
  paidTrafficSales,
  organicSales,
  targetAmount,
}: TrafficDistributionCardProps) {
  // Calcular metas por tipo de tráfego
  const paidTrafficTarget = targetAmount * (paidTrafficPercentage / 100);
  const organicTarget = targetAmount * (organicPercentage / 100);

  // Calcular quanto falta para cada meta
  const paidTrafficRemaining = Math.max(0, paidTrafficTarget - paidTrafficSales);
  const organicRemaining = Math.max(0, organicTarget - organicSales);

  // Calcular % de progresso
  const paidTrafficProgress =
    paidTrafficTarget > 0 ? (paidTrafficSales / paidTrafficTarget) * 100 : 0;
  const organicProgress =
    organicTarget > 0 ? (organicSales / organicTarget) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Distribuição de Tráfego
          </CardTitle>
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tráfego Pago */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-blue-500" />
              <span className="text-sm font-medium">
                Tráfego Pago ({paidTrafficPercentage}%)
              </span>
            </div>
            <Target className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Meta</div>
              <div className="font-semibold">
                {formatCurrency(paidTrafficTarget, "BRL")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Realizado</div>
              <div className="font-semibold text-blue-600">
                {formatCurrency(paidTrafficSales, "BRL")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Falta</div>
              <div className="font-semibold text-orange-600">
                {formatCurrency(paidTrafficRemaining, "BRL")}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Progress value={Math.min(paidTrafficProgress, 100)} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{paidTrafficProgress.toFixed(1)}% atingido</span>
              {paidTrafficProgress >= 100 && (
                <span className="text-green-600 font-semibold">✓ Meta batida!</span>
              )}
            </div>
          </div>
        </div>

        {/* Tráfego Orgânico */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-sm font-medium">
                Tráfego Orgânico ({organicPercentage}%)
              </span>
            </div>
            <Target className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Meta</div>
              <div className="font-semibold">
                {formatCurrency(organicTarget, "BRL")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Realizado</div>
              <div className="font-semibold text-green-600">
                {formatCurrency(organicSales, "BRL")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Falta</div>
              <div className="font-semibold text-orange-600">
                {formatCurrency(organicRemaining, "BRL")}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Progress value={Math.min(organicProgress, 100)} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{organicProgress.toFixed(1)}% atingido</span>
              {organicProgress >= 100 && (
                <span className="text-green-600 font-semibold">✓ Meta batida!</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

