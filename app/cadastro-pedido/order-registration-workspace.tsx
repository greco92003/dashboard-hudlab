"use client";

import { useCallback, useEffect, useState } from "react";
import {
  parseAsJson,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import {
  ArrowLeft,
  ClipboardCheck,
  Inbox,
  ListChecks,
  Loader2,
  PencilLine,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type {
  OrderRegistrationDraft,
  OrderRegistrationOpportunity,
  OrderRegistrationResponse,
} from "@/lib/ghl/order-registration-shared";
import { orderRegistrationDraftSchema } from "@/lib/ghl/order-registration-shared";
import { OrderRegistrationCard } from "./order-registration-card";

const ORDER_REGISTRATION_TABS = ["oportunidades", "editar"] as const;

type PersistedOrderRegistrationDraft = {
  opportunityId: string;
  draft: OrderRegistrationDraft;
};

const persistedDraftParser = parseAsJson<PersistedOrderRegistrationDraft>(
  (value) => {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record.opportunityId !== "string") return null;
    const parsedDraft = orderRegistrationDraftSchema.safeParse(record.draft);
    if (!parsedDraft.success) return null;
    return {
      opportunityId: record.opportunityId,
      draft: parsedDraft.data,
    };
  },
);

function compactDraftForUrl(
  draft: OrderRegistrationDraft,
): OrderRegistrationDraft {
  const filledValues = (values: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(values).filter(([, value]) => value.trim() !== ""),
    );

  return {
    ...draft,
    models: draft.models.map((model) => ({
      ...model,
      adultGrade: filledValues(model.adultGrade),
      childGrade: filledValues(model.childGrade),
    })),
  };
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando oportunidades do GHL…
      </CardContent>
    </Card>
  );
}

function EmptyList() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Inbox className="h-5 w-5 text-muted-foreground" />
        </span>
        <div>
          <p className="font-medium">Nenhum pedido para conferir</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Não há oportunidades abertas ou ganhas neste estágio do pipeline
            Atendimento.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function MissingOpportunity({
  onBack,
}: {
  onBack: () => void;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <PencilLine className="h-5 w-5 text-muted-foreground" />
        </span>
        <div>
          <p className="font-medium">Selecione uma oportunidade</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Volte à lista e escolha o pedido que deseja editar.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft />
          Ver oportunidades
        </Button>
      </CardContent>
    </Card>
  );
}

export default function OrderRegistrationWorkspace() {
  const [
    { tab, opportunity: opportunityId, draft: persistedDraft },
    setQuery,
  ] = useQueryStates(
    {
      tab: parseAsStringLiteral(ORDER_REGISTRATION_TABS).withDefault(
        "oportunidades",
      ),
      opportunity: parseAsString,
      draft: persistedDraftParser,
    },
    { history: "push" },
  );
  const [snapshot, setSnapshot] = useState<OrderRegistrationResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await fetch("/api/cadastro-pedido", {
        cache: "no-store",
      });
      const result = (await response.json()) as
        | OrderRegistrationResponse
        | { error?: string };
      if (!response.ok || !("opportunities" in result)) {
        throw new Error(
          "error" in result && result.error
            ? result.error
            : "Não foi possível carregar as oportunidades.",
        );
      }
      setSnapshot(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar as oportunidades.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateOpportunity = useCallback(
    (updatedOpportunity: OrderRegistrationOpportunity) => {
      setSnapshot((current) =>
        current
          ? {
              ...current,
              opportunities: current.opportunities.map((opportunity) =>
                opportunity.id === updatedOpportunity.id
                  ? updatedOpportunity
                  : opportunity,
              ),
            }
          : current,
      );
    },
    [],
  );

  const returnToList = useCallback(() => {
    void setQuery(
      { tab: "oportunidades", opportunity: null, draft: null },
      { scroll: true },
    );
  }, [setQuery]);

  const editOpportunity = useCallback(
    (id: string) => {
      void setQuery(
        { tab: "editar", opportunity: id, draft: null },
        { scroll: true },
      );
    },
    [setQuery],
  );

  const handleSaved = useCallback(
    (updatedOpportunity: OrderRegistrationOpportunity) => {
      updateOpportunity(updatedOpportunity);
      returnToList();
    },
    [returnToList, updateOpportunity],
  );

  const persistDraft = useCallback(
    (draft: OrderRegistrationDraft) => {
      if (!opportunityId) return;
      void setQuery(
        {
          draft: {
            opportunityId,
            draft: compactDraftForUrl(draft),
          },
        },
        { history: "replace", shallow: true, scroll: false },
      );
    },
    [opportunityId, setQuery],
  );

  const changeTab = (value: string) => {
    if (value === "oportunidades") {
      returnToList();
      return;
    }
    if (opportunityId) {
      void setQuery({ tab: "editar" }, { scroll: true });
    }
  };

  const selectedOpportunity =
    snapshot?.opportunities.find(
      (opportunity) => opportunity.id === opportunityId,
    ) ?? null;
  const restoredDraft =
    selectedOpportunity &&
    persistedDraft?.opportunityId === selectedOpportunity.id &&
    persistedDraft.draft.updatedAt === selectedOpportunity.updatedAt
      ? persistedDraft.draft
      : null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <ClipboardCheck className="h-4 w-4" />
            Cadastros · GHL
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Cadastro de pedidos
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Selecione uma oportunidade e revise o pedido em uma área dedicada.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            Atendimento · Pagamento Confirmado/Completar Dados · Abertos e ganhos
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void load(true)}
          >
            {refreshing ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Não foi possível carregar os pedidos</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button
              type="button"
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

      <Tabs value={tab} onValueChange={changeTab} className="gap-4">
        <TabsList className="grid h-auto w-full max-w-lg grid-cols-2">
          <TabsTrigger value="oportunidades" className="py-2">
            <ListChecks />
            Oportunidades
          </TabsTrigger>
          <TabsTrigger
            value="editar"
            className="py-2"
            disabled={!opportunityId}
          >
            <PencilLine />
            Editar pedido
          </TabsTrigger>
        </TabsList>

        <TabsContent value="oportunidades" className="space-y-4">
          {loading ? <LoadingCard /> : null}

          {!loading && snapshot && snapshot.opportunities.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p>
                  <strong>{snapshot.opportunities.length}</strong>{" "}
                  {snapshot.opportunities.length === 1
                    ? "oportunidade aguardando conferência"
                    : "oportunidades aguardando conferência"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Selecione um card para abrir o formulário de edição.
                </p>
              </div>
              <div className="space-y-4">
                {snapshot.opportunities.map((opportunity) => (
                  <OrderRegistrationCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    config={snapshot.config}
                    mode="summary"
                    onSaved={updateOpportunity}
                    onEdit={() => editOpportunity(opportunity.id)}
                  />
                ))}
              </div>
            </>
          ) : null}

          {!loading && snapshot?.opportunities.length === 0 ? (
            <EmptyList />
          ) : null}
        </TabsContent>

        <TabsContent value="editar" className="space-y-4">
          {loading ? <LoadingCard /> : null}

          {!loading && snapshot && selectedOpportunity ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={returnToList}
                >
                  <ArrowLeft />
                  Voltar às oportunidades
                </Button>
                <p className="text-xs text-muted-foreground">
                  Salvar ou cancelar retorna automaticamente à lista.
                </p>
              </div>
              <OrderRegistrationCard
                key={selectedOpportunity.id}
                opportunity={selectedOpportunity}
                config={snapshot.config}
                mode="editor"
                restoredDraft={restoredDraft}
                onDraftChange={persistDraft}
                onSaved={handleSaved}
                onCancel={returnToList}
              />
            </>
          ) : null}

          {!loading && snapshot && !selectedOpportunity ? (
            <MissingOpportunity onBack={returnToList} />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
