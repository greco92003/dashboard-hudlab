"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, BarChart3, Sparkles, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArenaHome, XpBar, type ArenaData } from "@/components/sellers-v2/arena-home";
import { GestorView } from "@/components/sellers-v2/gestor-view";
import { TrainingPanel, type TrainingSessionSnapshot } from "@/components/sellers-v2/training-panel";
import { VsCami } from "@/components/sellers-v2/vs-cami";
import { usePermissions } from "@/hooks/usePermissions";
import { createClient } from "@/utils/supabase/client";

const VIEWS = ["arena", "treino", "gestor"] as const;
const CONFETTI_COLORS = ["var(--primary)", "#f59e0b", "#6ee7b7", "#fcd34d", "#a3e635"];

/** Confete para subida de nível e conquista nova. Nada aparece para quem pediu menos movimento. */
function Confetti() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <motion.span
          key={i}
          className="absolute top-0 block rounded-sm"
          style={{
            left: `${(i * 37) % 100}%`,
            width: 6 + (i % 4) * 2,
            height: (6 + (i % 4) * 2) * 1.6,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          }}
          initial={{ y: -40, rotate: 0, opacity: 0 }}
          animate={{ y: "105vh", rotate: 540, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.6, delay: (i % 9) * 0.12, ease: [0.3, 0.6, 0.4, 1] }}
        />
      ))}
    </div>
  );
}

export default function SellersV2Page() {
  const [{ view, trainingSession, missao }, setRoute] = useQueryStates(
    {
      view: parseAsStringLiteral(VIEWS).withDefault("arena"),
      trainingSession: parseAsString,
      missao: parseAsString,
    },
    { history: "push" },
  );
  const { isOwner } = usePermissions();
  const inTraining = view === "treino" || !!trainingSession;

  const [data, setData] = useState<ArenaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [current, setCurrent] = useState<TrainingSessionSnapshot | null>(null);
  const levelBefore = useRef<number | null>(null);
  const celebrated = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sellers-v2/rankings", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao carregar a Arena");
      setData(json);
      return json as ArenaData;
    } catch (error) {
      console.error("Arena:", error);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data: auth }) => setMyId(auth.user?.id ?? null));
    // Treino de qualquer pessoa terminado: o ranking atualiza sem recarregar a página.
    const channel = supabase
      .channel("arena_training_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "seller_training_sessions" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  // Conquista nova: comemora uma vez (o servidor só marca como nova na primeira leitura).
  useEffect(() => {
    const novas = (data?.conquistas ?? []).filter((c) => c.nova && !celebrated.current.has(c.id));
    if (!novas.length) return;
    novas.forEach((c) => {
      celebrated.current.add(c.id);
      toast.success(`Conquista desbloqueada: ${c.titulo}`, { description: c.descricao });
    });
    setCelebrate(novas[0].titulo);
    const t = window.setTimeout(() => setCelebrate(null), 4000);
    return () => window.clearTimeout(t);
  }, [data?.conquistas]);

  const setTrainingSession = useCallback(
    (id: string | null) => {
      void setRoute({ view: "treino", trainingSession: id });
    },
    [setRoute],
  );

  const onSessionEnded = useCallback(async () => {
    levelBefore.current = data?.me.nivel.index ?? null;
    const fresh = await load();
    if (fresh && levelBefore.current != null && fresh.me.nivel.index > levelBefore.current) {
      setCelebrate(`Você subiu para ${fresh.me.nivel.name}!`);
      window.setTimeout(() => setCelebrate(null), 4000);
    }
  }, [data?.me.nivel.index, load]);

  const onSessionChange = useCallback((session: TrainingSessionSnapshot | null) => setCurrent(session), []);

  const goTrain = (missionId?: string) => {
    // Treino em andamento tem prioridade: continua ele.
    if (data?.me.treinoAtivoId) {
      void setRoute({ view: "treino", trainingSession: data.me.treinoAtivoId, missao: null });
      return;
    }
    setCurrent(null);
    void setRoute({ view: "treino", trainingSession: null, missao: missionId ?? null });
  };
  const goArena = () => {
    setCurrent(null);
    void setRoute({ view: null, trainingSession: null, missao: null });
  };

  const sessionXp = trainingSession ? data?.me.xpPorTreino[trainingSession] : undefined;
  const missionId = current?.missionId ?? (missao && missao !== "livre" ? missao : null);
  const mission = missionId ? data?.missoes.find((m) => m.id === missionId) : undefined;
  const completed = current && current.status === "completed" && current.evaluation && trainingSession === current.id;

  return (
    <div className="flex flex-1 flex-col gap-4 sm:gap-6">
      {celebrate && <Confetti />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/20">
            <Trophy className="h-6 w-6 text-amber-950" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Arena de Vendedores</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {data
                ? `Temporada ${data.temporada.numero} · ${data.temporada.mes} · termina em ${data.temporada.diasRestantes} ${data.temporada.diasRestantes === 1 ? "dia" : "dias"}`
                : "Treino com IA, XP e ranking da temporada"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwner && view !== "gestor" && !inTraining && (
            <Button variant="outline" onClick={() => void setRoute({ view: "gestor" })} className="gap-2">
              <BarChart3 className="h-4 w-4" /> Visão do gestor
            </Button>
          )}
          {(inTraining || view === "gestor") && (
            <Button variant="outline" onClick={goArena} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar à Arena
            </Button>
          )}
        </div>
      </div>

      {view === "gestor" && isOwner ? (
        <GestorView />
      ) : inTraining ? (
        <div className="space-y-4">
          {mission && (
            <Card className={mission.desafio ? "border-amber-500/40" : "border-primary/30"}>
              <CardContent className="flex flex-wrap items-start gap-x-6 gap-y-2 p-4">
                <div className="min-w-56 flex-1">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
                    {mission.desafio ? "Desafio da semana · " : ""}Missão {String(mission.ordem).padStart(2, "0")}{" "}
                    <span className="text-amber-500">{"★".repeat(mission.dificuldade)}</span>
                  </p>
                  <h2 className="text-lg font-extrabold">{mission.titulo}</h2>
                  <p className="text-sm text-muted-foreground">{mission.resumo}</p>
                </div>
                <p className="flex max-w-xl items-start gap-2 text-sm">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    <strong>Seu objetivo:</strong> {mission.objetivo}
                  </span>
                </p>
              </CardContent>
            </Card>
          )}

          {sessionXp != null && data && (
            <Card className="border-primary/40 bg-gradient-to-r from-primary/15 via-card to-card py-0">
              <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
                <span className="flex items-center gap-2 text-3xl font-extrabold text-primary">
                  <Sparkles className="h-6 w-6" /> +{sessionXp} XP
                </span>
                <div className="min-w-48 flex-1 space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {celebrate?.startsWith("Você subiu") ? (
                      <strong className="text-foreground">{celebrate}</strong>
                    ) : data.me.nivel.nextName ? (
                      <>
                        {data.me.nivel.name} · faltam {(data.me.nivel.nextMinXp ?? 0) - data.me.totalXp} XP para {data.me.nivel.nextName}
                      </>
                    ) : (
                      "Nível máximo"
                    )}
                  </p>
                  <XpBar pct={data.me.nivel.progressPct} className="h-2" />
                </div>
                <Button onClick={goArena} variant="secondary">
                  Ver o ranking
                </Button>
              </CardContent>
            </Card>
          )}

          <TrainingPanel
            currentUserTraining={
              data?.currentUserTraining ?? { todayScore: null, daysTrained: 0, totalDays: 5, elapsedDays: 1, trainedWeekdays: [] }
            }
            loadingRankings={loading}
            trainingSessionId={trainingSession}
            setTrainingSession={setTrainingSession}
            onSessionEnded={onSessionEnded}
            missionId={missao && missao !== "livre" ? missao : null}
            onSessionChange={onSessionChange}
          />

          {completed && <VsCami key={current.id} sessionId={current.id} initial={current.comparacaoCami ?? null} />}
        </div>
      ) : (
        <ArenaHome data={data} loading={loading} myId={myId} onTrain={goTrain} />
      )}
    </div>
  );
}
