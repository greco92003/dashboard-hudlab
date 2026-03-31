"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Zap,
  Trophy,
  TrendingUp,
  Target,
  AlertTriangle,
  CheckCircle2,
  Map,
} from "lucide-react";
import Link from "next/link";
import {
  calcularNivel,
  formatarData,
  diasRestantes,
  getSetor,
  STATUS_NARRATIVA,
  STATUS_TAREFA,
  PRIORIDADE_TAREFA,
} from "@/lib/ncts";

export default function NctsOverviewPage() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [xpTotal, setXpTotal] = useState(0);
  const [ranking, setRanking] = useState<number | null>(null);
  const [narrativas, setNarrativas] = useState<any[]>([]);
  const [compromissos, setCompromissos] = useState<any[]>([]);
  const [tarefasAtrasadas, setTarefasAtrasadas] = useState<any[]>([]);
  const [tarefasConcluidas, setTarefasConcluidas] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    fetchData();
  }, [user?.id]);

  async function fetchData() {
    setLoading(true);
    try {
      const [xpRes, narrativasRes, tarefasRes] = await Promise.all([
        supabase
          .from("nct_xp_log")
          .select("xp_ganho")
          .eq("usuario_id", user!.id),
        supabase
          .from("nct_narrativa_participantes")
          .select(
            "narrativa_id, xp_nessa_narrativa, nct_narrativas(id, titulo, status, progresso, prazo_fim, setor_id)",
          )
          .eq("usuario_id", user!.id)
          .limit(4),
        supabase
          .from("nct_tarefas")
          .select("id, titulo, status, prioridade, prazo_fim, compromisso_id")
          .eq("responsavel_id", user!.id)
          .neq("status", "concluida"),
      ]);

      const totalXp = (xpRes.data ?? []).reduce((s, r) => s + r.xp_ganho, 0);
      setXpTotal(totalXp);
      setNarrativas(
        (narrativasRes.data ?? [])
          .map((p: any) => p.nct_narrativas)
          .filter(Boolean),
      );

      const hoje = new Date().toISOString().split("T")[0];
      const atrasadas = (tarefasRes.data ?? []).filter(
        (t) => t.prazo_fim && t.prazo_fim < hoje && t.status !== "concluida",
      );
      setTarefasAtrasadas(atrasadas.slice(0, 4));

      const concRes = await supabase
        .from("nct_tarefas")
        .select("id", { count: "exact" })
        .eq("responsavel_id", user!.id)
        .eq("status", "concluida");
      setTarefasConcluidas(concRes.count ?? 0);

      const comprRes = await supabase
        .from("nct_compromissos")
        .select(
          "id, titulo, progresso, prazo_fim, narrativa_id, nct_narrativas(titulo, setor_id)",
        )
        .eq("responsavel_id", user!.id)
        .eq("status", "em_andamento")
        .order("prazo_fim", { ascending: true })
        .limit(4);
      setCompromissos(comprRes.data ?? []);

      const rankRes = await supabase
        .from("nct_xp_log")
        .select("usuario_id, xp_ganho");
      if (rankRes.data) {
        const map: Record<string, number> = {};
        rankRes.data.forEach((r) => {
          map[r.usuario_id] = (map[r.usuario_id] ?? 0) + r.xp_ganho;
        });
        const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
        const pos = sorted.findIndex(([uid]) => uid === user!.id);
        setRanking(pos >= 0 ? pos + 1 : null);
      }
    } finally {
      setLoading(false);
    }
  }

  const nivel = calcularNivel(xpTotal);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Map className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">
            NCT — Narrativas, Compromissos & Tarefas
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe seu progresso, XP e impacto na equipe.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            icon: Zap,
            label: "XP Total",
            value: loading ? null : xpTotal.toLocaleString() + " XP",
            color: "text-amber-500",
          },
          {
            icon: TrendingUp,
            label: "Nível Atual",
            value: loading ? null : `Nível ${nivel.nivel}`,
            color: "text-blue-500",
          },
          {
            icon: Trophy,
            label: "Posição Geral",
            value: loading ? null : ranking ? `#${ranking}` : "—",
            color: "text-purple-500",
          },
          {
            icon: CheckCircle2,
            label: "Tarefas Concluídas",
            value: loading ? null : tarefasConcluidas.toString(),
            color: "text-emerald-500",
          },
        ].map(({ icon: Icon, label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Icon className={`h-4 w-4 ${color}`} />
                {label}
              </div>
              {loading ? (
                <Skeleton className="h-7 w-20 mt-1" />
              ) : (
                <p className="text-2xl font-bold">{value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Barra de progresso de nível */}
      <Card>
        <CardContent className="pt-4 pb-4">
          {loading ? (
            <div className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ) : (
            <>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium">
                  Progresso para Nível {nivel.nivel + 1}
                </span>
                <span className="text-muted-foreground">
                  {nivel.xpAtual} / {nivel.xpProximo} XP
                </span>
              </div>
              <Progress value={nivel.progresso} className="h-2" />
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Minhas Narrativas */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Minhas Narrativas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))
            ) : narrativas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Você não participa de nenhuma narrativa ainda.
              </p>
            ) : (
              narrativas.map((n: any) => {
                const setor = getSetor(n.setor_id);
                return (
                  <Link
                    href={`/ncts/narrativas/${n.id}`}
                    key={n.id}
                    className="block rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{n.titulo}</span>
                      {setor && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                          style={{ backgroundColor: setor.cor }}
                        >
                          {setor.nome}
                        </span>
                      )}
                    </div>
                    <Progress value={n.progresso ?? 0} className="h-1.5" />
                    <span className="text-xs text-muted-foreground mt-1 block">
                      {n.progresso ?? 0}% concluído
                    </span>
                  </Link>
                );
              })
            )}
            <Link
              href="/ncts/narrativas"
              className="text-xs text-primary hover:underline block pt-1"
            >
              Ver todas →
            </Link>
          </CardContent>
        </Card>

        {/* Compromissos próximos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Compromissos Próximos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))
            ) : compromissos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum compromisso ativo no momento.
              </p>
            ) : (
              compromissos.map((c: any) => {
                const dias = diasRestantes(c.prazo_fim);
                return (
                  <div key={c.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{c.titulo}</span>
                      {c.prazo_fim && (
                        <span
                          className={`text-xs ${dias < 3 ? "text-red-500" : "text-muted-foreground"}`}
                        >
                          {dias < 0 ? "Atrasado" : `${dias}d`}
                        </span>
                      )}
                    </div>
                    <Progress value={c.progresso ?? 0} className="h-1.5" />
                    <span className="text-xs text-muted-foreground mt-1 block">
                      {c.progresso ?? 0}% —{" "}
                      {(c.nct_narrativas as any)?.titulo ?? ""}
                    </span>
                  </div>
                );
              })
            )}
            <Link
              href="/ncts/compromissos"
              className="text-xs text-primary hover:underline block pt-1"
            >
              Ver todos →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Tarefas Atrasadas — sempre renderiza, oculta só quando carregado e sem dados */}
      {(loading || tarefasAtrasadas.length > 0) && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-4 w-4" />
              Tarefas Atrasadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-red-100 dark:border-red-900/50 p-3"
                  >
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {tarefasAtrasadas.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-red-100 dark:border-red-900/50 p-3"
                  >
                    <div>
                      <p className="font-medium text-sm">{t.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        Prazo: {formatarData(t.prazo_fim)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        PRIORIDADE_TAREFA[
                          t.prioridade as keyof typeof PRIORIDADE_TAREFA
                        ]?.color
                      }
                    >
                      {
                        PRIORIDADE_TAREFA[
                          t.prioridade as keyof typeof PRIORIDADE_TAREFA
                        ]?.label
                      }
                    </Badge>
                  </div>
                ))}
                <Link
                  href="/ncts/tarefas"
                  className="text-xs text-primary hover:underline block pt-1"
                >
                  Ver todas as tarefas →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
