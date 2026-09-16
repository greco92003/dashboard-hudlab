"use client";

import { useState } from "react";
import { Loader2, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { printPdf } from "./print-pdf";

type Props = {
  href: string;
  label?: string;
  size?: "sm" | "default";
  className?: string;
};

/** Etiquetas 80×50 mm para a térmica: abre a janela de impressão direto. */
export function ProductionLabelsButton({ href, label = "Etiquetas", size = "sm", className }: Props) {
  const [printing, setPrinting] = useState(false);

  const print = async () => {
    setPrinting(true);
    try {
      await printPdf(href);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível imprimir as etiquetas.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      disabled={printing}
      onClick={() => void print()}
      title={label}
      aria-label={label}
      className={cn("border-violet-600/60 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:text-violet-300 dark:hover:bg-violet-500/10", className)}
    >
      {printing ? <Loader2 className="animate-spin" /> : <Tag />} <span className="hidden lg:inline">{label}</span>
    </Button>
  );
}
