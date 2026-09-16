import type { ReactNode } from "react";
import { FileText, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
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

/**
 * Abre o PDF em nova aba; o visualizador do navegador cuida da impressão.
 * Em telas menores os botões ficam só com o ícone.
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
      <Button asChild size={size} variant="outline" className={cn("border-blue-600/60 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:text-blue-300 dark:hover:bg-blue-500/10", buttonClassName)}>
        <a href={`${baseHref}/romaneio`} target="_blank" rel="noreferrer" title={romaneioLabel} aria-label={romaneioLabel}>
          <Package /> <span className="hidden lg:inline">{romaneioLabel}</span>
        </a>
      </Button>
      {children}
    </div>
  );
}
