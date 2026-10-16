"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, Loader2, MessageSquarePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ConversationDetail, ConversationItem } from "@/lib/ghl/ai-seller/intel-load";
import { FEEDBACK_ATALHOS, type ConversaItem, type MensagemView } from "@/lib/ghl/ai-seller/feedback-shape";
import type { Feedback } from "@/lib/ghl/ai-seller/feedback";
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

type Detail = ConversationDetail & { feedbacks: Feedback[]; podeDarFeedback: boolean; proximaRevisao: string };

const TZ = "America/Sao_Paulo";
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const fmtDia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
const isImage = (url: string) => /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url);

function lastSpeaker(c: ConversationItem): string {
  if (!c.lastClientAt && !c.lastCamiAt) return "Cliente ainda não escreveu";
  if (c.lastCamiAt && (!c.lastClientAt || c.lastCamiAt > c.lastClientAt)) return `Cami falou por último ${fmtAgo(c.lastCamiAt)}`;
  return `Cliente falou por último ${fmtAgo(c.lastClientAt)}`;
}

const QUEM_LABEL: Record<MensagemView["quem"], string> = { cliente: "Cliente", cami: "Cami", time: "Time", robo: "Robô" };

function Bubble({
  m,
  marcada,
  marcando,
  onToggle,
}: {
  m: MensagemView;
  marcada: boolean;
  marcando: boolean;
  onToggle: () => void;
}) {
  const fromClient = m.quem === "cliente";
  const body = (
    <>
      {m.anexos.map((url) =>
        isImage(url) ? (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="mb-1 block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Imagem enviada na conversa" loading="lazy" className="max-h-48 rounded-lg" />
          </a>
        ) : (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="mb-1 block text-xs underline">
            Abrir anexo
          </a>
        ),
      )}
      {m.texto && <span className="whitespace-pre-line break-words">{m.texto}</span>}
      <span
        className={cn(
          "mt-1 block text-[11px]",
          m.quem === "cami" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground",
        )}
      >
        {QUEM_LABEL[m.quem]} · {fmtHora(m.at)}
        {marcada && " · marcada"}
      </span>
    </>
  );
  const cls = cn(
    "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed text-left",
    fromClient ? "self-start rounded-bl-md bg-zinc-100 dark:bg-zinc-800" : "self-end rounded-br-md",
    m.quem === "cami" && "border border-emerald-500/40 bg-emerald-500/10",
    m.quem === "time" && "border bg-background",
    m.quem === "robo" && "border border-dashed text-muted-foreground",
    marcada && "ring-2 ring-amber-500",
  );
  // No modo feedback, as mensagens da Cami viram botões para marcar o trecho.
  if (marcando && m.quem === "cami") {
    return (
      <button type="button" onClick={onToggle} aria-pressed={marcada} className={cls}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

function Conversa({
  itens,
  marcadas,
  marcando,
  onToggle,
}: {
  itens: ConversaItem[];
  marcadas: Set<string>;
  marcando: boolean;
  onToggle: (id: string) => void;
}) {
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  let ultimoDia = "";
  return (
    <div className="flex flex-col gap-2">
      {itens.map((item, i) => {
        const primeira = item.tipo === "mensagem" ? item.mensagem : item.mensagens[0];
        const dia = fmtDia(primeira.at);
        const separador = dia !== ultimoDia;
        ultimoDia = dia;
        return (
          <div key={item.tipo === "mensagem" ? item.mensagem.id : `robo-${i}`} className="flex flex-col gap-2">
            {separador && (
              <span className="self-center rounded-full bg-muted px-3 py-0.5 text-[11px] text-muted-foreground">{dia}</span>
            )}
            {item.tipo === "mensagem" ? (
              <Bubble
                m={item.mensagem}
                marcada={marcadas.has(item.mensagem.id)}
                marcando={marcando}
                onToggle={() => onToggle(item.mensagem.id)}
              />
            ) : abertos.has(i) ? (
              item.mensagens.map((m) => (
                <Bubble key={m.id} m={m} marcada={false} marcando={false} onToggle={() => {}} />
              ))
            ) : (
              <button
                type="button"
                onClick={() => setAbertos((s) => new Set(s).add(i))}
                className="flex items-center justify-between gap-2 rounded-xl border border-dashed px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/40"
              >
                <span>Robô · {item.mensagens.length} mensagens automáticas</span>
                <span className="font-medium text-foreground">ver</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FeedbackForm({
  opportunityId,
  escalationName,
  marcadas,
  proximaRevisao,
  onSaved,
  onCancel,
}: {
  opportunityId: string;
  escalationName: string;
  marcadas: string[];
  proximaRevisao: string;
  onSaved: (f: Feedback) => void;
  onCancel: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [atalhos, setAtalhos] = useState<string[]>([]);
  const [urgente, setUrgente] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/cami/conversations/${opportunityId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, atalhos, mensagens: marcadas, urgente }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível guardar");
      toast.success(
        urgente
          ? "Feedback urgente guardado: a revisão do anexo sai em instantes para o dono aprovar"
          : `Feedback guardado · entra na revisão de segunda, ${data.proximaRevisao ?? proximaRevisao} (${data.pendentes} na fila)`,
      );
      onSaved(data.feedback);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Escreva do seu jeito o que a Cami fez bem ou mal neste atendimento. Ela não muda na hora: o feedback entra na revisão de
        segunda ({proximaRevisao}), que o dono aprova.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Atalhos">
        {FEEDBACK_ATALHOS.map((a) => {
          const on = atalhos.includes(a.id);
          return (
            <Button
              key={a.id}
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              aria-pressed={on}
              onClick={() => setAtalhos((s) => (on ? s.filter((x) => x !== a.id) : [...s, a.id]))}
            >
              {a.id === "devia_passar" ? `Devia passar para ${escalationName}` : a.label}
            </Button>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="feedback-texto">O que aconteceu</Label>
        <Textarea
          id="feedback-texto"
          rows={5}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder='Ex.: Quando ele mandou os ajustes, você começou três respostas com "Perfeito, Hiagu!" e repetiu o prazo em todas.'
        />
        <p className="text-xs text-muted-foreground">
          {marcadas.length
            ? `${marcadas.length} ${marcadas.length === 1 ? "mensagem marcada" : "mensagens marcadas"}. Toque nas mensagens da Cami para marcar ou desmarcar.`
            : "Opcional: toque nas mensagens da Cami acima para marcar o trecho."}
        </p>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
        <Checkbox id="feedback-urgente" checked={urgente} onCheckedChange={(v) => setUrgente(v === true)} className="mt-0.5" />
        <Label htmlFor="feedback-urgente" className="flex flex-col items-start gap-0.5 font-normal">
          <span className="font-semibold text-amber-800 dark:text-amber-200">Urgente: corrigir agora</span>
          <span className="text-xs text-muted-foreground">Preço, política ou informação errada. Vai direto para o dono, sem esperar segunda.</span>
        </Label>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar feedback
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function CamiConversations({
  items,
  loading,
  isOwner,
  escalationName,
  openId,
  onOpenChange,
  onReviewed,
}: {
  items: ConversationItem[];
  loading: boolean;
  isOwner: boolean;
  escalationName: string;
  /** Atendimento aberto pelo link (?conversa=), ex.: vindo de um push. */
  openId: string | null;
  onOpenChange: (opportunityId: string | null) => void;
  onReviewed: () => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>("revisar");
  const [open, setOpen] = useState<ConversationItem | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [dandoFeedback, setDandoFeedback] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [detalhes, setDetalhes] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.id, items.filter(f.test).length])) as Record<Filtro, number>,
    [items],
  );
  const visible = items.filter(FILTROS.find((f) => f.id === filtro)!.test);

  // Link direto para um atendimento (push de passagem ou de feedback urgente).
  useEffect(() => {
    if (!openId || open?.opportunityId === openId) return;
    const item = items.find((c) => c.opportunityId === openId);
    if (item) setOpen(item);
  }, [openId, items, open]);

  const openItem = (item: ConversationItem | null) => {
    setOpen(item);
    setDandoFeedback(false);
    setMarcadas(new Set());
    setDetalhes(false);
    onOpenChange(item?.opportunityId ?? null);
  };

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

  // Abre no fim da conversa, como no WhatsApp.
  useEffect(() => {
    if (detail?.conversa?.length) fimRef.current?.scrollIntoView({ block: "end" });
  }, [detail]);

  const review = async (item: ConversationItem) => {
    setReviewing(true);
    try {
      const res = await fetch(`/api/cami/conversations/${item.opportunityId}/review`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível marcar como revisado");
      toast.success("Marcado como revisado");
      openItem(null);
      onReviewed();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReviewing(false);
    }
  };

  const toggleMarcada = (id: string) =>
    setMarcadas((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
              onClick={() => openItem(c)}
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

      <Sheet open={!!open} onOpenChange={(v) => !v && openItem(null)}>
        <SheetContent className="w-full sm:max-w-xl gap-0 p-0">
          {open && (
            <div className="flex h-full min-h-0 flex-col">
              <SheetHeader className="border-b">
                <SheetTitle>{open.contactName || "Cliente sem nome"}</SheetTitle>
                <SheetDescription>
                  {fmtInt(open.pares)} pares · {open.stageName ?? "etapa —"} · {situacaoText(open)}
                </SheetDescription>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild size="sm" variant="outline">
                    <a href={ghlContactUrl(open.contactId)} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Abrir no GHL
                    </a>
                  </Button>
                  {isOwner && open.paraRevisar && (
                    <Button size="sm" variant="outline" onClick={() => review(open)} disabled={reviewing}>
                      {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Revisado
                    </Button>
                  )}
                </div>
              </SheetHeader>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
                {open.signals.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {open.signals.map((s) => (
                      <Badge key={s} variant="outline" className="gap-1 text-red-700 dark:text-red-300 border-red-500/40">
                        <AlertTriangle className="h-3 w-3" />
                        {label(SIGNAL_LABEL, s)}
                      </Badge>
                    ))}
                  </div>
                )}

                {detailLoading && <Skeleton className="h-64 w-full" />}

                {detail &&
                  (detail.conversa == null ? (
                    <p className="text-sm text-muted-foreground">Não consegui ler a conversa no GHL agora. Use &quot;Abrir no GHL&quot;.</p>
                  ) : detail.conversa.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem mensagens de WhatsApp com este contato.</p>
                  ) : (
                    <Conversa
                      itens={detail.conversa}
                      marcadas={marcadas}
                      marcando={dandoFeedback}
                      onToggle={toggleMarcada}
                    />
                  ))}
                <div ref={fimRef} />

                {detail && detail.feedbacks.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Feedbacks deste atendimento</h3>
                    <ul className="space-y-2">
                      {detail.feedbacks.map((f) => (
                        <li key={f.id} className="rounded-lg border p-3 text-sm">
                          <p className="text-xs text-muted-foreground">
                            {f.autor} · {fmtDateTime(f.at)}
                            {f.urgente && " · urgente"}
                            {f.status === "pendente" ? " · na fila da revisão" : f.status === "usado" ? " · já no anexo" : " · descartado"}
                          </p>
                          {f.atalhos.length > 0 && (
                            <p className="mt-1 text-xs font-medium">
                              {f.atalhos
                                .map((id) =>
                                  id === "devia_passar"
                                    ? `Devia passar para ${escalationName}`
                                    : FEEDBACK_ATALHOS.find((a) => a.id === id)?.label ?? id,
                                )
                                .join(" · ")}
                            </p>
                          )}
                          {f.texto && <p className="mt-1 whitespace-pre-line">{f.texto}</p>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {detail && (
                  <section className="rounded-lg border">
                    <button
                      type="button"
                      onClick={() => setDetalhes((v) => !v)}
                      aria-expanded={detalhes}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold"
                    >
                      Detalhes: passagem, preços e rodadas
                      <ChevronDown className={cn("h-4 w-4 transition-transform", detalhes && "rotate-180")} />
                    </button>
                    {detalhes && (
                      <div className="space-y-4 border-t px-3 py-3">
                        {detail.passagem && (
                          <div className="space-y-1">
                            <h4 className="text-sm font-semibold">Passagem: {label(MOTIVO_LABEL, detail.passagem.motivo)}</h4>
                            <p className="text-xs text-muted-foreground">
                              {fmtDateTime(detail.passagem.escalatedAt)} ·{" "}
                              {detail.passagem.answeredAt
                                ? `respondida em ${fmtDuration(
                                    (Date.parse(detail.passagem.answeredAt) - Date.parse(detail.passagem.escalatedAt)) / 1000,
                                  )}`
                                : "ainda sem resposta do time"}
                            </p>
                            {detail.passagem.resumo && <p className="text-sm whitespace-pre-line">{detail.passagem.resumo}</p>}
                          </div>
                        )}
                        <div className="space-y-1">
                          <h4 className="text-sm font-semibold">O que a Cami prometeu</h4>
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
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-semibold">Rodadas da Cami</h4>
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
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </div>

              {detail?.podeDarFeedback && (
                <div className="max-h-[70%] shrink-0 overflow-y-auto border-t bg-background px-4 py-4">
                  {dandoFeedback ? (
                    <FeedbackForm
                      opportunityId={open.opportunityId}
                      escalationName={escalationName}
                      marcadas={[...marcadas]}
                      proximaRevisao={detail.proximaRevisao}
                      onCancel={() => {
                        setDandoFeedback(false);
                        setMarcadas(new Set());
                      }}
                      onSaved={(f) => {
                        setDetail((d) => (d ? { ...d, feedbacks: [f, ...d.feedbacks] } : d));
                        setDandoFeedback(false);
                        setMarcadas(new Set());
                      }}
                    />
                  ) : (
                    <Button className="h-12 w-full text-base font-semibold" onClick={() => setDandoFeedback(true)}>
                      <MessageSquarePlus className="h-5 w-5" />
                      Dar feedback deste atendimento
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
