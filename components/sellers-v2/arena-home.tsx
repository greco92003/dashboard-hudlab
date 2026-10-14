"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Crown, Flame, Lock, Play, Route, Sparkles, Star, Trophy, Zap } from "lucide-react";
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
  missoes: ArenaMission[];
  desafio: ArenaChallenge;
  conquistas: ArenaAchievement[];
  currentUserTraining: CurrentUserTraining;
}

export interface ArenaMission {
  id: string;
  ordem: number;
  curto: string;
  titulo: string;
  dificuldade: 1 | 2 | 3;
  resumo: string;
  objetivo: string;
  melhorNota: number | null;
  liberada: boolean;
  desafio: boolean;
}

export interface ArenaChallenge {
  missaoId: string;
  titulo: string;
  resumo: string;
  dificuldade: number;
  terminaEm: string;
  ranking: Array<{ posicao: number; userId: string; nome: string; avatarUrl: string | null; melhorNota: number; tentativas: number }>;
}

export interface ArenaAchievement {
  id: string;
  titulo: string;
  descricao: string;
  icone: "play" | "check" | "star" | "flame" | "crown" | "route" | "bolt" | "trophy";
  liberada: boolean;
  nova: boolean;
  em: string | null;
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
  const [aba, setAba] = useState<"temporada" | "desafio">("temporada");
  const rest = data.ranking.slice(3);
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg">
          <span className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" /> Ranking
          </span>
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="Escolher ranking">
            {(
              [
                ["temporada", "Temporada"],
                ["desafio", "Desafio da semana"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={aba === id ? "default" : "ghost"}
                onClick={() => setAba(id)}
                aria-pressed={aba === id}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {aba === "desafio" ? (
          data.desafio.ranking.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <Zap className="mx-auto mb-2 h-8 w-8 text-amber-500" />
              <p className="font-semibold">Ninguém jogou o desafio desta semana ainda</p>
              <p className="text-sm text-muted-foreground">{data.desafio.titulo}: a melhor nota vence.</p>
            </div>
          ) : (
            <ol className="space-y-1.5">
              {data.desafio.ranking.map((r) => (
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
                  <span className="text-xs text-muted-foreground">
                    {r.tentativas} {r.tentativas === 1 ? "tentativa" : "tentativas"}
                  </span>
                  <strong className="min-w-16 text-right tabular-nums">nota {r.melhorNota}</strong>
                </li>
              ))}
            </ol>
          )
        ) : data.ranking.length === 0 ? (
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

const stars = (n: number) => (
  <span aria-label={`Dificuldade ${n} de 3`} className="tracking-wider text-amber-500">
    {"★".repeat(n)}
    <span className="text-muted-foreground/40">{"★".repeat(3 - n)}</span>
  </span>
);

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86400e3));
}

function ChallengeCard({
  data,
  myId,
  onTrain,
}: {
  data: ArenaData;
  myId: string | null;
  onTrain: (missionId?: string) => void;
}) {
  const d = data.desafio;
  const mine = d.ranking.find((r) => r.userId === myId);
  const dias = daysUntil(d.terminaEm);
  return (
    <Card className="border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-card to-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 font-extrabold uppercase tracking-widest text-amber-600 dark:text-amber-400">
            <Zap className="h-4 w-4" /> Desafio da semana
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            termina em {dias} {dias === 1 ? "dia" : "dias"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <h3 className="text-xl font-extrabold leading-tight">{d.titulo}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{d.resumo}</p>
          <p className="mt-1 text-sm">{stars(d.dificuldade)}</p>
        </div>
        <ul className="space-y-1 rounded-lg bg-background/60 p-3 text-sm">
          {d.ranking.slice(0, 2).map((r) => (
            <li key={r.userId} className="flex justify-between">
              <span>
                {r.posicao}º {firstName(r.nome)}
              </span>
              <strong>{r.melhorNota}</strong>
            </li>
          ))}
          <li className="flex justify-between text-muted-foreground">
            <span>Você</span>
            <span>{mine ? `${mine.posicao}º · nota ${mine.melhorNota}` : "ainda não jogou"}</span>
          </li>
        </ul>
        <Button
          className="w-full bg-amber-500 font-bold text-amber-950 hover:bg-amber-400"
          disabled={data.me.bloqueado}
          onClick={() => onTrain(d.missaoId)}
        >
          Aceitar desafio
        </Button>
      </CardContent>
    </Card>
  );
}

function MissionsCard({ data, onTrain }: { data: ArenaData; onTrain: (missionId?: string) => void }) {
  const [filtro, setFiltro] = useState<0 | 1 | 2 | 3>(0);
  const anterior = (m: ArenaMission) => data.missoes.find((x) => x.ordem === m.ordem - 1);
  const visiveis = data.missoes.filter((m) => filtro === 0 || m.dificuldade === filtro);
  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-end justify-between gap-3">
          <span>
            <span className="block text-lg">Missões</span>
            <span className="block text-sm font-normal text-muted-foreground">
              Situações reais da Hud Lab. Tire 70 ou mais para liberar a próxima da trilha.
            </span>
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por dificuldade">
            {(
              [
                [0, "Todas"],
                [1, "★ Fácil"],
                [2, "★★ Média"],
                [3, "★★★ Difícil"],
              ] as const
            ).map(([id, label]) => (
              <Button key={id} size="sm" variant={filtro === id ? "default" : "outline"} onClick={() => setFiltro(id)} aria-pressed={filtro === id}>
                {label}
              </Button>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visiveis.map((m) => {
            const feita = m.melhorNota != null && m.melhorNota >= 70;
            return (
              <div
                key={m.id}
                className={cn(
                  "flex min-h-44 flex-col gap-2 rounded-xl border p-4 transition-colors",
                  !m.liberada && "opacity-60",
                  m.desafio && "border-amber-500/50",
                  m.liberada && !feita && !m.desafio && "border-primary/40",
                )}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-muted-foreground">MISSÃO {String(m.ordem).padStart(2, "0")}</span>
                  {stars(m.dificuldade)}
                </div>
                <h3 className="font-bold leading-snug">{m.titulo}</h3>
                <p className="flex-1 text-sm text-muted-foreground">{m.resumo}</p>
                {!m.liberada ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" /> Libera com 70+ na missão {String(anterior(m)?.ordem ?? m.ordem - 1).padStart(2, "0")}
                  </span>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    {m.melhorNota != null ? (
                      <span className={cn("flex items-center gap-1 text-xs font-semibold", feita ? "text-primary" : "text-amber-600 dark:text-amber-400")}>
                        {feita && <Check className="h-3.5 w-3.5" />} Melhor nota {m.melhorNota}
                      </span>
                    ) : (
                      <Badge className={cn(m.desafio && "bg-amber-500 text-amber-950 hover:bg-amber-500")}>
                        {m.desafio ? "Desafio da semana" : "Nova"}
                      </Badge>
                    )}
                    <Button size="sm" variant="ghost" className="text-primary" disabled={data.me.bloqueado} onClick={() => onTrain(m.id)}>
                      {m.melhorNota != null ? "Treinar de novo" : "Começar"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {filtro === 0 && (
            <div className="flex min-h-44 flex-col gap-2 rounded-xl border border-dashed p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-muted-foreground">LIVRE</span>
                {stars(2)}
              </div>
              <h3 className="font-bold leading-snug">Cliente surpresa</h3>
              <p className="flex-1 text-sm text-muted-foreground">Um perfil sorteado a cada treino. Bom para praticar sem roteiro.</p>
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" className="text-primary" disabled={data.me.bloqueado} onClick={() => onTrain("livre")}>
                  Começar
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const ACH_ICON = { play: Play, check: Check, star: Star, flame: Flame, crown: Crown, route: Route, bolt: Zap, trophy: Trophy };

function AchievementsCard({ conquistas }: { conquistas: ArenaAchievement[] }) {
  const liberadas = conquistas.filter((c) => c.liberada).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-lg">
          Conquistas
          <span className="text-sm font-normal text-muted-foreground">
            <strong className="text-foreground">{liberadas}</strong> de {conquistas.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-4 gap-3">
          {conquistas.map((c) => {
            const Icon = ACH_ICON[c.icone];
            return (
              <li key={c.id} className="flex flex-col items-center gap-1 text-center" title={c.descricao}>
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-2xl",
                    c.liberada
                      ? "bg-gradient-to-br from-amber-300 to-amber-600 text-amber-950 shadow-md shadow-amber-500/20"
                      : "border border-dashed text-muted-foreground/50",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className={cn("text-[11px] leading-tight", c.liberada ? "font-semibold" : "text-muted-foreground")}>
                  {c.titulo}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function TrailCard({ missoes }: { missoes: ArenaMission[] }) {
  const ordered = [...missoes].sort((a, b) => a.ordem - b.ordem);
  const done = ordered.filter((m) => (m.melhorNota ?? -1) >= 70).length;
  const currentOrdem = ordered.find((m) => (m.melhorNota ?? -1) < 70)?.ordem ?? null;
  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-end justify-between gap-2">
          <span>
            <span className="block text-lg">Trilha do novo vendedor</span>
            <span className="block text-sm font-normal text-muted-foreground">Do primeiro contato ao fechamento, em {ordered.length} missões.</span>
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            <strong className="text-primary">{done}</strong> de {ordered.length} concluídas
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex items-start overflow-x-auto pb-2">
          {ordered.map((m, i) => {
            const isDone = (m.melhorNota ?? -1) >= 70;
            const isCurrent = m.ordem === currentOrdem;
            return (
              <li key={m.id} className="flex shrink-0 items-start">
                <div className="flex w-20 flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold",
                      isDone && "bg-primary text-primary-foreground",
                      isCurrent && "border-2 border-primary text-primary ring-4 ring-primary/15",
                      !isDone && !isCurrent && "border text-muted-foreground",
                    )}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : m.ordem}
                  </div>
                  <span className={cn("text-center text-[11px]", isDone || isCurrent ? "font-semibold" : "text-muted-foreground")}>{m.curto}</span>
                </div>
                {i < ordered.length - 1 && (
                  <div className={cn("mt-5 h-0.5 w-6", isDone ? "bg-primary" : "bg-border")} aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>
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
  /** Sem missão: continua o treino aberto ou começa um livre. */
  onTrain: (missionId?: string) => void;
}) {
  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
        <Skeleton className="h-96 lg:col-span-3" />
      </div>
    );
  }
  if (!data) return <p className="py-8 text-center text-muted-foreground">Não foi possível carregar a Arena.</p>;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <PlayerCard data={data} onTrain={() => onTrain()} />
      <ChallengeCard data={data} myId={myId} onTrain={onTrain} />
      <MissionsCard data={data} onTrain={onTrain} />
      <RankingCard data={data} myId={myId} />
      <AchievementsCard conquistas={data.conquistas} />
      <TrailCard missoes={data.missoes} />
      <LevelsCard totalXp={data.me.totalXp} />
      <XpRulesCard />
    </div>
  );
}
