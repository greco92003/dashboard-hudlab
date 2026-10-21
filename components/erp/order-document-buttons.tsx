"use client";

import type { ReactNode } from "react";
import { ChevronDown, FileText, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Props = {
  /** Rota que termina em /talao e /romaneio (pedido do Tiny ou deal do GHL). */
  baseHref: string;
  size?: "sm" | "default";
  talaoLabel?: string;
  romaneioLabel?: string;
  className?: string;
  buttonClassName?: string;
  /** Botões extras no fim da linha (ex.: etiquetas, ordem de produção). */
  children?: ReactNode;
};

const ROMANEIO_COLORS = "border-blue-600/60 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:text-blue-300 dark:hover:bg-blue-500/10";

/**
 * Abre o PDF em nova aba; o visualizador do navegador cuida da impressão.
 * Em telas menores os botões ficam só com o ícone. O romaneio padrão continua
 * a um clique; o romaneio com um SKU por caixa fica na seta ao lado.
 */
export function OrderDocumentButtons({
  baseHref,
  size = "sm",
  talaoLabel = "Talões",
  romaneioLabel = "Romaneio",
  className,
  buttonClassName,
  children,
}: Props) {
  return (
    <div className={cn("flex flex-wrap justify-end gap-2 lg:flex-nowrap", className)}>
      <Button asChild size={size} variant="outline" className={cn("border-emerald-600/60 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-500/10", buttonClassName)}>
        <a href={`${baseHref}/talao`} target="_blank" rel="noreferrer" title={talaoLabel} aria-label={talaoLabel}>
          <FileText /> <span className="hidden lg:inline">{talaoLabel}</span>
        </a>
      </Button>
      <div className="flex min-w-0">
        <Button asChild size={size} variant="outline" className={cn(ROMANEIO_COLORS, buttonClassName, "min-w-0 flex-1 rounded-r-none")}>
          <a href={`${baseHref}/romaneio`} target="_blank" rel="noreferrer" title={romaneioLabel} aria-label={romaneioLabel}>
            <Package /> <span className="hidden lg:inline">{romaneioLabel}</span>
          </a>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size={size}
              variant="outline"
              className={cn(ROMANEIO_COLORS, buttonClassName, "w-auto shrink-0 rounded-l-none border-l-0 px-2")}
              title="Outros tipos de romaneio"
              aria-label="Outros tipos de romaneio"
            >
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={`${baseHref}/romaneio`} target="_blank" rel="noreferrer">
                <Package /> Romaneio padrão
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`${baseHref}/romaneio?agrupar=sku`} target="_blank" rel="noreferrer">
                <Package /> Romaneio por SKU (1 modelo por caixa)
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {children}
    </div>
  );
}
