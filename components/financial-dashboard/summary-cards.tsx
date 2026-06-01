"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  TrendingUp,
} from "lucide-react";
import type { FinancialDashboardSummaryResponse } from "@/lib/tiny/types";
import type { FinancialFilterState } from "./financial-filters";

function fmt(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface SummaryCardsProps {
  data?: FinancialDashboardSummaryResponse;
  loading?: boolean;
  viewMode?: FinancialFilterState["viewMode"];
}

type CardDef = {
  title: string;
  value: number;
  hint?: string;
  icon: typeof Wallet;
  color: string;
};

export function SummaryCards({
  data,
  loading,
  viewMode = "both",
}: SummaryCardsProps) {
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

  // Choose which figures to surface based on viewMode (Conta Azul-style)
  const cards: CardDef[] = (() => {
    if (viewMode === "realized") {
      return [
        {
          title: "Pago no período",
          value: data.totalPaid,
          icon: ArrowDownCircle,
          color: "text-destructive",
        },
        {
          title: "Recebido no período",
          value: data.totalReceived,
          icon: ArrowUpCircle,
          color: "text-emerald-500",
        },
        {
          title: "Saldo Realizado",
          value: data.realizedNet,
          icon: Wallet,
          color:
            data.realizedNet >= 0 ? "text-emerald-500" : "text-destructive",
        },
        {
          title: "Lançamentos",
          value: data.payablesCount + data.receivablesCount,
          icon: TrendingUp,
          color: "text-muted-foreground",
        },
      ];
    }

    if (viewMode === "predicted") {
      return [
        {
          title: "A Pagar (previsto)",
          value: data.totalToPay,
          icon: ArrowDownCircle,
          color: "text-destructive",
        },
        {
          title: "A Receber (previsto)",
          value: data.totalToReceive,
          icon: ArrowUpCircle,
          color: "text-emerald-500",
        },
        {
          title: "Resultado Previsto",
          value: data.predictedNet,
          icon: Wallet,
          color:
            data.predictedNet >= 0 ? "text-emerald-500" : "text-destructive",
        },
        {
          title: "Lançamentos",
          value: data.payablesCount + data.receivablesCount,
          icon: TrendingUp,
          color: "text-muted-foreground",
        },
      ];
    }

    // both
    return [
      {
        title: "A Pagar",
        value: data.totalPayable,
        hint: `Realizado ${fmt(data.totalPaid)}`,
        icon: ArrowDownCircle,
        color: "text-destructive",
      },
      {
        title: "A Receber",
        value: data.totalReceivable,
        hint: `Realizado ${fmt(data.totalReceived)}`,
        icon: ArrowUpCircle,
        color: "text-emerald-500",
      },
      {
        title: "Saldo Realizado",
        value: data.realizedNet,
        hint: "Recebido − Pago",
        icon: Wallet,
        color: data.realizedNet >= 0 ? "text-emerald-500" : "text-destructive",
      },
      {
        title: "Resultado Previsto",
        value: data.netForecast,
        hint: "A receber − A pagar",
        icon: TrendingUp,
        color: data.netForecast >= 0 ? "text-emerald-500" : "text-destructive",
      },
    ];
  })();

  const isCount = (title: string) => title === "Lançamentos";

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
            <p className={`text-2xl font-bold ${card.color}`}>
              {isCount(card.title)
                ? card.value.toLocaleString("pt-BR")
                : fmt(card.value)}
            </p>
            {card.hint && (
              <p className="text-xs text-muted-foreground mt-1">{card.hint}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
