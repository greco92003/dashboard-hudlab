"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Target,
  Users,
  Zap,
  Calendar,
  Trophy,
  CheckCircle2,
} from "lucide-react";
import {
  getSetor,
  STATUS_NARRATIVA,
  STATUS_COMPROMISSO,
  formatarData,
  diasRestantes,
} from "@/lib/ncts";

export default function NarrativaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { isAdmin, isOwner } = usePermissions();
  const supabase = createClient();
  const [narrativa, setNarrativa] = useState<any>(null);
  const [compromissos, setCompromissos] = useState<any[]>([]);
  const [participantes, setParticipantes] = useState<any[]>([]);
  const [ranking, setRanking] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, [id]);

  async function fetchAll() {
    setLoading(true);
    const [nRes, cRes, pRes] = await Promise.all([
      supabase
        .from("nct_narrativas")
        .select(
          "*, lider:lider_id(first_name, last_name), setor:setor_id(nome, cor), nct_narrativa_setores(setor_id)",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("nct_compromissos")
        .select(
          "*, responsavel:responsavel_id(first_name, last_name), nct_tarefas(id, status)",
        )
        .eq("narrativa_id", id)
        .order("created_at"),
      supabase
        .from("nct_narrativa_participantes")
        .select("*, usuario:usuario_id(first_name, last_name, avatar_url)")
        .eq("narrativa_id", id)
        .order("xp_nessa_narrativa", { ascending: false }),
    ]);
    setNarrativa(nRes.data);
    setCompromissos(cRes.data ?? []);
    const parts = pRes.data ?? [];
    setParticipantes(parts);
    setRanking(
      [...parts].sort((a, b) => b.xp_nessa_narrativa - a.xp_nessa_narrativa),
    );
    setLoading(false);
  }

  if (loading)
    return (
      <div className="flex flex-col gap-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-6 w-6 rounded" />
          <Skeleton className="h-6 w-32" />
        </div>
        {/* Card principal skeleton */}
        <Card>
          <CardHeader>
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <div className="flex gap-2 pt-1">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-5 w-24 rounded-full" />
                  </div>
                </div>
                <div className="space-y-2 text-right">
                  <Skeleton className="h-5 w-16 ml-auto" />
                  <Skeleton className="h-4 w-24 ml-auto" />
                </div>
              </div>
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-8" />
                </div>
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
            </div>
          </CardHeader>
        </Card>
        {/* Tabs skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-4 space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
                <Skeleton className="h-3 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  if (!narrativa)
    return (
      <div className="text-muted-foreground p-8 text-center">
        Narrativa não encontrada.
      </div>
    );

  const setor = narrativa.setor;
  const lider = narrativa.lider;
  const status =
    STATUS_NARRATIVA[narrativa.status as keyof typeof STATUS_NARRATIVA];
  const dias = diasRestantes(narrativa.prazo_fim);
  const canEdit = isAdmin || isOwner || narrativa.lider_id === user?.id;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Target className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold">Narrativa</h1>
      </div>

      {/* Cabeçalho */}
      <Card
        className="border-l-4"
        style={{ borderLeftColor: setor?.cor ?? "#6b7280" }}
      >
        <CardHeader>
          <div className="flex items-start gap-4 flex-wrap">
            {/* Logo da narrativa */}
            {narrativa.logo_url ? (
              <img
                src={narrativa.logo_url}
                alt={narrativa.titulo}
                className="h-16 w-16 rounded-xl object-cover border shrink-0"
              />
            ) : (
              <div
                className="h-16 w-16 rounded-xl shrink-0 flex items-center justify-center text-white text-2xl font-bold"
                style={{ backgroundColor: setor?.cor ?? "#6b7280" }}
              >
                {narrativa.titulo[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <CardTitle className="text-xl">{narrativa.titulo}</CardTitle>
                {narrativa.descricao && (
                  <p className="text-sm text-muted-foreground">
                    {narrativa.descricao}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {/* Múltiplos setores */}
                  {(narrativa.nct_narrativa_setores?.length > 0
                    ? narrativa.nct_narrativa_setores
                        .map((s: any) => getSetor(s.setor_id))
                        .filter(Boolean)
                    : setor
                      ? [setor]
                      : []
                  ).map((s: any) => (
                    <Badge
                      key={s.id}
                      variant="outline"
                      style={{ borderColor: s.cor, color: s.cor }}
                    >
                      {s.nome}
                    </Badge>
                  ))}
                  {status && (
                    <Badge className={`text-white border-0 ${status.color}`}>
                      {status.label}
                    </Badge>
                  )}
                  {lider && (
                    <Badge variant="secondary">
                      Líder: {lider.first_name} {lider.last_name}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="flex items-center gap-1.5 text-amber-500 font-semibold">
                  <Zap className="h-4 w-4" />
                  {narrativa.xp_total} XP
                </div>
                {narrativa.prazo_fim && (
                  <p
                    className={`text-sm ${dias < 0 ? "text-red-500" : dias < 7 ? "text-amber-500" : "text-muted-foreground"}`}
                  >
                    <Calendar className="h-3 w-3 inline mr-1" />
                    {formatarData(narrativa.prazo_fim)}
                  </p>
                )}
              </div>
            </div>
            {/* fecha flex-1 */}
          </div>
          {/* fecha flex items-start gap-4 */}
          <div className="pt-3">
            <div className="flex justify-between text-sm mb-1.5">
              <span>Progresso geral</span>
              <span className="font-semibold">{narrativa.progresso}%</span>
            </div>
            <Progress value={narrativa.progresso} className="h-2.5" />
          </div>
        </CardHeader>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="compromissos">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="compromissos">Compromissos</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="metricas">Métricas</TabsTrigger>
        </TabsList>

        <TabsContent value="compromissos" className="space-y-3 pt-2">
          {compromissos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum compromisso cadastrado.
            </p>
          ) : (
            compromissos.map((c) => {
              const cStatus =
                STATUS_COMPROMISSO[c.status as keyof typeof STATUS_COMPROMISSO];
              const tarefasConcluidas = (c.nct_tarefas ?? []).filter(
                (t: any) => t.status === "concluida",
              ).length;
              const totalTarefas = (c.nct_tarefas ?? []).length;
              const dias = diasRestantes(c.prazo_fim);
              return (
                <Card key={c.id}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{c.titulo}</p>
                        {c.responsavel && (
                          <p className="text-xs text-muted-foreground">
                            Responsável: {c.responsavel.first_name}{" "}
                            {c.responsavel.last_name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {cStatus && (
                          <Badge
                            className={`text-white border-0 text-xs ${cStatus.color}`}
                          >
                            {cStatus.label}
                          </Badge>
                        )}
                        <span className="text-xs font-semibold">{c.peso}%</span>
                      </div>
                    </div>
                    <Progress value={c.progresso} className="h-1.5 mb-2" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        <CheckCircle2 className="h-3 w-3 inline mr-1 text-emerald-500" />
                        {tarefasConcluidas}/{totalTarefas} tarefas
                      </span>
                      {c.prazo_fim && (
                        <span
                          className={
                            dias < 0
                              ? "text-red-500"
                              : dias < 7
                                ? "text-amber-500"
                                : ""
                          }
                        >
                          <Calendar className="h-3 w-3 inline mr-1" />
                          {formatarData(c.prazo_fim)}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="equipe" className="pt-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Participantes ({participantes.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {participantes.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                      {p.usuario?.first_name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <span className="text-sm">
                      {p.usuario?.first_name} {p.usuario?.last_name}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-amber-500 flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" />
                    {p.xp_nessa_narrativa} XP
                  </span>
                </div>
              ))}
              {participantes.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">
                  Nenhum participante registrado ainda.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ranking" className="pt-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Ranking da Narrativa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ranking.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 py-2 border-b last:border-0"
                >
                  <span
                    className={`text-lg font-bold w-8 text-center ${i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-700" : "text-muted-foreground"}`}
                  >
                    {i === 0
                      ? "🥇"
                      : i === 1
                        ? "🥈"
                        : i === 2
                          ? "🥉"
                          : `${i + 1}°`}
                  </span>
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                    {p.usuario?.first_name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <span className="flex-1 text-sm">
                    {p.usuario?.first_name} {p.usuario?.last_name}
                  </span>
                  <span className="text-sm font-bold text-amber-500">
                    {p.xp_nessa_narrativa} XP
                  </span>
                </div>
              ))}
              {ranking.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">
                  Nenhum dado de XP ainda.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metricas" className="pt-2">
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                label: "Progresso",
                value: `${narrativa.progresso}%`,
                icon: Target,
              },
              {
                label: "Compromissos",
                value: compromissos.length,
                icon: CheckCircle2,
              },
              {
                label: "Concluídos",
                value: compromissos.filter((c) => c.status === "concluido")
                  .length,
                icon: CheckCircle2,
              },
              {
                label: "Participantes",
                value: participantes.length,
                icon: Users,
              },
              {
                label: "XP Distribuível",
                value: `${narrativa.xp_total} XP`,
                icon: Zap,
              },
              {
                label: "Prazo",
                value: formatarData(narrativa.prazo_fim),
                icon: Calendar,
              },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label}>
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <Icon className="h-8 w-8 text-muted-foreground/40" />
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-xl font-bold">{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
