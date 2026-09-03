"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { parseAsString, useQueryState } from "nuqs";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  ImageIcon,
  Loader2,
  MessageSquareText,
  RefreshCw,
  TriangleAlert,
  Volume2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { mockupStageStyle } from "@/lib/ghl/mockup-instructions/briefing";

type InstructionRun = {
  id: string;
  stage_name: string;
  status: "processing" | "completed" | "skipped" | "failed";
  summary: string | null;
  result_json: {
    pedidoAtual?: unknown;
    alteracoesDestaRodada?: unknown;
  } | null;
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
  contactName: string | null;
  email: string | null;
  phone: string | null;
  monetaryValue: number | null;
  stageName: string;
  currentSummary: string | null;
  conversationId: string | null;
  cacheUpdatedAt: string | null;
  lastMessageAt: string | null;
  history: InstructionRun[];
  conversationMedia: Array<{
    id: string;
    url: string;
    messageId: string;
    direction: "inbound" | "outbound";
    dateAdded: string;
  }>;
};

type MockupResponse = { deals: MockupDeal[] };

const GHL_LOCATION_ID = "dhz2q752HHI3xw2jHkrv";
const LIST_URL = "/designers?tab=instrucoes-mockup";

function formatMoney(value: number | null) {
  if (value == null) return "Valor não informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusBadge(run: InstructionRun) {
  if (run.status === "completed") {
    return <Badge className="bg-emerald-600">Resumo pronto</Badge>;
  }
  if (run.status === "processing") {
    return <Badge variant="secondary">Processando</Badge>;
  }
  if (run.status === "failed") {
    return <Badge variant="destructive">Falhou</Badge>;
  }
  return <Badge variant="outline">Ignorado pela regra</Badge>;
}

const SUMMARY_HEADING =
  /^(OBJETIVO|EXECUÇÃO|REFERÊNCIAS|RESTRIÇÕES|DÚVIDAS)\s*:?[ \t]*$/i;

function parseSummary(summary: string) {
  const sections: Array<{ title: string; body: string }> = [];
  let current = { title: "RESUMO", lines: [] as string[] };

  for (const line of summary.split(/\r?\n/)) {
    const heading = line.trim().match(SUMMARY_HEADING);
    if (heading) {
      if (current.lines.some((item) => item.trim())) {
        sections.push({
          title: current.title,
          body: current.lines.join("\n").trim(),
        });
      }
      current = { title: heading[1].toLocaleUpperCase("pt-BR"), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some((item) => item.trim())) {
    sections.push({
      title: current.title,
      body: current.lines.join("\n").trim(),
    });
  }
  return sections.length ? sections : [{ title: "RESUMO", body: summary }];
}

function summarizedChange(run: InstructionRun | undefined) {
  const result = run?.result_json;
  if (!result) return null;

  const changes = Array.isArray(result.alteracoesDestaRodada)
    ? result.alteracoesDestaRodada.filter(
        (item): item is string =>
          typeof item === "string" && Boolean(item.trim()),
      )
    : [];
  if (changes.length) return changes.slice(0, 2).join(" ");

  return typeof result.pedidoAtual === "string" && result.pedidoAtual.trim()
    ? result.pedidoAtual.trim()
    : null;
}

function ReferenceImages({
  media,
}: {
  media: MockupDeal["conversationMedia"];
}) {
  if (!media.length) return null;
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {media.map((item, index) => (
        <Dialog key={item.id}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group overflow-hidden rounded-xl border bg-muted text-left shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* GHL fornece a URL original do anexo; mantemos a imagem na sequência do briefing. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={`Referência visual ${index + 1}`}
                className="aspect-square w-full object-cover transition duration-200 group-hover:scale-[1.02]"
              />
              <span className="block px-3 py-2 text-xs text-muted-foreground">
                {item.direction === "inbound"
                  ? "Enviada pelo cliente"
                  : "Enviada pela HUD Lab"}
                {" · "}
                {formatDateTime(item.dateAdded)}
              </span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden p-3 sm:max-w-5xl">
            <DialogTitle className="px-2 pt-1">
              Referência visual {index + 1}
            </DialogTitle>
            <DialogDescription className="px-2">
              {item.direction === "inbound"
                ? "Imagem enviada pelo cliente"
                : "Imagem enviada pela HUD Lab"}
              {" · "}
              {formatDateTime(item.dateAdded)}
            </DialogDescription>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={`Referência visual ${index + 1} ampliada`}
              className="max-h-[78vh] w-full rounded-lg bg-black/5 object-contain"
            />
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}

function BriefingSections({
  summary,
  media = [],
  openObjective = false,
  headline,
}: {
  summary: string;
  media?: MockupDeal["conversationMedia"];
  openObjective?: boolean;
  headline?: string | null;
}) {
  const sections = useMemo(() => parseSummary(summary), [summary]);
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(openObjective ? ["OBJETIVO"] : []),
  );

  function toggle(title: string) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  return (
    <div className="divide-y rounded-xl border bg-background">
      {headline ? (
        <header className="bg-primary/[0.04] px-4 py-5 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Alteração resumida
          </p>
          <p className="mt-2 text-base font-medium leading-7 text-foreground sm:text-lg">
            {headline}
          </p>
        </header>
      ) : null}
      {sections.map((section) => {
        const open = openSections.has(section.title);
        const isReferences = section.title === "REFERÊNCIAS";
        return (
          <section key={section.title}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(section.title)}
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left font-semibold tracking-wide transition-colors hover:bg-muted/50 sm:px-5"
            >
              {section.title}
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
            {open ? (
              <div className="px-4 pb-5 sm:px-5">
                <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
                  {section.body}
                </p>
                {isReferences ? <ReferenceImages media={media} /> : null}
              </div>
            ) : null}
          </section>
        );
      })}
      {!sections.some((section) => section.title === "REFERÊNCIAS") &&
      media.length ? (
        <section>
          <button
            type="button"
            aria-expanded={openSections.has("REFERÊNCIAS VISUAIS")}
            onClick={() => toggle("REFERÊNCIAS VISUAIS")}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left font-semibold tracking-wide transition-colors hover:bg-muted/50 sm:px-5"
          >
            REFERÊNCIAS VISUAIS
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                openSections.has("REFERÊNCIAS VISUAIS") && "rotate-180",
              )}
            />
          </button>
          {openSections.has("REFERÊNCIAS VISUAIS") ? (
            <div className="px-4 pb-5 sm:px-5">
              <ReferenceImages media={media} />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function BlogBriefing({
  summary,
  headline,
}: {
  summary: string;
  headline?: string | null;
}) {
  // Resumos antigos tinham cabeçalhos; apresentamos o conteúdo como narrativa
  // enquanto as próximas execuções já chegam no novo formato.
  const narrative = summary
    .replace(/^(OBJETIVO|EXECUÇÃO|REFERÊNCIAS|RESTRIÇÕES|DÚVIDAS)\s*:?[ \t]*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return (
    <article className="overflow-hidden rounded-xl border bg-background">
      {headline ? (
        <header className="bg-primary/[0.04] px-4 py-5 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Alteração resumida
          </p>
          <p className="mt-2 text-base font-medium leading-7 text-foreground sm:text-lg">
            {headline}
          </p>
        </header>
      ) : null}
      <div className="px-4 py-1 sm:px-5">
        <ReactMarkdown
          components={{
          p: ({ children }) => (
            <p className="my-4 text-sm leading-7 text-foreground/90 first:mt-0 last:mb-0">
              {children}
            </p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline underline-offset-4"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <span className="my-4 block max-w-full">
              <span className="mb-2 block text-sm font-semibold text-foreground">
                {alt || "Referência visual do briefing"}
              </span>
              <a
                href={typeof src === "string" ? src : undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-block max-w-full"
              >
                {/* A imagem abre na URL original que também foi salva no GHL. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={typeof src === "string" ? src : undefined}
                  alt={alt || "Referência visual do briefing"}
                  className="h-44 w-auto max-w-full rounded-xl border bg-muted object-cover shadow-sm transition hover:border-primary/50 hover:shadow-md sm:h-52"
                />
              </a>
            </span>
          ),
          }}
        >
          {narrative}
        </ReactMarkdown>
      </div>
    </article>
  );
}

export function MockupInstructionDetail() {
  const [dealId] = useQueryState("deal", parseAsString);
  const [snapshot, setSnapshot] = useState<MockupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/designers/mockup-instructions?deal=${encodeURIComponent(dealId || "")}`,
          { cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.details || result.error || "Erro ao carregar");
        }
        setSnapshot(result);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar a instrução.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dealId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const regenerate = useCallback(async () => {
    if (!dealId) return;
    setRegenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/designers/mockup-instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.details || result.reason || result.error);
      }
      await load(true);
    } catch (regenerateError) {
      setError(
        regenerateError instanceof Error
          ? regenerateError.message
          : "Não foi possível regenerar a instrução.",
      );
    } finally {
      setRegenerating(false);
    }
  }, [dealId, load]);

  const deal = useMemo(
    () => snapshot?.deals.find((item) => item.id === dealId) ?? null,
    [dealId, snapshot],
  );
  const currentHeadline = useMemo(
    () =>
      summarizedChange(
        deal?.history.find(
          (run) => run.status === "completed" && Boolean(run.summary),
        ),
      ),
    [deal],
  );
  const stageStyle = deal ? mockupStageStyle(deal.stageName) : null;

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <Button variant="ghost" size="sm" className="-ml-3 mb-2" asChild>
            <Link href={LIST_URL}>
              <ArrowLeft /> Voltar para Instrução mockup
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {deal?.name || "Detalhes da instrução"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Resumo vigente e histórico completo da automação no GHL.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={!dealId || regenerating}
            onClick={() => void regenerate()}
          >
            {regenerating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Regenerar briefing
          </Button>
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
      </div>

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Não foi possível carregar o detalhe</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : null}

      {!loading && !dealId ? (
        <Alert>
          <TriangleAlert />
          <AlertTitle>Deal não informado</AlertTitle>
          <AlertDescription>
            Abra esta tela a partir de um card da tab Instrução mockup.
          </AlertDescription>
        </Alert>
      ) : null}

      {!loading && dealId && !deal && !error ? (
        <Alert>
          <TriangleAlert />
          <AlertTitle>Deal não encontrado</AlertTitle>
          <AlertDescription>
            O negócio pode ter saído das etapas monitoradas. Volte para ver a
            lista atual.
          </AlertDescription>
        </Alert>
      ) : null}

      {!loading && deal ? (
        <div className="mx-auto grid w-full max-w-5xl gap-5">
          <Card>
            <CardHeader className="gap-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <CardTitle>{deal.name}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {deal.contactName ||
                      deal.email ||
                      deal.phone ||
                      "Contato não informado"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline" className={stageStyle?.badge}>
                      {deal.stageName}
                    </Badge>
                    <Badge variant="secondary">
                      {formatMoney(deal.monetaryValue)}
                    </Badge>
                  </div>
                </div>
                {deal.conversationId ? (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/conversations/conversations/${deal.conversationId}?category=team-inbox&tab=all`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir conversa <ExternalLink />
                    </a>
                  </Button>
                ) : null}
              </div>
              <div className="space-y-3 rounded-lg bg-muted/20 p-4 sm:p-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Instrução vigente no GHL
                </p>
                {deal.currentSummary ? (
                  <BlogBriefing
                    summary={deal.currentSummary}
                    headline={currentHeadline}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ainda sem resumo.
                  </p>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock3 /> Cache: {formatDateTime(deal.cacheUpdatedAt)}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquareText /> Última mensagem:{" "}
                {formatDateTime(deal.lastMessageAt)}
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico de resumos</CardTitle>
            </CardHeader>
            <CardContent>
              {deal.history.length ? (
                <ol className="relative space-y-4 border-l pl-5">
                  {deal.history.map((run) => (
                    <li key={run.id} className="relative">
                      <span className="absolute -left-[25px] top-1 flex h-3 w-3 rounded-full border-2 border-background bg-primary" />
                      <div className="rounded-lg border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {run.status === "completed" ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : null}
                            <span className="font-medium">
                              {run.stage_name}
                            </span>
                            {statusBadge(run)}
                            {run.cache_hit ? (
                              <Badge variant="outline">cache incremental</Badge>
                            ) : null}
                          </div>
                          <time className="text-xs text-muted-foreground">
                            {formatDateTime(run.completed_at || run.created_at)}
                          </time>
                        </div>
                        {run.summary ? (
                          <div className="mt-3">
                            <BlogBriefing
                              summary={run.summary}
                              headline={summarizedChange(run)}
                            />
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-muted-foreground">
                            {run.error_message ||
                              run.skip_reason ||
                              "Execução sem resumo."}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-3 border-t pt-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MessageSquareText /> {run.new_messages_processed}{" "}
                            novas / {run.messages_read} lidas
                          </span>
                          <span className="flex items-center gap-1">
                            <ImageIcon /> {run.images_processed} imagens
                          </span>
                          <span className="flex items-center gap-1">
                            <Volume2 /> {run.audios_processed} áudios
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                  Nenhuma execução registrada ainda.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
