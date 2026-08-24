"use client";

import { cn } from "@/lib/utils";
import type { TipoPedido } from "@/lib/ghl/programacao-stages";

/**
 * Selo do campo "Tipo do Pedido" do GHL.
 *
 * Evento é o mais gritante de propósito: é o pedido com data imóvel, que não
 * pode escorregar. As cores são frias/roxas para não competir com o vermelho,
 * laranja e amarelo, que no board significam atraso e proximidade do embarque.
 */
const TIPO_STYLES: Record<TipoPedido, string> = {
  Evento:
    "bg-violet-600 text-white border-violet-700 shadow-sm dark:bg-violet-500 dark:border-violet-400",
  Amostra:
    "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
  Pedido:
    "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
  Reposição:
    "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
};

const SEM_TIPO_STYLE =
  "bg-transparent text-muted-foreground border-dashed border-muted-foreground/40";

export function TipoPedidoBadge({
  tipo,
  className,
}: {
  tipo: TipoPedido | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide",
        tipo ? TIPO_STYLES[tipo] : SEM_TIPO_STYLE,
        className,
      )}
      title={
        tipo
          ? `Tipo do Pedido: ${tipo}`
          : "Tipo do Pedido ainda não preenchido no GHL"
      }
    >
      {tipo ?? "Sem tipo"}
    </span>
  );
}

/** Destaque extra no card de evento: faixa lateral. */
export function getTipoAccentClass(tipo: TipoPedido | null): string {
  return tipo === "Evento"
    ? "border-l-4 border-l-violet-600 dark:border-l-violet-400"
    : "";
}
