"use client";

// Simulador de treino da Arena: conversa com o cliente simulado, cronômetro,
// avaliação e histórico de feedbacks. Saiu da página da Arena para a página
// nova (gamificada) poder ficar em volta dele.
import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  Timer,
  MessageSquare,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Lightbulb,
  History,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Gauge } from "@/components/charts/gauge";
import {
  TrainingChat,
  type TrainingChatMessage,
} from "@/components/sellers-v2/training-chat";

export interface CurrentUserTraining {
  todayScore: number | null;
  daysTrained: number;
  totalDays: number;
  elapsedDays: number;
  trainedWeekdays: number[];
}

export interface TrainingSessionSnapshot {
  id: string;
  status: "active" | "evaluating" | "completed" | "expired" | "failed";
  startedAt: string;
  deadlineAt: string;
  endedAt: string | null;
  messages: TrainingChatMessage[];
  evaluation: {
    report: AuditorReport & { naoAvaliavel?: boolean; motivoNaoAvaliavel?: string };
    score: number | null;
    classification: string | null;
    hasCriticalError: boolean;
  } | null;
  score: number | null;
  completionReason: string | null;
  missionId?: string | null;
  comparacaoCami?: unknown;
}

interface AuditorReport {
  resumo: string;
  notasPorCriterio: {
    precisaoInformacoes: number;
    entendimentoNecessidade: number;
    construcaoValor: number;
    conducaoProximoPasso: number;
    clarezaComunicacao: number;
  };
  evidencias: string[];
  acertos: string[];
  falhas: string[];
  errosCriticos: string[];
  exemploRespostaMelhor: string;
}

function TrainingCountdown({
  deadline,
  onExpire,
}: {
  deadline: number;
  onExpire: () => void;
}) {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const [seconds, setSeconds] = useState(() =>
    Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
  );

  useEffect(() => {
    let expirationSent = false;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((deadline - Date.now()) / 1000),
      );
      setSeconds(remaining);
      if (remaining === 0 && !expirationSent) {
        expirationSent = true;
        onExpireRef.current();
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [deadline]);

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return (
    <>
      {minutes.toString().padStart(2, "0")}:
      {remainingSeconds.toString().padStart(2, "0")}
    </>
  );
}

function scoreColor(score: number) {
  if (score >= 90) return "var(--primary)";
  if (score >= 80) return "var(--chart-5)";
  if (score >= 70) return "var(--chart-3)";
  if (score >= 60) return "oklch(0.75 0.17 65)";
  return "var(--destructive)";
}

function TrainingGauge({
  value,
  label,
  footer,
  size = 190,
  color,
}: {
  value: number;
  label: string;
  footer?: string;
  size?: number;
  color?: string;
}) {
  const normalizedValue = Math.max(0, Math.min(100, value));

  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <Gauge
        value={normalizedValue}
        centerValue={value}
        defaultLabel={label}
        startAngle={135}
        endAngle={405}
        totalNotches={30}
        spacing={13}
        notchCornerRadius={12}
        notchLengthPercent={100}
        useGradient={false}
        inactiveFillOpacity={0.35}
        activeFillOpacity={1}
        activeFill={color ?? "var(--primary)"}
        formatOptions={{ style: "decimal", maximumFractionDigits: 0 }}
        enterTransition={{
          type: "tween",
          duration: 1.1,
          ease: [0.85, 0, 0.15, 1],
        }}
        enterStaggerScale={1}
        width={size}
        height={size}
        centerValueClassName="text-[clamp(2.5rem,32cqw,4.25rem)] font-bold tracking-[-0.06em] leading-none"
        centerLabelClassName="mt-1 text-[clamp(0.7rem,9cqw,0.8rem)] font-medium text-muted-foreground"
      />
      {footer && (
        <p className="-mt-2 text-xs font-medium text-muted-foreground">
          {footer}
        </p>
      )}
    </div>
  );
}

export function TrainingPanel({
  currentUserTraining,
  loadingRankings,
  trainingSessionId,
  setTrainingSession,
  onSessionEnded,
  missionId = null,
  onSessionChange,
}: {
  currentUserTraining: CurrentUserTraining;
  loadingRankings: boolean;
  trainingSessionId: string | null;
  setTrainingSession: (id: string | null) => void;
  /** Treino avaliado: a página recarrega XP e ranking. */
  onSessionEnded: () => void | Promise<void>;
  /** Missão escolhida na Arena: o próximo treino começa nela, e o último treino do dia não é reaberto sozinho. */
  missionId?: string | null;
  /** Sessão aberta no simulador (para a página mostrar a missão e o "Você × Cami"). */
  onSessionChange?: (session: TrainingSessionSnapshot | null) => void;
}) {
  // Chat state
  const [chatMessages, setChatMessages] = useState<TrainingChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionDeadlineTime, setSessionDeadlineTime] = useState<number | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [restoringSession, setRestoringSession] = useState(false);
  const [loadingFeedbackHistory, setLoadingFeedbackHistory] = useState(false);
  const [feedbackHistory, setFeedbackHistory] = useState<
    TrainingSessionSnapshot[] | null
  >(null);
  const [viewingHistoricalFeedback, setViewingHistoricalFeedback] =
    useState(false);
  // Same shape runAuditor produces for real negotiations (lib/ghl/sales-agent/agent.ts)
  // — training reuses the exact same scoring function/criteria so the two
  // notes are genuinely comparable, not just similarly-labeled.
  const [evaluation, setEvaluation] = useState<{
    report: AuditorReport & { naoAvaliavel?: boolean; motivoNaoAvaliavel?: string };
    score: number | null;
    classification: string | null;
    hasCriticalError: boolean;
  } | null>(null);

  const endingSessionRef = useRef(false);

  const applyTrainingSession = useCallback((session: TrainingSessionSnapshot) => {
    const deadline = new Date(session.deadlineAt).getTime();
    setFeedbackHistory(null);
    setViewingHistoricalFeedback(false);
    setChatMessages(session.messages ?? []);
    setSessionDeadlineTime(deadline);
    setSessionActive(session.status === "active" && deadline > Date.now());
    setEvaluating(session.status === "evaluating");
    setEvaluation(session.evaluation);
    onSessionChange?.(session);
  }, [onSessionChange]);

  useEffect(() => {
    const controller = new AbortController();
    const restore = async () => {
      setRestoringSession(true);
      try {
        // Missão escolhida e nenhum treino aberto: tela de início da missão, sem reabrir o último treino do dia.
        if (!trainingSessionId && missionId) {
          onSessionChange?.(null);
          return;
        }
        const query = trainingSessionId
          ? `?sessionId=${encodeURIComponent(trainingSessionId)}`
          : "";
        const response = await fetch(`/api/sellers-v2/training${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Falha ao restaurar sessão.");
        if (data.session) {
          applyTrainingSession(data.session);
          if (data.session.id !== trainingSessionId) {
            setTrainingSession(data.session.id);
          }
        } else if (trainingSessionId) {
          setTrainingSession(null);
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Error restoring training:", error);
          setChatError("Não foi possível restaurar o treinamento.");
        }
      } finally {
        setRestoringSession(false);
      }
    };
    void restore();
    return () => controller.abort();
  }, [applyTrainingSession, missionId, onSessionChange, setTrainingSession, trainingSessionId]);

  const startSession = async () => {
    setChatLoading(true);
    setChatError(null);
    setEvaluation(null);
    setFeedbackHistory(null);
    setViewingHistoricalFeedback(false);
    try {
      const response = await fetch("/api/sellers-v2/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", missionId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar.");
      applyTrainingSession(data.session);
      setTrainingSession(data.session.id);
    } catch (error) {
      console.error("Error starting session:", error);
      setChatError((error as Error).message || "Erro de conexão. Tente novamente.");
    } finally {
      setChatLoading(false);
    }
  };

  const viewFeedbackHistory = async () => {
    setLoadingFeedbackHistory(true);
    setChatError(null);
    try {
      const response = await fetch(
        "/api/sellers-v2/training?feedbackHistory=1",
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível buscar os feedbacks.");
      }
      if (!data.sessions?.length) {
        setChatError("Nenhum feedback de treinamento foi encontrado ainda.");
        return;
      }
      setFeedbackHistory(data.sessions);
    } catch (error) {
      setChatError(
        (error as Error).message || "Não foi possível buscar os feedbacks.",
      );
    } finally {
      setLoadingFeedbackHistory(false);
    }
  };

  const openHistoricalFeedback = (session: TrainingSessionSnapshot) => {
    if (!session.evaluation) return;
    setEvaluation(session.evaluation);
    setViewingHistoricalFeedback(true);
    setFeedbackHistory(null);
  };

  const returnToActiveTraining = () => {
    setEvaluation(null);
    setViewingHistoricalFeedback(false);
  };

  // Send chat message
  const sendMessage = async () => {
    if (!chatInput.trim() || chatLoading || !sessionActive) return;
    if (!trainingSessionId) return;
    const userMsg: TrainingChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: chatInput.trim(),
      timestamp: new Date().toISOString(),
    };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput("");
    setChatLoading(true);
    setChatError(null);

    try {
      const res = await fetch("/api/sellers-v2/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          sessionId: trainingSessionId,
          message: userMsg,
        }),
      });
      const data = await res.json();
      if (data.code === "QUOTA_EXCEEDED" || res.status === 429) {
        setChatError(data.error || "Cota da API de IA excedida.");
        return;
      }
      if (data.session) {
        applyTrainingSession(data.session);
      }
      if (!res.ok) {
        setChatError(data.error || "Não foi possível enviar a mensagem.");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setChatError("Erro de conexão. Tente novamente.");
    } finally {
      setChatLoading(false);
    }
  };

  // Client-side fallback shape for when there's nothing to actually score
  // (too short, API error, network error) — mirrors the naoAvaliavel report
  // shape the real runAuditor returns, so the UI branch handles both cases
  // identically.
  const buildNaoAvaliavelEvaluation = (motivo: string) => ({
    report: {
      naoAvaliavel: true,
      motivoNaoAvaliavel: motivo,
      resumo: "",
      notasPorCriterio: {
        precisaoInformacoes: 0,
        entendimentoNecessidade: 0,
        construcaoValor: 0,
        conducaoProximoPasso: 0,
        clarezaComunicacao: 0,
      },
      evidencias: [],
      acertos: [],
      falhas: [],
      errosCriticos: [],
      exemploRespostaMelhor: "",
    },
    score: null,
    classification: null,
    hasCriticalError: false,
  });

  // End session and persist its evaluation. The absolute deadline makes reloads stable.
  const endSession = useCallback(async (reason: "manual" | "timer" = "manual") => {
    if (!trainingSessionId || endingSessionRef.current) return;
    endingSessionRef.current = true;
    setSessionActive(false);
    setEvaluating(true);
    setChatError(null);

    try {
      const res = await fetch("/api/sellers-v2/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "evaluate",
          sessionId: trainingSessionId,
          completionReason: reason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        applyTrainingSession(data.session);
        await onSessionEnded();
      } else {
        // API returned an error — show a fallback so the UI doesn't get stuck
        setEvaluation(
          buildNaoAvaliavelEvaluation(
            data.error || "Não foi possível gerar a avaliação. Tente novamente.",
          ),
        );
      }
    } catch (error) {
      console.error("Error evaluating:", error);
      setEvaluation(
        buildNaoAvaliavelEvaluation("Erro de conexão ao avaliar a sessão. Tente novamente."),
      );
    } finally {
      setEvaluating(false);
      endingSessionRef.current = false;
    }
  }, [applyTrainingSession, onSessionEnded, trainingSessionId]);

  return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[650px] lg:grid-rows-1">
          {/* Chat Area */}
          <Card className="lg:col-span-2 flex h-full min-h-[400px] flex-col gap-0 overflow-hidden rounded-2xl border-border/60 py-0 shadow-none dark:border-white/10">
            <CardHeader className="shrink-0 border-b border-border/60 px-5 pt-4 [.border-b]:pb-4 dark:border-white/10">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-500" />
                Simulador de Vendas
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => void viewFeedbackHistory()}
                    variant="ghost"
                    size="sm"
                    disabled={loadingFeedbackHistory}
                    className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                  >
                    {loadingFeedbackHistory ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <History className="size-3.5" />
                    )}
                    <span className="hidden sm:inline">Ver últimos feedbacks</span>
                    <span className="sm:hidden">Feedbacks</span>
                  </Button>
                  {sessionActive && (
                    <>
                    <Badge
                      variant="destructive"
                      className="flex items-center gap-1"
                    >
                      <Timer className="h-3 w-3" />
                      {sessionDeadlineTime && (
                        <TrainingCountdown
                          deadline={sessionDeadlineTime}
                          onExpire={() => void endSession("timer")}
                        />
                      )}
                    </Badge>
                    <Button
                      onClick={() => void endSession("manual")}
                      variant="ghost"
                      size="sm"
                      disabled={evaluating}
                      className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      Finalizar
                    </Button>
                    </>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-0">
              {restoringSession && (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-primary" />
                </div>
              )}
              {!restoringSession && !evaluating && !evaluation && !feedbackHistory && (
                <TrainingChat
                  messages={chatMessages}
                  input={chatInput}
                  onInputChange={setChatInput}
                  onSend={sendMessage}
                  isLoading={chatLoading}
                  isActive={sessionActive}
                  error={chatError}
                  onDismissError={() => setChatError(null)}
                  onStart={startSession}
                  onViewFeedbackHistory={viewFeedbackHistory}
                  isLoadingFeedbackHistory={loadingFeedbackHistory}
                />
              )}
    
              {!restoringSession && !evaluating && feedbackHistory && (
                <div className="flex flex-1 flex-col overflow-y-auto p-4 sm:p-6">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">Últimos feedbacks</h3>
                      <p className="text-sm text-muted-foreground">
                        Selecione um treinamento para ver a avaliação completa.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFeedbackHistory(null)}
                      className="shrink-0 gap-1.5"
                    >
                      <ArrowLeft className="size-4" />
                      {sessionActive ? "Voltar ao treino" : "Fechar"}
                    </Button>
                  </div>
    
                  <div className="space-y-3">
                    {feedbackHistory.map((session, index) => {
                      const score = session.evaluation?.score;
                      const feedbackDate = new Date(
                        session.endedAt ?? session.startedAt,
                      );
                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => openHistoricalFeedback(session)}
                          className="group flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary/30 hover:bg-muted/30 sm:p-5"
                        >
                          <div
                            className="flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold tabular-nums"
                            style={{
                              color: score == null ? undefined : scoreColor(score),
                              backgroundColor: "color-mix(in oklch, currentColor 10%, transparent)",
                            }}
                          >
                            {score ?? "—"}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold">
                                Treinamento {index + 1}
                              </span>
                              {session.evaluation?.classification && (
                                <Badge variant="secondary" className="text-[11px]">
                                  {session.evaluation.classification}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {feedbackDate.toLocaleString("pt-BR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </p>
                          </div>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
    
              {evaluating && (
                <div className="flex flex-col flex-1 items-center justify-center space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Avaliando seu desempenho...
                  </p>
                </div>
              )}
    
              {!evaluating && !feedbackHistory && evaluation && (
                <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
                  {evaluation.score == null ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-muted/20 px-6 py-10 text-center">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <AlertTriangle className="size-6 text-muted-foreground" />
                      </div>
                      <div className="max-w-md space-y-1.5">
                        <p className="text-lg font-semibold">Conversa não avaliável</p>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {evaluation.report.motivoNaoAvaliavel ||
                            "Poucas trocas para avaliar com segurança — treine um pouco mais nessa sessão."}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <section className="grid items-center gap-3 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-background to-background p-4 sm:grid-cols-[210px_1fr] sm:gap-6 sm:p-5">
                        <TrainingGauge
                          value={evaluation.score}
                          label="/ 100"
                          size={205}
                          color={scoreColor(evaluation.score)}
                        />
                        <div className="space-y-3 text-center sm:text-left">
                          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                            <Badge
                              variant={evaluation.score >= 70 ? "default" : "secondary"}
                              className="px-3 py-1 text-sm"
                            >
                              <Sparkles className="mr-1 size-3.5" />
                              {evaluation.classification}
                            </Badge>
                            <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                              Resultado do treinamento
                            </span>
                          </div>
                          <p className="text-sm leading-6 text-foreground/85">
                            {evaluation.report.resumo}
                          </p>
                          {evaluation.hasCriticalError && (
                            <div className="inline-flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-left text-xs font-medium text-destructive">
                              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                              Erro crítico de política identificado; a nota foi limitada a 69.
                            </div>
                          )}
                        </div>
                      </section>
    
                      <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
                        <div className="flex items-center gap-2">
                          <Target className="size-4 text-primary" />
                          <h3 className="text-sm font-semibold">Desempenho por critério</h3>
                        </div>
                        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                          {[
                            { label: "Precisão das informações", value: evaluation.report.notasPorCriterio.precisaoInformacoes, max: 25 },
                            { label: "Entendimento da necessidade", value: evaluation.report.notasPorCriterio.entendimentoNecessidade, max: 20 },
                            { label: "Construção de valor", value: evaluation.report.notasPorCriterio.construcaoValor, max: 20 },
                            { label: "Condução para o próximo passo", value: evaluation.report.notasPorCriterio.conducaoProximoPasso, max: 20 },
                            { label: "Clareza e comunicação", value: evaluation.report.notasPorCriterio.clarezaComunicacao, max: 15 },
                          ].map(({ label, value, max }) => (
                            <div key={label} className="space-y-2">
                              <div className="flex items-start justify-between gap-3 text-xs">
                                <span className="font-medium leading-5 text-foreground/80">{label}</span>
                                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                                  {value}<span className="text-muted-foreground">/{max}</span>
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all duration-700",
                                    value / max >= 0.8
                                      ? "bg-primary"
                                      : value / max >= 0.5
                                        ? "bg-yellow-500"
                                        : "bg-destructive",
                                  )}
                                  style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
    
                      {evaluation.report.errosCriticos.length > 0 && (
                        <section className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 sm:p-5">
                          <div className="mb-3 flex items-center gap-2 text-destructive">
                            <AlertTriangle className="size-4" />
                            <h3 className="text-sm font-semibold">Erros críticos</h3>
                          </div>
                          <ul className="space-y-2 text-sm leading-6 text-foreground/75">
                            {evaluation.report.errosCriticos.map((item, index) => (
                              <li key={index} className="flex gap-2">
                                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-destructive" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
    
                      <div className="grid gap-4 sm:grid-cols-2">
                        <section className="rounded-2xl border border-primary/15 bg-primary/5 p-4 sm:p-5">
                          <div className="mb-3 flex items-center gap-2">
                            <CheckCircle2 className="size-4 text-primary" />
                            <h3 className="text-sm font-semibold">O que você fez bem</h3>
                          </div>
                          <ul className="space-y-2.5 text-sm leading-6 text-foreground/75">
                            {evaluation.report.acertos.map((item, index) => (
                              <li key={index} className="flex gap-2.5">
                                <CheckCircle2 className="mt-1 size-3.5 shrink-0 text-primary" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </section>
    
                        <section className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 sm:p-5">
                          <div className="mb-3 flex items-center gap-2">
                            <Lightbulb className="size-4 text-yellow-600 dark:text-yellow-400" />
                            <h3 className="text-sm font-semibold">Onde melhorar</h3>
                          </div>
                          <ul className="space-y-2.5 text-sm leading-6 text-foreground/75">
                            {evaluation.report.falhas.map((item, index) => (
                              <li key={index} className="flex gap-2.5">
                                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-yellow-500" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      </div>
    
                      <section className="rounded-2xl border border-blue-500/15 bg-blue-500/5 p-4 sm:p-5">
                        <div className="mb-3 flex items-center gap-2">
                          <MessageSquare className="size-4 text-blue-500" />
                          <h3 className="text-sm font-semibold">Uma resposta melhor seria</h3>
                        </div>
                        <blockquote className="border-l-2 border-blue-500/50 pl-4 text-sm italic leading-6 text-foreground/75">
                          “{evaluation.report.exemploRespostaMelhor}”
                        </blockquote>
                      </section>
                    </>
                  )}
    
                  <Button
                    onClick={() => {
                      if (viewingHistoricalFeedback && sessionActive) {
                        returnToActiveTraining();
                        return;
                      }
                      void startSession();
                    }}
                    variant="outline"
                    className="min-h-10 w-full shrink-0 gap-2"
                    disabled={chatLoading}
                  >
                    {chatLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : viewingHistoricalFeedback && sessionActive ? (
                      <ArrowLeft className="size-4" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    {viewingHistoricalFeedback && sessionActive
                      ? "Voltar ao treinamento"
                      : "Treinar novamente"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
    
          {/* Training gauges sidebar */}
          <div className="flex flex-col gap-6 h-full min-h-[400px]">
            <Card className="flex flex-1 flex-col gap-0 overflow-hidden rounded-2xl border-border/60 py-0 shadow-none dark:border-white/10">
              <CardHeader className="border-b border-border/60 px-4 pt-4 [.border-b]:pb-4 dark:border-white/10">
                <CardTitle className="text-sm font-medium text-center">
                  Nota do Treinamento de Hoje
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 items-center justify-center px-4 py-4">
                {loadingRankings ? (
                  <Skeleton className="w-[180px] h-[180px] rounded-full" />
                ) : currentUserTraining.todayScore != null ? (
                  <TrainingGauge
                    value={currentUserTraining.todayScore}
                    label="/ 100"
                    size={190}
                    color={scoreColor(currentUserTraining.todayScore)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Sem nota hoje
                  </p>
                )}
              </CardContent>
            </Card>
    
            <Card className="flex flex-1 flex-col gap-0 overflow-hidden rounded-2xl border-border/60 py-0 shadow-none dark:border-white/10">
              <CardHeader className="border-b border-border/60 px-4 pt-4 [.border-b]:pb-4 dark:border-white/10">
                <CardTitle className="text-sm font-medium text-center">
                  Dias Treinados na Semana
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 items-center justify-center px-4 py-4">
                {loadingRankings ? (
                  <Skeleton className="w-[180px] h-[180px] rounded-full" />
                ) : currentUserTraining.elapsedDays > 0 ? (
                  <TrainingGauge
                    value={Math.round(
                      (currentUserTraining.daysTrained /
                        currentUserTraining.elapsedDays) *
                        100,
                    )}
                    label="% da semana"
                    footer={`${currentUserTraining.daysTrained}/${currentUserTraining.totalDays} dias treinados`}
                    size={190}
                    color="var(--chart-2)"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Sem dados
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
  );
}
