"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BoardDeal, BoardGroup } from "@/lib/programacao/board-types";

export function calculateTotalPairs(deals: BoardDeal[]): number {
  return deals.reduce(
    (sum, deal) => sum + (parseInt(deal.quantidadePares || "0", 10) || 0),
    0,
  );
}

/**
 * Carrossel horizontal de colunas do kanban, compartilhado por /programacao e
 * /expedicao. O rotateX duplicado é o truque que joga a barra de rolagem para o
 * topo do board — sem ele o operador precisa descer até o fim da tela para rolar.
 */
export function BoardColumns({
  groups,
  cardWidth,
  renderCard,
  emptyLabel = "Nenhum deal neste grupo",
}: {
  groups: BoardGroup[];
  cardWidth: number;
  renderCard: (deal: BoardDeal, group: BoardGroup) => React.ReactNode;
  emptyLabel?: string;
}) {
  return (
    <div className="h-full overflow-x-auto" style={{ transform: "rotateX(180deg)" }}>
      <div
        className="flex h-full min-w-max justify-center gap-4 p-4"
        style={{ transform: "rotateX(180deg)" }}
      >
        {groups.map((group) => (
          <div
            key={group.id}
            className="h-full flex-shrink-0 transition-all duration-200"
            style={{ width: `${cardWidth}px`, minWidth: `${cardWidth}px` }}
          >
            <Card className="flex h-full flex-col">
              <CardHeader className="flex-shrink-0 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">
                    {group.title}
                  </CardTitle>
                  <Badge variant="secondary" className="ml-2">
                    {group.dealsCount}
                  </Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Total: {calculateTotalPairs(group.deals)} pares
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3 overflow-y-auto">
                {group.deals.length > 0 ? (
                  group.deals.map((deal) => renderCard(deal, group))
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {emptyLabel}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
