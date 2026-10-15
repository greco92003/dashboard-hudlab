"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Botão de recolher/expandir o menu, sempre no topo da própria barra: aberta,
 * ao lado do logo; recolhida, no alto da coluna de ícones. No celular fecha o
 * menu (quem abre é o botão do cabeçalho).
 */
export function SidebarToggle({ className }: { className?: string }) {
  const { state, isMobile, toggleSidebar } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";
  const label = isMobile ? "Fechar menu" : collapsed ? "Expandir menu" : "Recolher menu";
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggleSidebar}
      aria-label={label}
      title={`${label} (Ctrl+B)`}
      className={cn("size-8 shrink-0 text-muted-foreground hover:text-foreground", className)}
    >
      <Icon className="size-4" />
    </Button>
  );
}
