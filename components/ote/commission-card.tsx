"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Target, DollarSign, Award } from "lucide-react";
import { OTECalculationResult } from "@/types/ote";

interface CommissionCardProps {
  data: OTECalculationResult;
}

export function CommissionCard({ data }: CommissionCardProps) {
  const achievementColor = 
    data.achievement_percentage >= 100 ? "text-green-600" :
    data.achievement_percentage >= 85 ? "text-yellow-600" :
    "text-red-600";

  const multiplierColor =
    data.multiplier >= 1.5 ? "text-green-600" :
    data.multiplier >= 1 ? "text-blue-600" :
    data.multiplier >= 0.5 ? "text-yellow-600" :
    "text-gray-600";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Card 1: Meta e Atingimento */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Meta do Mês
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="text-2xl font-bold">
              {formatCurrency(data.target_amount, "BRL")}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground">Atingido:</div>
              <div className="text-sm font-semibold">
                {formatCurrency(data.achieved_amount, "BRL")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground">Progresso:</div>
              <div className={`text-sm font-bold ${achievementColor}`}>
                {data.achievement_percentage.toFixed(1)}%
              </div>
            </div>
            {/* Barra de progresso */}
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  data.achievement_percentage >= 100 ? "bg-green-600" :
                  data.achievement_percentage >= 85 ? "bg-yellow-600" :
                  "bg-red-600"
                }`}
                style={{ width: `${Math.min(data.achievement_percentage, 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Multiplicador */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Multiplicador
            </CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className={`text-4xl font-bold ${multiplierColor}`}>
              {data.multiplier.toFixed(1)}x
            </div>
            <div className="text-sm text-muted-foreground">
              Baseado no atingimento de {data.achievement_percentage.toFixed(1)}%
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

      {/* Card 3: Comissão */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Comissão Total
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(data.total_commission, "BRL")}
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tráfego Pago (80%):</span>
                <span className="font-medium">
                  {formatCurrency(data.commission_paid_traffic, "BRL")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Orgânico (20%):</span>
                <span className="font-medium">
                  {formatCurrency(data.commission_organic, "BRL")}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 4: Total de Ganhos */}
      <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Ganhos
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="text-3xl font-bold text-green-700 dark:text-green-400">
              {formatCurrency(data.total_earnings, "BRL")}
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Salário Fixo:</span>
                <span className="font-medium">
                  {formatCurrency(data.salary_fixed, "BRL")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Comissão:</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(data.total_commission, "BRL")}
                </span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {data.deals_count} negócios • {data.pairs_sold} pares
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

