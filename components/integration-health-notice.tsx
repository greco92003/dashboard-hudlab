"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePermissions } from "@/hooks/usePermissions";

type Problem = { key: string; label: string; message: string };

const REFRESH_MS = 5 * 60 * 1_000;

/**
 * Aviso discreto, só para admin, quando o webhook ou um sync do GHL está
 * com problema. Os números da tela seguem certos (o sync cobre o webhook);
 * o aviso é para alguém consertar a origem.
 */
export function IntegrationHealthNotice() {
  const { isOwnerOrAdmin } = usePermissions();
  const [problems, setProblems] = useState<Problem[]>([]);

  useEffect(() => {
    if (!isOwnerOrAdmin) return;
    let active = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/admin/integration-health", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { problems?: Problem[] };
        if (active) setProblems(data.problems ?? []);
      } catch {
        // Aviso é acessório: falha de rede não deve aparecer como erro na tela.
      }
    };
    void load();
    const interval = window.setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isOwnerOrAdmin]);

  if (!isOwnerOrAdmin || problems.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Atenção: integrações do GHL"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Atenção
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3 text-xs text-muted-foreground">
        {problems.map((problem) => (
          <div key={problem.key} className="space-y-0.5">
            <p className="font-medium">{problem.label}</p>
            <p>{problem.message}</p>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
