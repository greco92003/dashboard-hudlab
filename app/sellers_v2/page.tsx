"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Bot,
  User,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { IconArrowUp } from "@tabler/icons-react";
import { cn, formatCurrency } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import {
  Label,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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

const TAB_SESSION_KEY = "sellers_v2_active_tab";

export default function SellersV2Page() {
  // Tab persistence — hasMounted prevents rendering Tabs before sessionStorage is read,
  // avoiding a flash of the wrong tab on refresh.
  const [activeTab, setActiveTab] = useState<string>("rankings");
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(TAB_SESSION_KEY);
    if (stored) setActiveTab(stored);
    setHasMounted(true);
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    sessionStorage.setItem(TAB_SESSION_KEY, value);
  };

  // Rankings state
  const [currentMonthRanking, setCurrentMonthRanking] = useState<
    SellerRanking[]
  >([]);
  const [recordRanking, setRecordRanking] = useState<RecordRanking[]>([]);
  const [trainingRanking, setTrainingRanking] = useState<TrainingRanking[]>([]);
  const [currentMonth, setCurrentMonth] = useState(0);
  const [currentYear, setCurrentYear] = useState(0);
  const [loadingRankings, setLoadingRankings] = useState(true);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(900);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<{
    score: number;
    feedback: string;
    breakdown?: {
      rapport: number;
      objections: number;
      techniques: number;
      product: number;
      closing: number;
      professionalism: number;
    };
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to always have the latest chatMessages in stale closures (e.g. timer)
  const chatMessagesRef = useRef<ChatMessage[]>([]);

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

  // Keep ref in sync with latest chatMessages (fixes stale closure in timer)
  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Timer countdown
  useEffect(() => {
    if (!sessionActive || !sessionStartTime) return;
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      const remaining = Math.max(900 - elapsed, 0);
      setTimeLeft(remaining);
      if (remaining <= 0) {
        endSession();
      }
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionActive, sessionStartTime]);

  // Start training session
  const startSession = () => {
    setSessionActive(true);
    setSessionStartTime(Date.now());
    setTimeLeft(900);
    setChatMessages([]);
    setEvaluation(null);
    // Send initial message from "client"
    sendBotGreeting();
  };

  // These are the SELLER's opening messages — the model (AI customer) responds to them
  const GREETING_OPENERS = [
    "Oi! Obrigado por entrar em contato com a HUDLAB. Você tem interesse nos nossos chinelos personalizados?",
    "Olá! Tudo bem? Vi que você se interessou pelos nossos chinelos personalizados. Posso te ajudar?",
    "Oi! Boa tarde! Seja bem-vindo à HUDLAB. Como posso te ajudar hoje?",
    "Olá! Que bom ter você aqui. Você tá buscando um chinelo personalizado?",
    "Oi! Seja bem-vindo à HUDLAB! Você viu nosso anúncio de chinelos personalizados?",
  ];

  const sendBotGreeting = async () => {
    setChatLoading(true);
    setChatError(null);
    const opener =
      GREETING_OPENERS[Math.floor(Math.random() * GREETING_OPENERS.length)];
    try {
      const res = await fetch("/api/sellers-v2/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          messages: [
            {
              role: "user",
              content: opener,
            },
          ],
        }),
      });
      const data = await res.json();
      if (data.code === "QUOTA_EXCEEDED" || res.status === 429) {
        setChatError(data.error || "Cota da API de IA excedida.");
        setSessionActive(false);
        return;
      }
      if (data.success) {
        setChatMessages([{ role: "assistant", content: data.response }]);
      }
    } catch (error) {
      console.error("Error starting session:", error);
      setChatError("Erro de conexão. Tente novamente.");
    } finally {
      setChatLoading(false);
    }
  };

  // Send chat message
  const sendMessage = async () => {
    if (!chatInput.trim() || chatLoading || !sessionActive) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
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
          messages: updatedMessages,
        }),
      });
      const data = await res.json();
      if (data.code === "QUOTA_EXCEEDED" || res.status === 429) {
        setChatError(data.error || "Cota da API de IA excedida.");
        return;
      }
      if (data.success) {
        setChatMessages([
          ...updatedMessages,
          { role: "assistant", content: data.response },
        ]);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setChatError("Erro de conexão. Tente novamente.");
    } finally {
      setChatLoading(false);
    }
  };

  // End session and get evaluation
  const endSession = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSessionActive(false);
    setEvaluating(true);
    setChatError(null);

    try {
      const currentMessages = chatMessagesRef.current;

      // If conversation is too short, show a fallback evaluation instead of erroring
      if (!currentMessages || currentMessages.length < 2) {
        setEvaluation({
          score: 0,
          feedback:
            "A sessão foi muito curta para avaliar. Inicie uma nova sessão e tente conversar mais com o cliente.",
        });
        return;
      }

      const res = await fetch("/api/sellers-v2/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "evaluate",
          messages: currentMessages,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEvaluation(data.evaluation);
        // Refresh rankings to include new training
        fetchRankings();
      } else {
        // API returned an error — show a fallback so the UI doesn't get stuck
        setEvaluation({
          score: 0,
          feedback:
            data.error ||
            "Não foi possível gerar a avaliação. Tente novamente.",
        });
      }
    } catch (error) {
      console.error("Error evaluating:", error);
      setEvaluation({
        score: 0,
        feedback: "Erro de conexão ao avaliar a sessão. Tente novamente.",
      });
    } finally {
      setEvaluating(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

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

      {!hasMounted ? (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : null}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className={hasMounted ? "w-full" : "invisible h-0 overflow-hidden"}
      >
        <TabsList className="grid w-full grid-cols-2">
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
        </TabsContent>

        {/* ======== TRAINING TAB ======== */}
        <TabsContent value="training" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[650px] lg:grid-rows-1">
            {/* Chat Area */}
            <Card className="lg:col-span-2 flex flex-col h-full min-h-[400px]">
              <CardHeader className="pb-3 shrink-0">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-blue-500" />
                  Simulador de Vendas
                  {sessionActive && (
                    <Badge
                      variant="destructive"
                      className="ml-auto flex items-center gap-1"
                    >
                      <Timer className="h-3 w-3" />
                      {formatTime(timeLeft)}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden flex flex-col min-h-0 pt-0">
                {/* Error Alert */}
                {chatError && (
                  <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 mb-4">
                    <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-destructive">
                        {chatError}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setChatError(null)}
                      className="text-destructive hover:text-destructive"
                    >
                      ✕
                    </Button>
                  </div>
                )}

                {!sessionActive &&
                  !evaluating &&
                  !evaluation &&
                  !chatError &&
                  chatMessages.length === 0 && (
                    <div className="flex flex-col flex-1 items-center justify-center space-y-4">
                      <Bot className="h-16 w-16 text-muted-foreground/50" />
                      <h3 className="text-lg font-semibold">
                        Treinamento com IA
                      </h3>
                      <p className="text-sm text-muted-foreground text-center max-w-md">
                        Simule uma conversa com um cliente difícil. Você terá 15
                        minutos para convencê-lo. Ao final, receberá uma nota de
                        0 a 100.
                      </p>
                      <Button onClick={startSession}>
                        Iniciar Treinamento
                      </Button>
                    </div>
                  )}

                {(sessionActive || chatMessages.length > 0) &&
                  !evaluating &&
                  !evaluation && (
                    <div className="flex flex-col flex-1 min-h-0">
                      {/* Messages Area */}
                      <ScrollArea className="flex-1 min-h-0 pr-4">
                        <div className="space-y-4 pb-4">
                          {chatMessages.map((msg, idx) => (
                            <div
                              key={idx}
                              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                              {msg.role === "assistant" && (
                                <Avatar className="h-8 w-8 shrink-0">
                                  <AvatarFallback className="bg-red-100 text-red-700 text-xs">
                                    <Bot className="h-4 w-4" />
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <div
                                className={cn(
                                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                                  msg.role === "user"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted",
                                )}
                              >
                                {msg.content}
                              </div>
                              {msg.role === "user" && (
                                <Avatar className="h-8 w-8 shrink-0">
                                  <AvatarFallback className="bg-blue-100 text-blue-700 text-xs">
                                    <User className="h-4 w-4" />
                                  </AvatarFallback>
                                </Avatar>
                              )}
                            </div>
                          ))}
                          {chatLoading && (
                            <div className="flex gap-3 justify-start">
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarFallback className="bg-red-100 text-red-700 text-xs">
                                  <Bot className="h-4 w-4" />
                                </AvatarFallback>
                              </Avatar>
                              <div className="bg-muted rounded-2xl px-4 py-2.5 text-sm">
                                <div className="flex items-center gap-1.5">
                                  <span className="animate-bounce [animation-delay:-0.3s]">
                                    ●
                                  </span>
                                  <span className="animate-bounce [animation-delay:-0.15s]">
                                    ●
                                  </span>
                                  <span className="animate-bounce">●</span>
                                </div>
                              </div>
                            </div>
                          )}
                          <div ref={messagesEndRef} />
                        </div>
                      </ScrollArea>

                      {/* ai-02 Style Input Area */}
                      <div className="pt-3 border-t shrink-0">
                        <div className="flex min-h-[56px] flex-col rounded-2xl cursor-text bg-card border border-border shadow-sm">
                          <div className="flex-1 relative overflow-y-auto max-h-[120px]">
                            <Textarea
                              ref={chatInputRef}
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  sendMessage();
                                }
                              }}
                              placeholder="Digite sua resposta..."
                              disabled={!sessionActive || chatLoading}
                              className="w-full border-0 p-3 transition-[padding] duration-200 ease-in-out min-h-[44px] outline-none text-sm text-foreground resize-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent! whitespace-pre-wrap break-words"
                            />
                          </div>
                          <div className="flex min-h-[40px] items-center gap-2 p-2 pb-1">
                            <Button
                              onClick={endSession}
                              variant="ghost"
                              size="sm"
                              disabled={!sessionActive || evaluating}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs"
                            >
                              Finalizar
                            </Button>
                            <div className="ml-auto">
                              <Button
                                onClick={sendMessage}
                                disabled={
                                  !sessionActive ||
                                  chatLoading ||
                                  !chatInput.trim()
                                }
                                size="icon"
                                className={cn(
                                  "rounded-full h-8 w-8 transition-colors duration-100 ease-out cursor-pointer",
                                  chatInput.trim()
                                    ? "bg-primary hover:bg-primary/90"
                                    : "bg-muted",
                                )}
                              >
                                <IconArrowUp
                                  className={cn(
                                    "h-4 w-4",
                                    chatInput.trim()
                                      ? "text-primary-foreground"
                                      : "text-muted-foreground",
                                  )}
                                />
                              </Button>
                            </div>
                          </div>
                        </div>
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

                {evaluation && (
                  <div className="flex flex-col flex-1 overflow-y-auto px-1 py-4 space-y-4">
                    {/* Score header */}
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className={`text-5xl font-bold ${
                          evaluation.score >= 80
                            ? "text-green-500"
                            : evaluation.score >= 60
                              ? "text-yellow-500"
                              : evaluation.score >= 40
                                ? "text-orange-500"
                                : "text-red-500"
                        }`}
                      >
                        {evaluation.score}/100
                      </div>
                      <Badge
                        variant={
                          evaluation.score >= 70 ? "default" : "secondary"
                        }
                        className="text-sm"
                      >
                        {evaluation.score >= 80
                          ? "Excelente! 🌟"
                          : evaluation.score >= 60
                            ? "Bom trabalho! 👍"
                            : evaluation.score >= 40
                              ? "Pode melhorar 💪"
                              : "Precisa praticar mais 📚"}
                      </Badge>
                    </div>

                    {/* Breakdown by criteria */}
                    {evaluation.breakdown && (
                      <div className="w-full space-y-2">
                        {[
                          {
                            label: "Rapport e empatia",
                            value: evaluation.breakdown.rapport,
                            max: 15,
                          },
                          {
                            label: "Tratamento de objeções",
                            value: evaluation.breakdown.objections,
                            max: 25,
                          },
                          {
                            label: "Técnicas de venda",
                            value: evaluation.breakdown.techniques,
                            max: 20,
                          },
                          {
                            label: "Conhecimento do produto",
                            value: evaluation.breakdown.product,
                            max: 15,
                          },
                          {
                            label: "Fechamento",
                            value: evaluation.breakdown.closing,
                            max: 15,
                          },
                          {
                            label: "Profissionalismo",
                            value: evaluation.breakdown.professionalism,
                            max: 10,
                          },
                        ].map(({ label, value, max }) => (
                          <div key={label} className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{label}</span>
                              <span className="font-medium">
                                {value}/{max}
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  value / max >= 0.8
                                    ? "bg-green-500"
                                    : value / max >= 0.5
                                      ? "bg-yellow-500"
                                      : "bg-red-500"
                                }`}
                                style={{ width: `${(value / max) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Feedback text — renders **bold** markdown */}
                    <div className="text-sm text-muted-foreground leading-relaxed space-y-1">
                      {evaluation.feedback.split("\n").map((line, i) => {
                        const parts = line.split(/\*\*(.+?)\*\*/g);
                        return (
                          <p key={i}>
                            {parts.map((part, j) =>
                              j % 2 === 1 ? (
                                <strong
                                  key={j}
                                  className="text-foreground font-semibold"
                                >
                                  {part}
                                </strong>
                              ) : (
                                part
                              ),
                            )}
                          </p>
                        );
                      })}
                    </div>

                    <Button
                      onClick={() => {
                        setEvaluation(null);
                        setChatMessages([]);
                      }}
                      variant="outline"
                      className="w-full"
                    >
                      Treinar Novamente
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Radial Charts Sidebar */}
            <div className="flex flex-col gap-6 h-full min-h-[400px]">
              {/* Chart 1: Average Score */}
              <Card className="flex flex-col flex-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-center">
                    Nota Média em Treinamentos
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 items-center justify-center pb-4">
                  {loadingRankings ? (
                    <Skeleton className="w-[180px] h-[180px] rounded-full" />
                  ) : trainingRanking.length > 0 ? (
                    (() => {
                      const avgAll = Math.round(
                        trainingRanking.reduce(
                          (sum, s) => sum + s.avgScore,
                          0,
                        ) / trainingRanking.length,
                      );
                      const scoreConfig: ChartConfig = {
                        score: { label: "Nota", color: "var(--chart-1)" },
                      };
                      return (
                        <ChartContainer
                          config={scoreConfig}
                          className="w-[180px] h-[180px]"
                        >
                          <RadialBarChart
                            data={[
                              { score: avgAll, fill: "var(--color-score)" },
                            ]}
                            startAngle={0}
                            endAngle={(avgAll / 100) * 360}
                            innerRadius={80}
                            outerRadius={110}
                          >
                            <PolarGrid
                              gridType="circle"
                              radialLines={false}
                              stroke="none"
                              className="first:fill-muted last:fill-background"
                              polarRadius={[86, 74]}
                            />
                            <RadialBar
                              dataKey="score"
                              background
                              cornerRadius={10}
                              isAnimationActive={false}
                            />
                            <PolarRadiusAxis
                              tick={false}
                              tickLine={false}
                              axisLine={false}
                            >
                              <Label
                                content={({ viewBox }) => {
                                  if (
                                    viewBox &&
                                    "cx" in viewBox &&
                                    "cy" in viewBox
                                  ) {
                                    return (
                                      <text
                                        x={viewBox.cx}
                                        y={viewBox.cy}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                      >
                                        <tspan
                                          x={viewBox.cx}
                                          y={viewBox.cy}
                                          className="fill-foreground text-4xl font-bold"
                                        >
                                          {avgAll}
                                        </tspan>
                                        <tspan
                                          x={viewBox.cx}
                                          y={(viewBox.cy || 0) + 24}
                                          className="fill-muted-foreground"
                                        >
                                          / 100
                                        </tspan>
                                      </text>
                                    );
                                  }
                                }}
                              />
                            </PolarRadiusAxis>
                          </RadialBarChart>
                        </ChartContainer>
                      );
                    })()
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      Sem dados
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Chart 2: Training Consistency */}
              <Card className="flex flex-col flex-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-center">
                    Aproveitamento de Dias Treinados
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 items-center justify-center pb-4">
                  {loadingRankings ? (
                    <Skeleton className="w-[180px] h-[180px] rounded-full" />
                  ) : trainingRanking.length > 0 ? (
                    (() => {
                      const totalDaysTrained = trainingRanking.reduce(
                        (sum, s) => sum + s.daysTrained,
                        0,
                      );
                      const totalPossibleDays = trainingRanking.reduce(
                        (sum, s) => sum + s.totalDays,
                        0,
                      );
                      const consistency =
                        totalPossibleDays > 0
                          ? Math.round(
                              (totalDaysTrained / totalPossibleDays) * 100,
                            )
                          : 0;
                      const daysConfig: ChartConfig = {
                        days: {
                          label: "Aproveitamento",
                          color: "var(--chart-2)",
                        },
                      };
                      return (
                        <ChartContainer
                          config={daysConfig}
                          className="w-[180px] h-[180px]"
                        >
                          <RadialBarChart
                            data={[
                              { days: consistency, fill: "var(--color-days)" },
                            ]}
                            startAngle={0}
                            endAngle={(consistency / 100) * 360}
                            innerRadius={80}
                            outerRadius={110}
                          >
                            <PolarGrid
                              gridType="circle"
                              radialLines={false}
                              stroke="none"
                              className="first:fill-muted last:fill-background"
                              polarRadius={[86, 74]}
                            />
                            <RadialBar
                              dataKey="days"
                              background
                              cornerRadius={10}
                              isAnimationActive={false}
                            />
                            <PolarRadiusAxis
                              tick={false}
                              tickLine={false}
                              axisLine={false}
                            >
                              <Label
                                content={({ viewBox }) => {
                                  if (
                                    viewBox &&
                                    "cx" in viewBox &&
                                    "cy" in viewBox
                                  ) {
                                    return (
                                      <text
                                        x={viewBox.cx}
                                        y={viewBox.cy}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                      >
                                        <tspan
                                          x={viewBox.cx}
                                          y={viewBox.cy}
                                          className="fill-foreground text-4xl font-bold"
                                        >
                                          {consistency}%
                                        </tspan>
                                        <tspan
                                          x={viewBox.cx}
                                          y={(viewBox.cy || 0) + 24}
                                          className="fill-muted-foreground"
                                        >
                                          {totalDaysTrained}/{totalPossibleDays}{" "}
                                          dias
                                        </tspan>
                                      </text>
                                    );
                                  }
                                }}
                              />
                            </PolarRadiusAxis>
                          </RadialBarChart>
                        </ChartContainer>
                      );
                    })()
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
      </Tabs>
    </div>
  );
}
