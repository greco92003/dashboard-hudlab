"use client";

import { Button } from "@/components/ui/button";
import { CalendarOff, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

export type MotivoFora = "sem-data" | "em-conferencia";

export interface BucketFora {
  motivo: MotivoFora;
  quantidade: number;
}

/**
 * Declara o que ficou de fora das colunas e por quê.
 *
 * Nenhum dos dois casos vira coluna: o board responde "o que embarca em cada
 * dia?" e esses pedidos não respondem — sem data porque não têm dia, e em
 * conferência porque o dia ainda é suposto (o cadastro nem foi conferido).
 * Como coluna eles viravam paisagem; pior, um pedido em conferência com data
 * vencida jogava os pares dele na conta de "Em atraso" da fábrica.
 *
 * A linha existe para a busca não parecer quebrada: quem procura um pedido que
 * saiu do board precisa entender que ele está fora, e não sumido.
 */
const ESTILO: Record<
  MotivoFora,
  { rotulo: (n: number) => string; icone: typeof CalendarOff; alerta: boolean }
> = {
  "em-conferencia": {
    // Estar nessa etapa é normal; o anormal é ficar. Daí o tom neutro.
    rotulo: (n) => `${n} em conferência`,
    icone: ClipboardList,
    alerta: false,
  },
  "sem-data": {
    rotulo: (n) => `${n} sem data de embarque`,
    icone: CalendarOff,
    alerta: true,
  },
};

export function ForaDoBoard({
  buckets,
  ativo,
  onToggle,
  tamanho = "normal",
}: {
  buckets: BucketFora[];
  /** Motivo cujo grupo está ocupando o board sozinho, se algum. */
  ativo: MotivoFora | null;
  onToggle: (motivo: MotivoFora) => void;
  tamanho?: "normal" | "grande";
}) {
  const visiveis = buckets.filter((b) => b.quantidade > 0);
  if (visiveis.length === 0) return null;

  const grande = tamanho === "grande";

  return (
    <div
      role="status"
      className={cn(
        "flex flex-shrink-0 flex-wrap items-center gap-x-2 gap-y-1",
        grande ? "text-base" : "text-sm",
      )}
    >
      <span className="text-muted-foreground">Fora do board:</span>

      {visiveis.map(({ motivo, quantidade }) => {
        const { rotulo, icone: Icone, alerta } = ESTILO[motivo];
        const selecionado = ativo === motivo;

        return (
          <Button
            key={motivo}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onToggle(motivo)}
            className={cn(
              "gap-1.5 font-medium",
              grande ? "h-10 px-3 text-base" : "h-8 px-2.5 text-sm",
              alerta &&
                "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/40",
              selecionado && "ring-2 ring-offset-1 ring-offset-background",
            )}
          >
            <Icone className={cn(grande ? "h-5 w-5" : "h-4 w-4")} />
            {rotulo(quantidade)}
          </Button>
        );
      })}

      {ativo && (
        <span className="text-xs text-muted-foreground">
          clique de novo para voltar ao board
        </span>
      )}
    </div>
  );
}
