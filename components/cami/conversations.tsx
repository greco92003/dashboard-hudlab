"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ConversationDetail, ConversationItem } from "@/lib/ghl/ai-seller/intel-load";
import { cn } from "@/lib/utils";
import {
  DECISION_LABEL,
  MOTIVO_LABEL,
  SIGNAL_LABEL,
  SITUACAO_CLASS,
  SITUACAO_LABEL,
  fmtAgo,
  fmtDateTime,
  fmtDuration,
  fmtInt,
  fmtMoney,
  ghlContactUrl,
  label,
} from "./format";

type Filtro = "revisar" | "atendendo" | "passadas" | "encerradas" | "todas";

const FILTROS: Array<{ id: Filtro; label: string; test: (c: ConversationItem) => boolean }> = [
  { id: "revisar", label: "Para revisar", test: (c) => c.paraRevisar },
  { id: "atendendo", label: "Atendendo", test: (c) => c.situacao === "atendendo" || c.situacao === "esperando_cliente" },
  { id: "passadas", label: "Passadas", test: (c) => c.situacao === "passou" || c.situacao === "humano_assumiu" },
  { id: "encerradas", label: "Encerradas", test: (c) => c.situacao === "ganhou" || c.situacao === "perdeu" },
  { id: "todas", label: "Todas", test: () => true },
];

function lastSpeaker(c: ConversationItem): string {
  if (!c.lastClientAt && !c.lastCamiAt) return "Cliente ainda não escreveu";
  if (c.lastCamiAt && (!c.lastClientAt || c.lastCamiAt > c.lastClientAt)) return `Cami falou por último ${fmtAgo(c.lastCamiAt)}`;
  return `Cliente falou por último ${fmtAgo(c.lastClientAt)}`;
}

export function CamiConversations({
  items,
  loading,
  isOwner,
  escalationName,
  onReviewed,
}: {
  items: ConversationItem[];
  loading: boolean;
  isOwner: boolean;
  escalationName: string;
  onReviewed: () => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>("revisar");
  const [open, setOpen] = useState<ConversationItem | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const counts = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.id, items.filter(f.test).length])) as Record<Filtro, number>,
    [items],
  );
  const visible = items.filter(FILTROS.find((f) => f.id === filtro)!.test);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setDetail(null);
    setDetailLoading(true);
    fetch(`/api/cami/conversations/${open.opportunityId}`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Falha ao abrir a conversa");
        setDetail(data);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") toast.error((err as Error).message);
      })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [open]);

  const review = async (item: ConversationItem) => {
    setReviewing(true);
    try {
      const res = await fetch(`/api/cami/conversations/${item.opportunityId}/review`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível marcar como revisado");
      toast.success("Marcado como revisado");
      setOpen(null);
      onReviewed();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReviewing(false);
    }
  };

  const situacaoText = (c: ConversationItem) =>
    c.situacao === "passou" ? `Passou para ${escalationName}` : label(SITUACAO_LABEL, c.situacao);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar conversas">
        {FILTROS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filtro === f.id ? "default" : "outline"}
            onClick={() => setFiltro(f.id)}
          >
            {f.label}
            <span className="ml-1 tabular-nums opacity-70">{counts[f.id]}</span>
          </Button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="border-dashed py-6">
          <CardContent className="text-center text-sm text-muted-foreground">
            {items.length === 0
              ? "A Cami ainda não assumiu nenhum cliente. As conversas aparecem aqui quando ela assumir."
              : filtro === "revisar"
                ? "Nada para revisar agora."
                : "Nenhuma conversa neste filtro."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => (
            <button
              key={c.opportunityId}
              type="button"
              onClick={() => setOpen(c)}
              className="w-full text-left rounded-lg border p-4 hover:bg-muted/40 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.contactName || "Cliente sem nome"}</span>
                    <Badge variant="outline" className={cn("font-medium", SITUACAO_CLASS[c.situacao])}>
                      {situacaoText(c)}
                    </Badge>
                    {c.signals.map((s) => (
                      <Badge
                        key={s}
                        variant="outline"
                        className={cn(
                          "gap-1",
                          c.paraRevisar ? "text-red-700 dark:text-red-300 border-red-500/40" : "text-muted-foreground",
                        )}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {label(SIGNAL_LABEL, s)}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fmtInt(c.pares)} pares · {c.stageName ?? "etapa —"} · assumido {fmtDateTime(c.assignedAt)} · {lastSpeaker(c)}
                  </p>
                </div>
                <div className="text-right text-sm shrink-0">
                  <div className="font-semibold tabular-nums">{fmtMoney(c.monetaryValue)}</div>
                  <div className="text-xs text-muted-foreground">{fmtInt(c.replies)} respostas</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.contactName || "Cliente sem nome"}</SheetTitle>
                <SheetDescription>
                  {fmtInt(open.pares)} pares · {open.stageName ?? "etapa —"} · {situacaoText(open)}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6">
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <a href={ghlContactUrl(open.contactId)} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Abrir no GHL
                    </a>
                  </Button>
                  {isOwner && open.paraRevisar && (
                    <Button size="sm" onClick={() => review(open)} disabled={reviewing}>
                      {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Revisado
                    </Button>
                  )}
                </div>

                {open.signals.length > 0 && (
                  <section className="space-y-1">
                    <h3 className="text-sm font-semibold">Sinais</h3>
                    <ul className="text-sm text-muted-foreground list-disc pl-5">
                      {open.signals.map((s) => (
                        <li key={s}>{label(SIGNAL_LABEL, s)}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {detailLoading && <Skeleton className="h-40 w-full" />}

                {detail?.passagem && (
                  <section className="space-y-1 rounded-md border p-3">
                    <h3 className="text-sm font-semibold">
                      Passagem: {label(MOTIVO_LABEL, detail.passagem.motivo)}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {fmtDateTime(detail.passagem.escalatedAt)} ·{" "}
                      {detail.passagem.answeredAt
                        ? `respondida em ${fmtDuration(
                            (Date.parse(detail.passagem.answeredAt) - Date.parse(detail.passagem.escalatedAt)) / 1000,
                          )}`
                        : "ainda sem resposta do time"}
                    </p>
                    {detail.passagem.resumo && <p className="text-sm whitespace-pre-line">{detail.passagem.resumo}</p>}
                  </section>
                )}

                {detail && (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">O que a Cami prometeu</h3>
                    {detail.promessas.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum orçamento passado ainda.</p>
                    ) : (
                      <ul className="space-y-1 text-sm">
                        {detail.promessas.map((p, i) => (
                          <li key={i} className="flex flex-wrap justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                            <span>
                              {fmtInt(p.pares)} pares × {fmtMoney(p.unitario, 2)} · frete{" "}
                              {p.frete == null ? "a confirmar" : p.frete === 0 ? "grátis" : fmtMoney(p.frete, 2)}
                            </span>
                            <span className="text-muted-foreground">
                              total {fmtMoney(p.total, 2)} · {fmtDateTime(p.at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}

                {detail && (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Rodadas da Cami</h3>
                    {detail.runs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">O cliente ainda não escreveu depois da amostra.</p>
                    ) : (
                      <ol className="space-y-2">
                        {detail.runs.map((r, i) => (
                          <li key={i} className="rounded-md border px-3 py-2 text-sm">
                            <div className="flex flex-wrap justify-between gap-2">
                              <span className="font-medium">
                                {label(DECISION_LABEL, r.decision)}
                                {r.escalationReason && ` · ${label(MOTIVO_LABEL, r.escalationReason)}`}
                              </span>
                              <span className="text-xs text-muted-foreground">{fmtDateTime(r.triggeredAt)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {r.responseMs != null && `respondeu em ${fmtDuration(r.responseMs / 1000)} · `}
                              {fmtInt(r.tokensIn)} tokens
                              {r.tools.length > 0 && ` · ${r.tools.join(", ")}`}
                            </p>
                            {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
