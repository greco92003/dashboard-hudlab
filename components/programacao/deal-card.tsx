"use client";

import { Card } from "@/components/ui/card";
import { formatCurrency, cn } from "@/lib/utils";
import {
  CalendarOff,
  Clock,
  Package,
  Power,
  TrendingUp,
  User,
} from "lucide-react";
import type { BoardDeal } from "@/lib/programacao/board-types";
import {
  formatDate,
  getShippingStatus,
  getUrgencyBackgroundClass,
} from "@/lib/programacao/board-dates";
import {
  getTipoAccentClass,
  TipoPedidoBadge,
} from "@/components/programacao/tipo-pedido-badge";

const CONCLUIDO_CLASSES =
  "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800";
const DESLIGADO_CLASSES =
  "opacity-40 grayscale bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700";

export function DealCard({
  deal,
  concluido = false,
  isActive = true,
  showValue = true,
  onToggle,
  footer,
  onClick,
}: {
  deal: BoardDeal;
  /** Deal já recebido pelo cliente: pinta de verde e ignora o atraso. */
  concluido?: boolean;
  isActive?: boolean;
  /**
   * A Programação é planejamento de fábrica e roda em tela de chão de fábrica,
   * onde o valor do pedido não tem por que aparecer. A Expedição, que cuida de
   * cobrança e faturamento, mostra.
   */
  showValue?: boolean;
  /** Quando ausente, o card não mostra o botão liga/desliga. */
  onToggle?: (dealId: string, event: React.MouseEvent) => void;
  /**
   * Ação do card, desenhada dentro dele. Fica aqui e não abaixo do card para
   * ler como parte do pedido, e não como outro elemento da coluna.
   */
  footer?: React.ReactNode;
  /** Sem handler, o card não é clicável e não finge ser. */
  onClick?: (deal: BoardDeal) => void;
}) {
  const status = concluido
    ? { message: "✓ Recebido", colorClass: "text-green-700 dark:text-green-400 font-semibold" }
    : getShippingStatus(deal.dataEmbarque);

  const background = concluido
    ? CONCLUIDO_CLASSES
    : getUrgencyBackgroundClass(deal.dataEmbarque);

  return (
    <Card
      className={cn(
        "relative border p-3 transition-all",
        onClick && "cursor-pointer hover:shadow-md",
        isActive ? background : DESLIGADO_CLASSES,
        isActive && getTipoAccentClass(deal.tipoPedido),
      )}
      onClick={onClick ? () => onClick(deal) : undefined}
    >
      {onToggle && (
        <button
          onClick={(event) => onToggle(deal.id, event)}
          className={cn(
            "absolute right-2 top-2 rounded-full p-1 transition-all hover:scale-110",
            isActive
              ? "bg-green-500 text-white hover:bg-green-600"
              : "bg-gray-400 text-white hover:bg-gray-500",
          )}
          title={isActive ? "Desativar card" : "Ativar card"}
        >
          <Power className="h-3 w-3" />
        </button>
      )}

      <div className={cn("space-y-2", onToggle && "pr-8")}>
        <TipoPedidoBadge tipo={deal.tipoPedido} />

        <h4 className="line-clamp-2 text-sm font-semibold">{deal.title}</h4>

        {deal.dataEmbarque ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-sm font-bold text-primary">
              <Clock className="h-4 w-4" />
              {formatDate(deal.dataEmbarque)}
            </div>
            {status && (
              <div className={cn("px-2 py-0.5 text-xs", status.colorClass)}>
                {status.message}
              </div>
            )}
          </div>
        ) : (
          // Ocupa o mesmo lugar da data, para a falta nunca parecer normal.
          <div className="flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-sm font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <CalendarOff className="h-4 w-4" />
            Sem data de embarque
          </div>
        )}

        {showValue && (
          <div className="flex items-center gap-1 text-sm font-medium text-green-600">
            <TrendingUp className="h-3 w-3" />
            {formatCurrency(deal.value / 100, deal.currency)}
          </div>
        )}

        {deal.stageTitle && (
          <div className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 dark:bg-blue-950/20">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            {deal.stageTitle}
          </div>
        )}

        <div className="space-y-1 text-xs text-muted-foreground">
          {deal.quantidadePares && (
            <div className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              {deal.quantidadePares} pares
            </div>
          )}
          {deal.vendedor && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {deal.vendedor}
            </div>
          )}
        </div>

        {footer && (
          <div
            className="pt-1"
            onClick={(event) => event.stopPropagation()}
          >
            {footer}
          </div>
        )}
      </div>
    </Card>
  );
}
