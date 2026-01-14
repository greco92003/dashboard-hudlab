"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OTEMultiplier } from "@/types/ote";
import { Award } from "lucide-react";

interface MultiplierTableProps {
  multipliers: OTEMultiplier[];
  currentPercentage?: number;
}

export function MultiplierTable({ multipliers, currentPercentage }: MultiplierTableProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          <CardTitle>Tabela de Multiplicadores</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-semibold text-sm">
                  % da Meta
                </th>
                <th className="text-center py-3 px-4 font-semibold text-sm">
                  Multiplicador
                </th>
                <th className="text-right py-3 px-4 font-semibold text-sm">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {multipliers
                .sort((a, b) => a.min - b.min)
                .map((m, index) => {
                  const isActive = currentPercentage !== undefined &&
                    currentPercentage >= m.min &&
                    currentPercentage <= m.max;

                  const multiplierColor =
                    m.multiplier >= 1.5 ? "text-green-600" :
                    m.multiplier >= 1 ? "text-blue-600" :
                    m.multiplier >= 0.5 ? "text-yellow-600" :
                    "text-gray-600";

                  return (
                    <tr
                      key={index}
                      className={`border-b transition-colors ${
                        isActive
                          ? "bg-green-50 dark:bg-green-950/20 font-semibold"
                          : "hover:bg-gray-50 dark:hover:bg-gray-900"
                      }`}
                    >
                      <td className="py-3 px-4">
                        {m.min}% - {m.max === 999 ? "∞" : `${m.max}%`}
                      </td>
                      <td className={`text-center py-3 px-4 font-bold text-lg ${multiplierColor}`}>
                        {m.multiplier.toFixed(1)}x
                      </td>
                      <td className="text-right py-3 px-4">
                        {isActive && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Atual
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {currentPercentage !== undefined && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>Seu progresso atual:</strong> {currentPercentage.toFixed(1)}%
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              {currentPercentage < 71 && "Continue vendendo para desbloquear multiplicadores!"}
              {currentPercentage >= 71 && currentPercentage < 85 && "Você está no caminho certo! Alcance 85% para aumentar seu multiplicador."}
              {currentPercentage >= 85 && currentPercentage < 100 && "Quase lá! Bata a meta para alcançar o multiplicador 1x."}
              {currentPercentage >= 100 && currentPercentage < 120 && "Parabéns! Meta batida! Alcance 120% para aumentar ainda mais."}
              {currentPercentage >= 120 && currentPercentage < 150 && "Excelente! Continue assim para alcançar o multiplicador máximo."}
              {currentPercentage >= 150 && "🎉 Incrível! Você alcançou o multiplicador máximo!"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

