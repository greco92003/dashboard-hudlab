"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Trophy,
  Crown,
  Medal,
  Brain,
  Timer,
  BarChart3,
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
import { cn, formatCurrency } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { Gauge } from "@/components/charts/gauge";
import {
  TrainingChat,
  type TrainingChatMessage,
} from "@/components/sellers-v2/training-chat";

// Types
interface SellerRanking {
  name: string;
  totalSales: number;
  avatarUrl: string | null;
}

interface RecordRanking {
  name: string;
  recordSales: number;
  recordMonth: string;
  avatarUrl: string | null;
}

interface TrainingRanking {
  name: string;
  avgScore: number;
  daysTrained: number;
  totalDays: number;
  trainedWeekdays: number[]; // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
  avatarUrl: string | null;
}

interface CurrentUserTraining {
  todayScore: number | null;
  daysTrained: number;
  totalDays: number;
  elapsedDays: number;
  trainedWeekdays: number[];
}

interface TrainingSessionSnapshot {
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

interface CopilotoReport {
  situacaoAtual: string;
  objetivoProvavelCliente: string;
  sinaisCompra: string[];
  objecoesAbertas: string[];
  informacoesNecessarias: string[];
  proximaAcao: string;
  mensagemSugerida: string;
  evitar: string;
}

interface ActiveNegotiation {
  opportunityId: string;
  contactId: string;
  contactName: string | null;
  stageName: string | null;
  negotiationStartedAt: string | null;
  latestInsight: { report: CopilotoReport; createdAt: string } | null;
}

interface ClosedNegotiation {
  opportunityId: string;
  contactId: string;
  vendedor: string | null;
  outcome: "won" | "lost";
  score: number | null;
  classification: string | null;
  hasCriticalError: boolean;
  report: AuditorReport;
  evaluatedAt: string;
}

interface VendedorRanking {
  vendedor: string;
  avgScore: number;
  count: number;
}

const MONTH_NAMES = [
  "",
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const medalIcons = [
  <Crown key="gold" className="h-5 w-5 text-yellow-500" />,
  <Crown key="silver" className="h-5 w-5 text-gray-400" />,
  <Crown key="bronze" className="h-5 w-5 text-amber-700" />,
];

const SELLERS_TABS = ["rankings", "training", "real"] as const;

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

export default function SellersV2Page() {
  const [{ tab: activeTab, trainingSession: trainingSessionId }, setRouteState] =
    useQueryStates(
      {
        tab: parseAsStringLiteral(SELLERS_TABS).withDefault("rankings"),
        trainingSession: parseAsString,
      },
      { history: "push" },
    );

  const handleTabChange = (value: string) => {
    void setRouteState({ tab: value as (typeof SELLERS_TABS)[number] });
  };

  // Rankings state
  const [currentMonthRanking, setCurrentMonthRanking] = useState<
    SellerRanking[]
  >([]);
  const [recordRanking, setRecordRanking] = useState<RecordRanking[]>([]);
  const [trainingRanking, setTrainingRanking] = useState<TrainingRanking[]>([]);
  const [currentUserTraining, setCurrentUserTraining] =
    useState<CurrentUserTraining>({
      todayScore: null,
      daysTrained: 0,
      totalDays: 0,
      elapsedDays: 0,
      trainedWeekdays: [],
    });
  const [currentMonth, setCurrentMonth] = useState(0);
  const [currentYear, setCurrentYear] = useState(0);
  const [loadingRankings, setLoadingRankings] = useState(true);

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

  // Atendimentos Reais state
  const [activeNegotiations, setActiveNegotiations] = useState<ActiveNegotiation[]>([]);
  const [closedNegotiations, setClosedNegotiations] = useState<ClosedNegotiation[]>([]);
  const [negotiationRanking, setNegotiationRanking] = useState<VendedorRanking[]>([]);
  const [loadingNegotiations, setLoadingNegotiations] = useState(true);
  const [generatingInsightFor, setGeneratingInsightFor] = useState<string | null>(null);
  const [negotiationError, setNegotiationError] = useState<string | null>(null);
  const [expandedClosedId, setExpandedClosedId] = useState<string | null>(null);
  // Purely visual per-card toggle — hides the insight block without deleting
  // anything (history stays in the DB either way). Resets on page reload,
  // same as expandedClosedId above.
  const [hiddenInsightIds, setHiddenInsightIds] = useState<Set<string>>(new Set());

  const toggleInsightVisibility = (opportunityId: string) => {
    setHiddenInsightIds((prev) => {
      const next = new Set(prev);
      if (next.has(opportunityId)) next.delete(opportunityId);
      else next.add(opportunityId);
      return next;
    });
  };

  const fetchNegotiations = useCallback(async () => {
    try {
      const res = await fetch(`/api/sellers-v2/negotiations?_t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch negotiations");
      const data = await res.json();
      setActiveNegotiations(data.active || []);
      setClosedNegotiations(
        (data.closed || []).map((row: any) => ({
          opportunityId: row.opportunity_id,
          contactId: row.contact_id,
          vendedor: row.vendedor,
          outcome: row.outcome,
          score: row.score,
          classification: row.classification,
          hasCriticalError: row.has_critical_error,
          report: row.report,
          evaluatedAt: row.evaluated_at,
        })),
      );
      setNegotiationRanking(data.rankingByVendedor || []);
    } catch (error) {
      console.error("Error fetching negotiations:", error);
    } finally {
      setLoadingNegotiations(false);
    }
  }, []);

  useEffect(() => {
    fetchNegotiations();

    // Reacts to the "emnegociacao" webhook itself (app/api/webhooks/ghl/funnel/route.ts
    // inserts into ghl_funnel_events) instead of polling — a new negotiation
    // shows up the moment the tag fires in GHL, with zero requests in between.
    const supabase = createClient();
    const channel = supabase
      .channel("sellers_v2_negotiations_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ghl_funnel_events",
          filter: "stage_slug=eq.emnegociacao",
        },
        () => {
          fetchNegotiations();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNegotiations]);

  const generateInsight = async (opportunityId: string) => {
    setGeneratingInsightFor(opportunityId);
    setNegotiationError(null);
    try {
      const res = await fetch("/api/sellers-v2/negotiation-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNegotiationError(data.error || "Não foi possível gerar o insight.");
        return;
      }
      await fetchNegotiations();
    } catch (error) {
      console.error("Error generating insight:", error);
      setNegotiationError("Erro de conexão ao gerar insight.");
    } finally {
      setGeneratingInsightFor(null);
    }
  };

  const endingSessionRef = useRef(false);

  // Fetch rankings
  const fetchRankings = useCallback(async () => {
    try {
      const res = await fetch(`/api/sellers-v2/rankings?_t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch rankings");
      const data = await res.json();
      setCurrentMonthRanking(data.currentMonthRanking || []);
      setRecordRanking(data.recordRanking || []);
      setTrainingRanking(data.trainingRanking || []);
      setCurrentUserTraining(
        data.currentUserTraining || {
          todayScore: null,
          daysTrained: 0,
          totalDays: 0,
          elapsedDays: 0,
          trainedWeekdays: [],
        },
      );
      setCurrentMonth(data.currentMonth);
      setCurrentYear(data.currentYear);
    } catch (error) {
      console.error("Error fetching rankings:", error);
    } finally {
      setLoadingRankings(false);
    }
  }, []);

  // Initial fetch + Realtime + Polling
  useEffect(() => {
    fetchRankings();

    // Supabase Realtime subscription
    const supabase = createClient();
    const channel = supabase
      .channel("sellers_v2_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals_cache" },
        () => {
          fetchRankings();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "seller_training_sessions" },
        () => {
          fetchRankings();
        },
      )
      .subscribe();

    // Polling every 30 seconds
    const pollInterval = setInterval(fetchRankings, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [fetchRankings]);

  const applyTrainingSession = useCallback((session: TrainingSessionSnapshot) => {
    const deadline = new Date(session.deadlineAt).getTime();
    setFeedbackHistory(null);
    setViewingHistoricalFeedback(false);
    setChatMessages(session.messages ?? []);
    setSessionDeadlineTime(deadline);
    setSessionActive(session.status === "active" && deadline > Date.now());
    setEvaluating(session.status === "evaluating");
    setEvaluation(session.evaluation);
  }, []);

  useEffect(() => {
    if (activeTab !== "training") return;
    const controller = new AbortController();
    const restore = async () => {
      setRestoringSession(true);
      try {
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
            void setRouteState({ tab: "training", trainingSession: data.session.id });
          }
        } else if (trainingSessionId) {
          void setRouteState({ trainingSession: null });
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
  }, [activeTab, applyTrainingSession, setRouteState, trainingSessionId]);

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
        body: JSON.stringify({ action: "start" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar.");
      applyTrainingSession(data.session);
      await setRouteState({ tab: "training", trainingSession: data.session.id });
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
        await fetchRankings();
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
  }, [applyTrainingSession, fetchRankings, trainingSessionId]);

  return (
    <div className="flex flex-1 flex-col gap-4 sm:gap-6">
      {/* Header */}
      <div>
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
          <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-500" />
          Arena de Vendedores
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Rankings gamificados e treinamento com IA
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rankings" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Rankings</span>
            <span className="sm:hidden">Rank</span>
          </TabsTrigger>
          <TabsTrigger value="training" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Treinamento IA</span>
            <span className="sm:hidden">Treino</span>
          </TabsTrigger>
          <TabsTrigger value="real" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Atendimentos Reais</span>
            <span className="sm:hidden">Reais</span>
          </TabsTrigger>
        </TabsList>

        {/* ======== RANKINGS TAB ======== */}
        <TabsContent value="rankings" className="space-y-6 mt-4">
          {/* Ranking 1: Current Month Sales */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Ranking de Vendas — {MONTH_NAMES[currentMonth]} {currentYear}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRankings ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : currentMonthRanking.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma venda registrada este mês
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">
                        Total Vendido
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentMonthRanking.map((seller, idx) => (
                      <TableRow
                        key={seller.name}
                        className={idx < 3 ? "bg-muted/30" : ""}
                      >
                        <TableCell className="font-bold">
                          {idx < 3 ? medalIcons[idx] : idx + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              {seller.avatarUrl && (
                                <AvatarImage
                                  src={seller.avatarUrl}
                                  alt={seller.name}
                                />
                              )}
                              <AvatarFallback className="text-xs font-medium">
                                {seller.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{seller.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(seller.totalSales, "BRL")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Ranking 2: Annual Record */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Medal className="h-5 w-5 text-amber-500" />
                Recorde de Vendas em Um Mês — {currentYear}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRankings ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : recordRanking.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum recorde registrado
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Mês Recorde
                      </TableHead>
                      <TableHead className="text-right">
                        Valor Recorde
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recordRanking.map((seller, idx) => (
                      <TableRow
                        key={seller.name}
                        className={idx < 3 ? "bg-muted/30" : ""}
                      >
                        <TableCell className="font-bold">
                          {idx < 3 ? medalIcons[idx] : idx + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              {seller.avatarUrl && (
                                <AvatarImage
                                  src={seller.avatarUrl}
                                  alt={seller.name}
                                />
                              )}
                              <AvatarFallback className="text-xs font-medium">
                                {seller.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <span className="font-medium">{seller.name}</span>
                              <span className="sm:hidden block text-xs text-muted-foreground">
                                {seller.recordMonth}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline">{seller.recordMonth}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(seller.recordSales, "BRL")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Ranking 3: Weekly Training */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-500" />
                Ranking de Treinamento — Semana Atual
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRankings ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : trainingRanking.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum treinamento registrado esta semana
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-center hidden sm:table-cell">
                        Dias Treinados
                      </TableHead>
                      <TableHead className="text-right">Nota Média</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trainingRanking.map((seller, idx) => (
                      <TableRow
                        key={seller.name}
                        className={idx < 3 ? "bg-muted/30" : ""}
                      >
                        <TableCell className="font-bold">
                          {idx < 3 ? medalIcons[idx] : idx + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              {seller.avatarUrl && (
                                <AvatarImage
                                  src={seller.avatarUrl}
                                  alt={seller.name}
                                />
                              )}
                              <AvatarFallback className="text-xs font-medium">
                                {seller.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <span className="font-medium">{seller.name}</span>
                              <span className="sm:hidden block text-xs text-muted-foreground">
                                {seller.daysTrained}/{seller.totalDays} dias
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          <div className="flex items-center justify-center gap-1">
                            {[1, 2, 3, 4, 5].map((weekday) => {
                              const trained =
                                seller.trainedWeekdays?.includes(weekday);
                              const elapsed = weekday <= seller.totalDays;
                              return trained ? (
                                <CheckCircle2
                                  key={weekday}
                                  className="h-4 w-4 text-green-500"
                                />
                              ) : elapsed ? (
                                <XCircle
                                  key={weekday}
                                  className="h-4 w-4 text-red-400"
                                />
                              ) : (
                                <div
                                  key={weekday}
                                  className="h-4 w-4 rounded-full border border-muted-foreground/25"
                                />
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={
                              seller.avgScore >= 70 ? "default" : "secondary"
                            }
                          >
                            {seller.avgScore}/100
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Ranking 4: Atendimento Real */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-green-600" />
                Ranking de Atendimento Real
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingNegotiations ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : negotiationRanking.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma negociação avaliada ainda
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-center hidden sm:table-cell">
                        Negociações
                      </TableHead>
                      <TableHead className="text-right">Nota Média</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {negotiationRanking.map((seller, idx) => (
                      <TableRow key={seller.vendedor} className={idx < 3 ? "bg-muted/30" : ""}>
                        <TableCell className="font-bold">
                          {idx < 3 ? medalIcons[idx] : idx + 1}
                        </TableCell>
                        <TableCell className="font-medium">{seller.vendedor}</TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          {seller.count}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={seller.avgScore >= 70 ? "default" : "secondary"}>
                            {seller.avgScore}/100
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======== TRAINING TAB ======== */}
        <TabsContent value="training" className="space-y-6 mt-4">
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
        </TabsContent>

        {/* ======== ATENDIMENTOS REAIS TAB ======== */}
        <TabsContent value="real" className="space-y-6 mt-4">
          {negotiationError && (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-sm font-medium text-destructive flex-1">{negotiationError}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNegotiationError(null)}
                className="text-destructive hover:text-destructive"
              >
                ✕
              </Button>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-500" />
                Em Negociação
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingNegotiations ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : activeNegotiations.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma negociação em andamento
                </p>
              ) : (
                <div className="space-y-4">
                  {activeNegotiations.map((neg) => (
                    <div key={neg.opportunityId} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{neg.contactName || "Contato sem nome"}</p>
                          <p className="text-xs text-muted-foreground">
                            {neg.stageName || "Etapa desconhecida"}
                            {neg.negotiationStartedAt &&
                              ` · em negociação desde ${new Date(neg.negotiationStartedAt).toLocaleDateString("pt-BR")}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {neg.latestInsight && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleInsightVisibility(neg.opportunityId)}
                            >
                              {hiddenInsightIds.has(neg.opportunityId) ? "Mostrar insight" : "Ocultar insight"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => generateInsight(neg.opportunityId)}
                            disabled={generatingInsightFor === neg.opportunityId}
                          >
                            {generatingInsightFor === neg.opportunityId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Gerar Insight"
                            )}
                          </Button>
                        </div>
                      </div>
                      {neg.latestInsight && !hiddenInsightIds.has(neg.opportunityId) && (
                        <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                          <p>
                            <span className="font-medium">Situação:</span>{" "}
                            {neg.latestInsight.report.situacaoAtual}
                          </p>
                          <p>
                            <span className="font-medium">Próxima ação:</span>{" "}
                            {neg.latestInsight.report.proximaAcao}
                          </p>
                          <p>
                            <span className="font-medium">Mensagem sugerida:</span>{" "}
                            {neg.latestInsight.report.mensagemSugerida}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Gerado em{" "}
                            {new Date(neg.latestInsight.createdAt).toLocaleString("pt-BR")}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Fechadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingNegotiations ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : closedNegotiations.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma negociação avaliada ainda
                </p>
              ) : (
                <div className="space-y-3">
                  {closedNegotiations.map((neg) => (
                    <div key={neg.opportunityId} className="rounded-lg border p-4">
                      <button
                        className="flex w-full items-center justify-between text-left cursor-pointer"
                        onClick={() =>
                          setExpandedClosedId(
                            expandedClosedId === neg.opportunityId ? null : neg.opportunityId,
                          )
                        }
                      >
                        <div>
                          <p className="font-medium">{neg.vendedor || "Sem vendedor identificado"}</p>
                          <p className="text-xs text-muted-foreground">
                            {neg.outcome === "won" ? "Venda fechada" : "Negociação perdida"} ·{" "}
                            {new Date(neg.evaluatedAt).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {neg.hasCriticalError && (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          )}
                          {neg.score != null ? (
                            <Badge variant={neg.score >= 70 ? "default" : "secondary"}>
                              {neg.score}/100 · {neg.classification}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Não avaliável</Badge>
                          )}
                        </div>
                      </button>
                      {expandedClosedId === neg.opportunityId && neg.score != null && (
                        <div className="mt-4 space-y-3 text-sm border-t pt-3">
                          <p className="text-muted-foreground">{neg.report.resumo}</p>
                          {neg.report.errosCriticos.length > 0 && (
                            <div>
                              <p className="font-medium text-destructive">Erros críticos</p>
                              <ul className="list-disc list-inside text-muted-foreground">
                                {neg.report.errosCriticos.map((e, i) => (
                                  <li key={i}>{e}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div>
                            <p className="font-medium">Acertos</p>
                            <ul className="list-disc list-inside text-muted-foreground">
                              {neg.report.acertos.map((a, i) => (
                                <li key={i}>{a}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="font-medium">Falhas e oportunidades perdidas</p>
                            <ul className="list-disc list-inside text-muted-foreground">
                              {neg.report.falhas.map((f, i) => (
                                <li key={i}>{f}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="font-medium">Exemplo de resposta melhor</p>
                            <p className="text-muted-foreground">{neg.report.exemploRespostaMelhor}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
