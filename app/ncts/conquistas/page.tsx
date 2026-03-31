"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Star,
  Zap,
  TrendingUp,
  Trophy,
  CheckCircle2,
  Clock,
  Flame,
} from "lucide-react";
import { calcularNivel, formatarData } from "@/lib/ncts";

const BADGES_SISTEMA = [
  {
    id: "executor",
    nome: "Executor",
    descricao: "10 tarefas concluídas",
    icone: "✅",
    tipo: "conquista",
  },
  {
    id: "pontual",
    nome: "Pontual",
    descricao: "5 tarefas seguidas antes do prazo",
    icone: "⏰",
    tipo: "conquista",
  },
  {
    id: "guardiao",
    nome: "Guardião da Narrativa",
    descricao: "Participou da conclusão de uma narrativa",
    icone: "🛡️",
    tipo: "narrativa",
  },
  {
    id: "motor",
    nome: "Motor do Setor",
    descricao: "Maior XP do setor no mês",
    icone: "⚡",
    tipo: "setor",
  },
  {
    id: "lider_acao",
    nome: "Líder em Ação",
    descricao: "Líder com maior taxa de conclusão",
    icone: "🎯",
    tipo: "especial",
  },
  {
    id: "combo",
    nome: "Combo de Entrega",
    descricao: "7 dias com atividades registradas",
    icone: "🔥",
    tipo: "conquista",
  },
];

type UserBadge = {
  id: string;
  badge_id: string;
  narrativa_id: string | null;
  conquistado_em: string;
  nct_badges: {
    nome: string;
    descricao: string | null;
    icone: string | null;
    tipo: string;
  } | null;
  nct_narrativas?: { titulo: string; logo_url: string | null } | null;
};

export default function NctsConquistasPage() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [xpTotal, setXpTotal] = useState(0);
  const [tarefasConcluidas, setTarefasConcluidas] = useState(0);
  const [narrativasConcluidas, setNarrativasConcluidas] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    fetchData();
  }, [user?.id]);

  async function fetchData() {
    setLoading(true);
    const [badgesRes, xpRes, tarefasRes, narrativasRes] = await Promise.all([
      supabase
        .from("nct_user_badges")
        .select(
          "*, nct_badges(nome, descricao, icone, tipo), nct_narrativas(titulo, logo_url)",
        )
        .eq("usuario_id", user!.id)
        .order("conquistado_em", { ascending: false }),
      supabase.from("nct_xp_log").select("xp_ganho").eq("usuario_id", user!.id),
      supabase
        .from("nct_tarefas")
        .select("id", { count: "exact" })
        .eq("responsavel_id", user!.id)
        .eq("status", "concluida"),
      supabase
        .from("nct_narrativa_participantes")
        .select("narrativa_id, nct_narrativas!inner(status)")
        .eq("usuario_id", user!.id),
    ]);

    setBadges(badgesRes.data ?? []);
    const totalXp = (xpRes.data ?? []).reduce((s, r) => s + r.xp_ganho, 0);
    setXpTotal(totalXp);
    setTarefasConcluidas(tarefasRes.count ?? 0);
    const concluidas = (narrativasRes.data ?? []).filter(
      (n: any) => n.nct_narrativas?.status === "concluida",
    ).length;
    setNarrativasConcluidas(concluidas);
    setLoading(false);
  }

  const nivel = calcularNivel(xpTotal);

  // Progresso simulado para badges do sistema (baseado nos stats reais)
  const progressoBadges = {
    executor: Math.min(100, (tarefasConcluidas / 10) * 100),
    pontual: 0, // simplificado
    guardiao: narrativasConcluidas > 0 ? 100 : 0,
    motor: 0,
    combo: 0,
    lider_acao: 0,
  };

  const badgesGanhos = new Set(badges.map((b) => b.badge_id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Star className="h-7 w-7 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold">Conquistas</h1>
          <p className="text-sm text-muted-foreground">
            Insígnias e badges conquistados na jornada.
          </p>
        </div>
      </div>

      {/* Cartão de perfil de jogo */}
      <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
        <CardContent className="pt-6 pb-6">
          {loading ? (
            <div className="flex items-center gap-6 flex-wrap">
              <Skeleton className="h-16 w-16 rounded-full shrink-0" />
              <div className="flex-1 min-w-48 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-6 w-8" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground text-2xl font-bold shrink-0">
                {nivel.nivel}
              </div>
              <div className="flex-1 min-w-48">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span className="font-semibold">Nível {nivel.nivel}</span>
                  <Badge variant="secondary" className="text-xs">
                    {xpTotal.toLocaleString()} XP total
                  </Badge>
                </div>
                <Progress value={nivel.progresso} className="h-2 mb-1" />
                <p className="text-xs text-muted-foreground">
                  {nivel.xpAtual} / {nivel.xpProximo} XP para o próximo nível
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  {
                    icon: CheckCircle2,
                    label: "Tarefas",
                    value: tarefasConcluidas,
                    color: "text-emerald-500",
                  },
                  {
                    icon: Trophy,
                    label: "Narrativas",
                    value: narrativasConcluidas,
                    color: "text-blue-500",
                  },
                  {
                    icon: Star,
                    label: "Badges",
                    value: badges.length,
                    color: "text-amber-500",
                  },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label}>
                    <Icon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
                    <p className="text-xl font-bold">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Insígnias de Narrativas */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          Insígnias de Narrativas
        </h2>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-5 pb-4 flex flex-col items-center gap-2">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : badges.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma insígnia conquistada ainda.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {badges.map((b) => (
              <Card
                key={b.id}
                className="text-center hover:shadow-md transition-shadow border-amber-200 dark:border-amber-900/50"
              >
                <CardContent className="pt-5 pb-4">
                  <div className="text-4xl mb-2">
                    {b.nct_badges?.icone ?? "🏅"}
                  </div>
                  <p className="text-xs font-semibold leading-snug">
                    {b.nct_badges?.nome ?? "Badge"}
                  </p>
                  {b.nct_narrativas && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {b.nct_narrativas.titulo}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatarData(b.conquistado_em)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Conquistas do Sistema */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          Conquistas
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {BADGES_SISTEMA.map((b) => {
            const ganho = badgesGanhos.has(b.id);
            const prog =
              progressoBadges[b.id as keyof typeof progressoBadges] ?? 0;
            return (
              <Card
                key={b.id}
                className={`transition-all ${ganho ? "border-amber-400 dark:border-amber-600 shadow-sm" : "opacity-60"}`}
              >
                <CardContent className="pt-4 pb-4 flex items-start gap-3">
                  <div
                    className={`text-3xl shrink-0 ${!ganho ? "grayscale" : ""}`}
                  >
                    {b.icone}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{b.nome}</p>
                      {ganho && (
                        <Badge className="text-xs bg-amber-500 border-0 text-white h-4 px-1.5">
                          ✓
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {b.descricao}
                    </p>
                    {!ganho && prog > 0 && (
                      <>
                        <Progress value={prog} className="h-1.5" />
                        <p className="text-xs text-muted-foreground mt-1">
                          {Math.round(prog)}% concluído
                        </p>
                      </>
                    )}
                    {ganho && (
                      <p className="text-xs text-amber-500 font-medium">
                        Conquistado! 🎉
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {!loading && badges.length === 0 && tarefasConcluidas === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Star className="h-16 w-16 mx-auto opacity-20 mb-4" />
          <p className="text-lg font-medium">Nenhuma conquista ainda</p>
          <p className="text-sm">
            Comece completando tarefas para ganhar XP e badges!
          </p>
        </div>
      )}
    </div>
  );
}
