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
};

/** Abre o PDF em nova aba; o visualizador do navegador cuida da impressão. */
export function OrderDocumentButtons({
  baseHref,
  size = "sm",
  talaoLabel = "Talões",
  romaneioLabel = "Romaneio",
  className,
  buttonClassName,
}: Props) {
  return (
    <div className={cn("flex flex-wrap justify-end gap-2", className)}>
      <Button asChild size={size} variant="outline" className={cn("border-emerald-600/60 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-500/10", buttonClassName)}>
        <a href={`${baseHref}/talao`} target="_blank" rel="noreferrer">
          <FileText /> {talaoLabel}
        </a>
      </Button>
      <Button asChild size={size} variant="outline" className={cn("border-blue-600/60 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:text-blue-300 dark:hover:bg-blue-500/10", buttonClassName)}>
        <a href={`${baseHref}/romaneio`} target="_blank" rel="noreferrer">
          <Package /> {romaneioLabel}
        </a>
      </Button>
    </div>
  );
}
