"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function FinancialDashboardError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[FinancialDashboard] Error:", error);
  }, [error]);

  const isConfig = error.message?.includes("TINY_TOKEN") ||
    error.message?.includes("TINY_CLIENT");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <h2 className="text-xl font-semibold">
        {isConfig ? "Configuração pendente" : "Erro ao carregar dados financeiros"}
      </h2>
      <p className="text-muted-foreground max-w-md text-sm">
        {isConfig
          ? "As credenciais do Tiny/Olist ainda não foram configuradas. Adicione TINY_TOKEN (ou TINY_CLIENT_ID e TINY_CLIENT_SECRET) no arquivo .env.local."
          : error.message ?? "Ocorreu um erro inesperado. Tente novamente."}
      </p>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  );
}
