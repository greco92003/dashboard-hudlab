"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TIPO_PEDIDO_ORDER,
  type TipoPedido,
} from "@/lib/ghl/programacao-stages";

export const SEM_TIPO_KEY = "Sem tipo";

export type TipoFilterValue = TipoPedido | typeof SEM_TIPO_KEY;

/**
 * Filtro por Tipo do Pedido. Seleção vazia = mostra tudo, que é o estado útil
 * enquanto o campo ainda está sendo preenchido no GHL.
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
  const options: TipoFilterValue[] = [...TIPO_PEDIDO_ORDER, SEM_TIPO_KEY];

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
              option === SEM_TIPO_KEY && "font-normal normal-case",
            )}
          >
            {option}
            {count !== undefined && (
              <span className="ml-1 opacity-70">{count}</span>
            )}
          </Button>
        );
      })}
      {selected.size > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(grande ? "h-11 px-3 text-sm" : "h-8 px-2 text-xs")}
          onClick={() => onChange(new Set())}
        >
          Limpar
        </Button>
      )}
    </div>
  );
}
