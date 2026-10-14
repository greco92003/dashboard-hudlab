"use client";

import { motion, useReducedMotion } from "motion/react";
import { Crown, Flame, Lock, Play, Sparkles, Trophy, Zap } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LevelInfo } from "@/lib/sellers-v2/progression";
import { LEVELS } from "@/lib/sellers-v2/progression";
import type { CurrentUserTraining } from "./training-panel";

export interface ArenaRankingItem {
  posicao: number;
  userId: string;
  nome: string;
  avatarUrl: string | null;
  seasonXp: number;
  nivel: string;
  mediaNota: number | null;
  treinos: number;
  sequencia: number;
}

export interface ArenaData {
  temporada: { numero: number; mes: string; diasRestantes: number };
  me: {
    nome: string;
    avatarUrl: string | null;
    bloqueado: boolean;
    totalXp: number;
    seasonXp: number;
    nivel: LevelInfo;
    sequencia: number;
    treinouHoje: boolean;
    diasDaSemana: number[];
    mediaNota: number | null;
    posicao: number | null;
    treinoAtivoId: string | null;
    xpPorTreino: Record<string, number>;
  };
  ranking: ArenaRankingItem[];
  currentUserTraining: CurrentUserTraining;
}

const fmtXp = (n: number) => n.toLocaleString("pt-BR");
const initial = (nome: string) => nome.trim().charAt(0).toUpperCase() || "?";
const firstName = (nome: string) => nome.trim().split(/\s+/)[0];
const WEEK = ["Seg", "Ter", "Qua", "Qui", "Sex"];

/** Barra de XP que enche ao aparecer (sem animação para quem pediu menos movimento). */
export function XpBar({ pct, className }: { pct: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div
      className={cn("h-3 rounded-full bg-muted overflow-hidden border border-border/60", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="Progresso no nível"
    >
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-primary to-emerald-300"
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }}
      />
    </div>
  );
}

function PlayerCard({ data, onTrain }: { data: ArenaData; onTrain: () => void }) {
  const { me, ranking } = data;
  const lider = ranking[0];
  const minha = ranking.find((r) => r.posicao === me.posicao);
  const atras = me.posicao && me.posicao > 1 && lider && minha ? lider.seasonXp - minha.seasonXp : null;
  const ring = `conic-gradient(var(--primary) 0 ${me.nivel.progressPct}%, var(--muted) ${me.nivel.progressPct}% 100%)`;

  return (
    <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card py-0 lg:col-span-2">
      <CardContent className="p-5 sm:p-7 space-y-6">
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative shrink-0">
            <div className="h-20 w-20 rounded-full p-[5px]" style={{ background: ring }}>
              <Avatar className="h-full w-full border-2 border-card">
                {me.avatarUrl && <AvatarImage src={me.avatarUrl} alt={me.nome} />}
                <AvatarFallback className="text-2xl font-extrabold">{initial(me.nome)}</AvatarFallback>
              </Avatar>
            </div>
            <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-card bg-primary px-2 py-0.5 text-xs font-extrabold text-primary-foreground">
              Nv {me.nivel.index + 1}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Olá, {firstName(me.nome)}</p>
            <h2 className="text-3xl font-extrabold tracking-tight">{me.nivel.name}</h2>
            <p className="text-sm text-muted-foreground">
              {me.nivel.nextName ? (
                <>
                  Faltam <strong className="text-primary">{fmtXp((me.nivel.nextMinXp ?? 0) - me.totalXp)} XP</strong> para{" "}
                  {me.nivel.nextName}
                </>
              ) : (
                "Nível máximo. Lenda da Arena."
              )}
            </p>
          </div>
          <Button
            size="lg"
            onClick={onTrain}
            disabled={me.bloqueado}
            className="h-12 gap-2 px-6 text-base font-bold shadow-lg shadow-primary/25"
          >
            {me.bloqueado ? <Lock className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
            {me.treinoAtivoId ? "Continuar treino" : "Treinar agora"}
          </Button>
        </div>

        {me.bloqueado && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            Esta conta não treina na Arena: entre com a sua conta pessoal para o treino contar para você.
          </p>
        )}

        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{fmtXp(me.totalXp)}</strong>
              {me.nivel.nextMinXp != null && ` / ${fmtXp(me.nivel.nextMinXp)}`} XP
            </span>
            <span>
              {me.nivel.name}
              {me.nivel.nextName && ` → ${me.nivel.nextName}`}
            </span>
          </div>
          <XpBar pct={me.nivel.progressPct} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-background/60 p-4 space-y-1">
            <span className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
              <Flame className="h-4 w-4" /> Sequência
            </span>
            <p className="text-2xl font-extrabold">
              {me.sequencia} {me.sequencia === 1 ? "dia" : "dias"}
            </p>
            <p className="text-xs text-muted-foreground">
              {me.treinouHoje ? "Hoje já contou. Volte amanhã!" : "Treine hoje para não perder"}
            </p>
          </div>
          <div className="rounded-xl border bg-background/60 p-4 space-y-2">
            <span className="text-sm font-semibold text-muted-foreground">Meta da semana · {me.diasDaSemana.length}/5</span>
            <div className="flex gap-1.5">
              {WEEK.map((label, i) => {
                const done = me.diasDaSemana.includes(i + 1);
                return (
                  <div key={label} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className={cn(
                        "h-7 w-7 rounded-full",
                        done ? "bg-primary" : "border-2 border-dashed border-amber-500/70",
                      )}
                      aria-label={`${label}: ${done ? "treinou" : "não treinou"}`}
                    />
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border bg-background/60 p-4 space-y-1">
            <span className="text-sm font-semibold text-muted-foreground">Posição na temporada</span>
            <p className="text-2xl font-extrabold">{me.posicao ? `${me.posicao}º lugar` : "—"}</p>
            <p className="text-xs text-muted-foreground">
              {me.posicao == null
                ? "Treine para entrar no ranking"
                : me.posicao === 1
                  ? "Você lidera a temporada"
                  : atras != null
                    ? `${fmtXp(atras)} XP atrás de ${firstName(lider.nome)}`
                    : ""}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const MEDAL = [
  { ring: "ring-amber-400", block: "from-amber-400/35 to-amber-400/5 border-amber-400/50", text: "text-amber-500", h: "h-36" },
  { ring: "ring-slate-300", block: "from-slate-300/35 to-slate-300/5 border-slate-300/50", text: "text-slate-400", h: "h-28" },
  { ring: "ring-orange-400", block: "from-orange-400/35 to-orange-400/5 border-orange-400/50", text: "text-orange-500", h: "h-20" },
];

function Podium({ ranking, myId }: { ranking: ArenaRankingItem[]; myId: string | null }) {
  const reduce = useReducedMotion();
  const top = ranking.slice(0, 3);
  const order = [1, 0, 2].filter((i) => top[i]);
  return (
    <div className="grid grid-cols-3 items-end gap-3">
      {order.map((i, k) => {
        const p = top[i];
        const m = MEDAL[i];
        return (
          <motion.div
            key={p.userId}
            className="flex flex-col items-center gap-2"
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * k, duration: 0.5 }}
          >
            {i === 0 && <Crown className="h-6 w-6 text-amber-500" aria-hidden="true" />}
            <Avatar className={cn("ring-4 ring-offset-2 ring-offset-card", m.ring, i === 0 ? "h-16 w-16" : "h-12 w-12")}>
              {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt={p.nome} />}
              <AvatarFallback className="font-bold">{initial(p.nome)}</AvatarFallback>
            </Avatar>
            <div className="text-center">
              <p className={cn("text-sm font-bold", p.userId === myId && "text-primary")}>{firstName(p.nome)}</p>
              <p className="text-xs text-muted-foreground">{fmtXp(p.seasonXp)} XP</p>
            </div>
            <div className={cn("w-full rounded-t-xl border bg-gradient-to-b pt-2 text-center text-2xl font-extrabold", m.block, m.text, m.h)}>
              {i + 1}º
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function RankingCard({ data, myId }: { data: ArenaData; myId: string | null }) {
  const rest = data.ranking.slice(3);
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg">
          <span className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" /> Ranking da temporada
          </span>
          <span className="text-sm font-normal text-muted-foreground">XP ganho em {data.temporada.mes.toLowerCase()}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {data.ranking.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-primary" />
            <p className="font-semibold">Ninguém treinou nesta temporada ainda</p>
            <p className="text-sm text-muted-foreground">O primeiro treino já coloca você no topo do pódio.</p>
          </div>
        ) : (
          <>
            <Podium ranking={data.ranking} myId={myId} />
            {rest.length > 0 && (
              <ol className="space-y-1.5">
                {rest.map((r) => (
                  <li
                    key={r.userId}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2",
                      r.userId === myId ? "border-primary/50 bg-primary/5" : "border-transparent",
                    )}
                  >
                    <span className="w-7 font-bold text-muted-foreground">{r.posicao}º</span>
                    <Avatar className="h-8 w-8">
                      {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt={r.nome} />}
                      <AvatarFallback className="text-xs font-bold">{initial(r.nome)}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 font-medium">{firstName(r.nome)}</span>
                    <span className="hidden sm:inline text-xs text-muted-foreground">
                      {r.nivel} · média {r.mediaNota ?? "—"}
                    </span>
                    <strong className="min-w-20 text-right tabular-nums">{fmtXp(r.seasonXp)} XP</strong>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LevelsCard({ totalXp }: { totalXp: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Níveis</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {[...LEVELS].reverse().map((l) => {
            const reached = totalXp >= l.minXp;
            return (
              <li
                key={l.name}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                  reached ? "bg-primary/10 font-semibold" : "text-muted-foreground",
                )}
              >
                <span className="flex items-center gap-2">
                  {reached ? <Zap className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4" />}
                  {l.name}
                </span>
                <span className="tabular-nums">{fmtXp(l.minXp)} XP</span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function XpRulesCard() {
  const rules = [
    ["Nota do treino", "a nota vira XP (até 100)"],
    ["Nota 90 ou mais", "+25 XP"],
    ["Primeira vez numa missão", "+20 XP"],
    ["Dias seguidos treinando", "+10 por dia, até +50"],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Como ganhar XP</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="space-y-2">
          {rules.map(([what, gain]) => (
            <li key={what} className="flex justify-between gap-3">
              <span>{what}</span>
              <Badge variant="outline" className="shrink-0 font-semibold text-primary border-primary/40">
                {gain}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Até 3 treinos por dia valem XP. Fim de semana não quebra a sequência. O ranking recomeça todo mês; o seu XP e o
          seu nível ficam.
        </p>
      </CardContent>
    </Card>
  );
}

export function ArenaHome({
  data,
  loading,
  myId,
  onTrain,
}: {
  data: ArenaData | null;
  loading: boolean;
  myId: string | null;
  onTrain: () => void;
}) {
  if (loading && !data) {
    return (
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (!data) return <p className="py-8 text-center text-muted-foreground">Não foi possível carregar a Arena.</p>;
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <PlayerCard data={data} onTrain={onTrain} />
      <LevelsCard totalXp={data.me.totalXp} />
      <RankingCard data={data} myId={myId} />
      <XpRulesCard />
    </div>
  );
}
