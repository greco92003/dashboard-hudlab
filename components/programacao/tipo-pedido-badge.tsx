"use client";

import { cn } from "@/lib/utils";
import type { TipoPedido } from "@/lib/ghl/programacao-stages";

/**
 * Selo do campo "Tipo do Pedido" do GHL.
 *
 * Evento é o mais forte de propósito (data imóvel, não pode escorregar): violeta
 * com brilho. Os tons translúcidos vêm do tema (app/hud-dashboard.css).
 */
const TIPO_STYLES: Record<TipoPedido, string> = {
  Evento: "tone-violet hud-tone-chip shadow-[0_0_12px_color-mix(in_srgb,var(--tone-violet)_35%,transparent)]",
  Amostra: "tone-sky hud-tone-chip",
  Pedido: "tone-slate hud-tone-chip",
  Reposição: "tone-cyan hud-tone-chip",
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
  return tipo === "Evento" ? "hud-accent-evento" : "";
}
