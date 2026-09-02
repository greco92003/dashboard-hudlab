"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  FileClock,
  Loader2,
  MessageSquareText,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type InstructionRun = {
  id: string;
  stage_name: string;
  instruction_type: "initial" | "alteration";
  status: "processing" | "completed" | "skipped" | "failed";
  summary: string | null;
  result_json: Record<string, unknown> | null;
  cache_hit: boolean;
  messages_read: number;
  new_messages_processed: number;
  images_processed: number;
  audios_processed: number;
  skip_reason: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

type MockupDeal = {
  id: string;
  name: string;
  contactId: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  monetaryValue: number | null;
  stageId: string;
  stageName: string;
  updatedAt: string | null;
  currentSummary: string | null;
  conversationId: string | null;
  cacheUpdatedAt: string | null;
  lastMessageAt: string | null;
  history: InstructionRun[];
};

type MockupResponse = {
  deals: MockupDeal[];
  meta: { total: number; generatedAt: string };
};

function formatMoney(value: number | null) {
  if (value == null) return "Valor não informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function stageAccent(stage: string) {
  const normalized = stage
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized === "mockup prioridade") return "border-l-emerald-500";
  if (normalized === "alteracao prioridade") return "border-l-rose-500";
  return "border-l-amber-500";
}

function statusBadge(run: InstructionRun | undefined) {
  if (!run) return <Badge variant="outline">Aguardando automação</Badge>;
  if (run.status === "completed") {
    return <Badge className="bg-emerald-600">Resumo pronto</Badge>;
  }
  if (run.status === "processing")
    return <Badge variant="secondary">Processando</Badge>;
  if (run.status === "failed")
    return <Badge variant="destructive">Falhou</Badge>;
  return <Badge variant="outline">Ignorado pela regra</Badge>;
}

export function MockupInstructionsTab() {
  const [snapshot, setSnapshot] = useState<MockupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/designers/mockup-instructions", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.details || result.error || "Erro ao carregar");
      setSnapshot(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar as instruções.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <Bot className="h-4 w-4" />
            Automação · GHL + IA
          </div>
          <h2 className="text-xl font-semibold">Instruções de mockup</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Deals nas etapas Mockup PRIORIDADE, Alteração e Alteração
            Prioridade, com o briefing atual e todo o histórico gerado pela
            automação.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={() => void load(true)}
        >
          {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Atualizar
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Não foi possível carregar a automação</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void load()}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : null}

      {!loading && snapshot?.deals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
            <MessageSquareText className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhum deal aguardando mockup</p>
              <p className="mt-1 text-sm text-muted-foreground">
                As três etapas monitoradas estão vazias neste momento.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!loading && snapshot && snapshot.deals.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <p>
              <strong>{snapshot.meta.total}</strong> deals monitorados
            </p>
            <p className="text-xs text-muted-foreground">
              Clique para ver o histórico
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {snapshot.deals.map((deal) => {
              const latestRun = deal.history[0];
              return (
                <Link
                  key={deal.id}
                  href={`/designers/instrucao-mockup?deal=${encodeURIComponent(deal.id)}`}
                  className="block w-full text-left"
                >
                  <Card
                    className={cn(
                      "gap-3 border-l-4 py-4 transition-colors hover:bg-muted/30",
                      stageAccent(deal.stageName),
                    )}
                  >
                    <CardHeader className="flex-row items-start justify-between gap-3 pb-0">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">
                          {deal.name}
                        </CardTitle>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {deal.contactName ||
                            deal.email ||
                            deal.phone ||
                            "Contato não informado"}
                        </p>
                      </div>
                      {statusBadge(latestRun)}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{deal.stageName}</Badge>
                        <Badge variant="secondary">
                          {formatMoney(deal.monetaryValue)}
                        </Badge>
                        <Badge variant="outline">
                          <FileClock /> {deal.history.length}{" "}
                          {deal.history.length === 1 ? "versão" : "versões"}
                        </Badge>
                      </div>
                      <p className="line-clamp-3 text-sm text-muted-foreground">
                        {deal.currentSummary ||
                          "O resumo ainda não foi gerado para este deal."}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
