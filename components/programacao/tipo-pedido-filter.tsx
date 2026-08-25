"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TIPO_PEDIDO_ORDER,
  type TipoPedido,
} from "@/lib/ghl/programacao-stages";

export type TipoFilterValue = TipoPedido;

/**
 * Filtro por Tipo do Pedido. Seleção vazia = mostra tudo, que é o estado útil
 * enquanto o campo ainda está sendo preenchido no GHL.
 *
 * Não há opção "Sem tipo": ela existiria só enquanto o campo não estiver
 * preenchido no CRM, e some sozinha quando estiver. Pedido sem tipo
 * simplesmente não casa com nenhum filtro ativo.
 */
export function TipoPedidoFilter({
  selected,
  onChange,
  counts,
  tamanho = "normal",
}: {
  selected: Set<TipoFilterValue>;
  onChange: (next: Set<TipoFilterValue>) => void;
  counts?: Record<string, number>;
  /** "grande" para o chão de fábrica, onde tudo é operado no toque. */
  tamanho?: "normal" | "grande";
}) {
  const options: TipoFilterValue[] = [...TIPO_PEDIDO_ORDER];

  const toggle = (value: TipoFilterValue) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const grande = tamanho === "grande";

  return (
    <div className={cn("flex flex-wrap items-center", grande ? "gap-2" : "gap-1")}>
      {options.map((option) => {
        const isOn = selected.has(option);
        const count = counts?.[option];
        return (
          <Button
            key={option}
            type="button"
            variant={isOn ? "default" : "outline"}
            size="sm"
            onClick={() => toggle(option)}
            className={cn(
              "font-semibold uppercase tracking-wide",
              grande ? "h-11 px-3.5 text-sm" : "h-8 px-2 text-xs",
              option === "Evento" &&
                isOn &&
                "bg-violet-600 hover:bg-violet-700 dark:bg-violet-500",
            )}
          >
            {option}
            {count !== undefined && (
              <span className="ml-1 opacity-70">{count}</span>
            )}
          </Button>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={selected.size === 0}
        className={cn(grande ? "h-11 px-3 text-sm" : "h-8 px-2 text-xs")}
        onClick={() => onChange(new Set())}
      >
        Limpar filtros
      </Button>
    </div>
  );
}
