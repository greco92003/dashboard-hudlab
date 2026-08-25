"use client";

import { Button } from "@/components/ui/button";
import { CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Rede de segurança para pedido sem Data de Embarque.
 *
 * Não vira coluna de propósito: o board responde "o que embarca em cada dia?" e
 * esses pedidos não respondem essa pergunta — são exceção ao eixo, não mais uma
 * categoria. Como coluna eles viravam paisagem no fim do board e passavam batido.
 *
 * Aqui ocupa uma linha quando existe e nada quando não existe. O problema de
 * verdade se resolve no GHL, tornando o campo obrigatório no fechamento.
 */
export function AlertaSemData({
  quantidade,
  ativo,
  onToggle,
  tamanho = "normal",
}: {
  quantidade: number;
  /** O board está mostrando só os pedidos sem data. */
  ativo: boolean;
  onToggle: () => void;
  tamanho?: "normal" | "grande";
}) {
  if (quantidade === 0) return null;

  const grande = tamanho === "grande";
  const plural = quantidade === 1 ? "pedido" : "pedidos";

  return (
    <div
      role="status"
      className={cn(
        "flex flex-shrink-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3",
        "border-amber-300 bg-amber-50 text-amber-900",
        "dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
        grande ? "py-2.5 text-base" : "py-2 text-sm",
      )}
    >
      <CalendarOff className={cn(grande ? "h-5 w-5" : "h-4 w-4")} />
      <span className="font-semibold">
        {quantidade} {plural} sem data de embarque
      </span>
      <span className="opacity-80">
        fora do planejamento e da média de pares/dia
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onToggle}
        className={cn(
          "ml-auto border-amber-400 bg-transparent hover:bg-amber-100",
          "dark:border-amber-700 dark:hover:bg-amber-900/40",
          grande && "h-10 text-base",
        )}
      >
        {ativo ? "Voltar ao board" : "Ver"}
      </Button>
    </div>
  );
}
