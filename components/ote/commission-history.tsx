"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { OTECommissionHistory } from "@/types/ote";
import { History } from "lucide-react";

interface CommissionHistoryProps {
  history: OTECommissionHistory[];
}

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function CommissionHistoryComponent({
  history,
}: CommissionHistoryProps) {
  if (history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            <CardTitle>Histórico de Comissões</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum histórico de comissões disponível ainda.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3 sm:pb-4">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 sm:h-5 sm:w-5" />
          <CardTitle className="text-base sm:text-lg">
            Histórico de Comissões
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {/* Versão Desktop - Tabela */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-semibold text-sm">
                  Período
                </th>
                <th className="text-right py-3 px-4 font-semibold text-sm">
                  Meta
                </th>
                <th className="text-right py-3 px-4 font-semibold text-sm">
                  Vendido
                </th>
                <th className="text-center py-3 px-4 font-semibold text-sm">
                  %
                </th>
                <th className="text-center py-3 px-4 font-semibold text-sm">
                  Mult.
                </th>
                <th className="text-right py-3 px-4 font-semibold text-sm">
                  Comissão
                </th>
                <th className="text-right py-3 px-4 font-semibold text-sm">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((record) => {
                const achievementColor =
                  record.achievement_percentage >= 100
                    ? "text-green-600"
                    : record.achievement_percentage >= 85
                    ? "text-yellow-600"
                    : "text-red-600";

                const multiplierColor =
                  record.multiplier >= 1.5
                    ? "text-green-600"
                    : record.multiplier >= 1
                    ? "text-blue-600"
                    : record.multiplier >= 0.5
                    ? "text-yellow-600"
                    : "text-gray-600";

                return (
                  <tr
                    key={record.id}
                    className="border-b hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium">
                        {MONTH_NAMES[record.month - 1]}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {record.year}
                      </div>
                    </td>
                    <td className="text-right py-3 px-4 text-sm">
                      {formatCurrency(record.target_amount, "BRL")}
                    </td>
                    <td className="text-right py-3 px-4 text-sm">
                      {formatCurrency(record.achieved_amount, "BRL")}
                    </td>
                    <td
                      className={`text-center py-3 px-4 font-semibold text-sm ${achievementColor}`}
                    >
                      {record.achievement_percentage.toFixed(1)}%
                    </td>
                    <td
                      className={`text-center py-3 px-4 font-bold ${multiplierColor}`}
                    >
                      {record.multiplier.toFixed(1)}x
                    </td>
                    <td className="text-right py-3 px-4 font-semibold text-green-600">
                      {formatCurrency(record.total_commission, "BRL")}
                    </td>
                    <td className="text-right py-3 px-4 font-bold">
                      {formatCurrency(record.total_earnings, "BRL")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Versão Mobile/Tablet - Cards */}
        <div className="lg:hidden space-y-3">
          {history.map((record) => {
            const achievementColor =
              record.achievement_percentage >= 100
                ? "text-green-600"
                : record.achievement_percentage >= 85
                ? "text-yellow-600"
                : "text-red-600";

            const multiplierColor =
              record.multiplier >= 1.5
                ? "text-green-600"
                : record.multiplier >= 1
                ? "text-blue-600"
                : record.multiplier >= 0.5
                ? "text-yellow-600"
                : "text-gray-600";

            return (
              <div
                key={record.id}
                className="p-3 sm:p-4 rounded-lg border bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800"
              >
                {/* Cabeçalho do Card */}
                <div className="flex items-center justify-between mb-3 pb-2 border-b">
                  <div>
                    <div className="font-semibold text-sm sm:text-base">
                      {MONTH_NAMES[record.month - 1]}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {record.year}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-xl sm:text-2xl font-bold ${achievementColor}`}
                    >
                      {record.achievement_percentage.toFixed(1)}%
                    </div>
                    <div className={`text-sm font-bold ${multiplierColor}`}>
                      {record.multiplier.toFixed(1)}x
                    </div>
                  </div>
                </div>

                {/* Dados do Card */}
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Meta:</span>
                    <span className="font-medium">
                      {formatCurrency(record.target_amount, "BRL")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vendido:</span>
                    <span className="font-medium">
                      {formatCurrency(record.achieved_amount, "BRL")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Comissão:</span>
                    <span className="font-semibold text-green-600">
                      {formatCurrency(record.total_commission, "BRL")}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-muted-foreground font-medium">
                      Total Ganho:
                    </span>
                    <span className="font-bold text-base">
                      {formatCurrency(record.total_earnings, "BRL")}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Resumo */}
        <div className="mt-4 sm:mt-6 pt-4 border-t">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
              <div className="text-xs sm:text-sm text-muted-foreground mb-1">
                Total em Comissões
              </div>
              <div className="text-lg sm:text-xl font-bold text-green-600 break-words">
                {formatCurrency(
                  history.reduce((sum, r) => sum + r.total_commission, 0),
                  "BRL"
                )}
              </div>
            </div>
            <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
              <div className="text-xs sm:text-sm text-muted-foreground mb-1">
                Total Ganho
              </div>
              <div className="text-lg sm:text-xl font-bold break-words">
                {formatCurrency(
                  history.reduce((sum, r) => sum + r.total_earnings, 0),
                  "BRL"
                )}
              </div>
            </div>
            <div className="text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20">
              <div className="text-xs sm:text-sm text-muted-foreground mb-1">
                Média de Atingimento
              </div>
              <div className="text-lg sm:text-xl font-bold text-blue-600">
                {(
                  history.reduce(
                    (sum, r) => sum + r.achievement_percentage,
                    0
                  ) / history.length
                ).toFixed(1)}
                %
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
