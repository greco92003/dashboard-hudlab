"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownCircle, ArrowUpCircle, Wallet, TrendingUp } from "lucide-react";
import type { FinancialDashboardSummaryResponse } from "@/lib/tiny/types";

function fmt(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface SummaryCardsProps {
  data?: FinancialDashboardSummaryResponse;
  loading?: boolean;
}

export function SummaryCards({ data, loading }: SummaryCardsProps) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Total a Pagar",
      value: data.totalPayable,
      icon: ArrowDownCircle,
      color: "text-destructive",
    },
    {
      title: "Total a Receber",
      value: data.totalReceivable,
      icon: ArrowUpCircle,
      color: "text-emerald-500",
    },
    {
      title: "Saldo em Caixa",
      value: data.cashBalance,
      icon: Wallet,
      color: data.cashBalance >= 0 ? "text-emerald-500" : "text-destructive",
    },
    {
      title: "Resultado Previsto",
      value: data.netForecast,
      icon: TrendingUp,
      color: data.netForecast >= 0 ? "text-emerald-500" : "text-destructive",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${card.color}`}>{fmt(card.value)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
