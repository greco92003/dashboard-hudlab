"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { OTECommissionHistory } from "@/types/ote";
import { History } from "lucide-react";

interface CommissionHistoryProps {
  history: OTECommissionHistory[];
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export function CommissionHistoryComponent({ history }: CommissionHistoryProps) {
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
      <CardHeader>
        <div className="flex items-center gap-2">
          <History className="h-5 w-5" />
          <CardTitle>Histórico de Comissões</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
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
                  record.achievement_percentage >= 100 ? "text-green-600" :
                  record.achievement_percentage >= 85 ? "text-yellow-600" :
                  "text-red-600";

                const multiplierColor =
                  record.multiplier >= 1.5 ? "text-green-600" :
                  record.multiplier >= 1 ? "text-blue-600" :
                  record.multiplier >= 0.5 ? "text-yellow-600" :
                  "text-gray-600";

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
                    <td className={`text-center py-3 px-4 font-semibold text-sm ${achievementColor}`}>
                      {record.achievement_percentage.toFixed(1)}%
                    </td>
                    <td className={`text-center py-3 px-4 font-bold ${multiplierColor}`}>
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

        {/* Resumo */}
        <div className="mt-6 pt-4 border-t">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Total em Comissões</div>
              <div className="text-xl font-bold text-green-600">
                {formatCurrency(
                  history.reduce((sum, r) => sum + r.total_commission, 0),
                  "BRL"
                )}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Total Ganho</div>
              <div className="text-xl font-bold">
                {formatCurrency(
                  history.reduce((sum, r) => sum + r.total_earnings, 0),
                  "BRL"
                )}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Média de Atingimento</div>
              <div className="text-xl font-bold text-blue-600">
                {(history.reduce((sum, r) => sum + r.achievement_percentage, 0) / history.length).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

