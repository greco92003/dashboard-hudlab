"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  calcularNivel,
  getSetor,
  formatarData,
  diasRestantes,
  STATUS_TAREFA,
  STATUS_COMPROMISSO,
  STATUS_NARRATIVA,
  PRIORIDADE_TAREFA,
} from "@/lib/ncts";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import {
  Zap,
  TrendingUp,
  Trophy,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Target,
  CheckSquare,
  ListTodo,
  Star,
  Users,
  Activity,
  Palette,
  ShoppingBag,
  User,
  ArrowRight,
  Flame,
  BookOpen,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tarefa = {
  id: string;
  titulo: string;
  status: string;
  prioridade: string;
  prazo_fim: string | null;
  compromisso_id: string;
  xp_reward: number;
  _compromisso?: { titulo: string } | null;
};

type Compromisso = {
  id: string;
  titulo: string;
  status: string;
  progresso: number;
  narrativa_id: string;
  _narrativa?: { titulo: string; setor_id: string } | null;
  _total?: number;
  _concluidas?: number;
};

type Narrativa = {
  id: string;
  titulo: string;
  status: string;
  progresso: number;
  setor_id: string;
  prazo_fim: string | null;
  _total_compromissos?: number;
  _concluidos?: number;
};

type ActivityEntry = {
  id: string;
  xp_ganho: number;
  motivo: string;
  created_at: string;
  origem_tipo: string;
};

type Badge = {
  id: string;
  badge_id: string;
  nct_badges: { nome: string; icone: string | null; tipo: string } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function isAtrasada(prazo: string | null, status: string) {
  if (!prazo || status === "concluida") return false;
  return new Date(prazo) < new Date();
}

function isExpirando(prazo: string | null, status: string) {
  if (!prazo || status === "concluida") return false;
  const dias = diasRestantes(prazo);
  return dias >= 0 && dias <= 3;
}

function nomePrioridade(p: string) {
  return PRIORIDADE_TAREFA[p as keyof typeof PRIORIDADE_TAREFA]?.label ?? p;
}

function corPrioridade(p: string) {
  return PRIORIDADE_TAREFA[p as keyof typeof PRIORIDADE_TAREFA]?.color ?? "";
}

function nomeStatus(s: string) {
  return (
    STATUS_TAREFA[s as keyof typeof STATUS_TAREFA]?.label ??
    STATUS_COMPROMISSO[s as keyof typeof STATUS_COMPROMISSO]?.label ??
    STATUS_NARRATIVA[s as keyof typeof STATUS_NARRATIVA]?.label ??
    s
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-24" />
      </CardContent>
    </Card>
  );
}

function QuickStatCard({
  icon,
  label,
  value,
  color,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  loading: boolean;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <CardContent className="pt-4 pb-4">
        <div className={`mb-1 ${color}`}>{icon}</div>
        {loading ? (
          <Skeleton className="h-7 w-16 mb-1" />
        ) : (
          <p className="text-2xl font-bold">{value}</p>
        )}
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function TarefaItem({ tarefa }: { tarefa: Tarefa }) {
  const atrasada = isAtrasada(tarefa.prazo_fim, tarefa.status);
  const expirando = isExpirando(tarefa.prazo_fim, tarefa.status);
  const dias = diasRestantes(tarefa.prazo_fim);

  return (
    <Link href="/ncts/tarefas">
      <div
        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50 cursor-pointer ${
          atrasada
            ? "border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
            : expirando
              ? "border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"
              : "border-border"
        }`}
      >
        <div className="mt-0.5 shrink-0">
          {atrasada ? (
            <AlertTriangle className="h-4 w-4 text-red-500" />
          ) : expirando ? (
            <Clock className="h-4 w-4 text-amber-500" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{tarefa.titulo}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {tarefa._compromisso && (
              <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                {tarefa._compromisso.titulo}
              </span>
            )}
            <span
              className={`text-xs font-medium ${corPrioridade(tarefa.prioridade)}`}
            >
              {nomePrioridade(tarefa.prioridade)}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          {tarefa.prazo_fim && (
            <p
              className={`text-xs ${
                atrasada
                  ? "text-red-600 font-semibold"
                  : expirando
                    ? "text-amber-600 font-semibold"
                    : "text-muted-foreground"
              }`}
            >
              {atrasada
                ? `${Math.abs(dias)}d atraso`
                : expirando
                  ? `${dias}d restantes`
                  : formatarData(tarefa.prazo_fim)}
            </p>
          )}
          <Badge variant="secondary" className="text-xs mt-1">
            +{tarefa.xp_reward} XP
          </Badge>
        </div>
      </div>
    </Link>
  );
}

function CompromissoItem({ compromisso }: { compromisso: Compromisso }) {
  const status =
    STATUS_COMPROMISSO[compromisso.status as keyof typeof STATUS_COMPROMISSO];
  return (
    <Link href="/ncts/compromissos">
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
        <CheckSquare className="h-4 w-4 text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{compromisso.titulo}</p>
          {compromisso._narrativa && (
            <p className="text-xs text-muted-foreground truncate">
              {compromisso._narrativa.titulo}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <Progress value={compromisso.progresso} className="h-1.5 flex-1" />
            <span className="text-xs text-muted-foreground shrink-0">
              {compromisso.progresso}%
            </span>
          </div>
        </div>
        {status && (
          <Badge className={`text-white border-0 text-xs ${status.color}`}>
            {status.label}
          </Badge>
        )}
      </div>
    </Link>
  );
}

function NarrativaItem({ narrativa }: { narrativa: Narrativa }) {
  const setor = getSetor(narrativa.setor_id);
  const status =
    STATUS_NARRATIVA[narrativa.status as keyof typeof STATUS_NARRATIVA];
  return (
    <Link href="/ncts/narrativas">
      <div
        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
        style={{ borderLeftColor: setor?.cor ?? "#6b7280", borderLeftWidth: 3 }}
      >
        <Target className="h-4 w-4 text-purple-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{narrativa.titulo}</p>
          <div className="flex items-center gap-2 mt-1">
            {setor && (
              <span className="text-xs" style={{ color: setor.cor }}>
                {setor.nome}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <Progress value={narrativa.progresso} className="h-1.5 flex-1" />
            <span className="text-xs text-muted-foreground shrink-0">
              {narrativa.progresso}%
            </span>
          </div>
        </div>
        {status && (
          <Badge className={`text-white border-0 text-xs ${status.color}`}>
            {status.label}
          </Badge>
        )}
      </div>
    </Link>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function UserProgressPage() {
  const { user } = useAuth();
  const { profile, isOwnerOrAdmin, isManager } = useUserProfile();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [xpTotal, setXpTotal] = useState(0);
  const [ranking, setRanking] = useState<number | null>(null);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [tarefasConcluidas, setTarefasConcluidas] = useState(0);
  const [compromissos, setCompromissos] = useState<Compromisso[]>([]);
  const [narrativas, setNarrativas] = useState<Narrativa[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [atividade, setAtividade] = useState<ActivityEntry[]>([]);
  // Sector leader data
  const [setorTarefasAtrasadas, setSetorTarefasAtrasadas] = useState(0);
  const [setorTarefasExpirando, setSetorTarefasExpirando] = useState(0);
  const [setorProgCompromissos, setSetorProgCompromissos] = useState(0);
  const [setorProgNarrativas, setSetorProgNarrativas] = useState(0);
  // Designer data
  const [designerStats, setDesignerStats] = useState<{
    mockupsFeitos: number;
    alteracoesFeitas: number;
    arquivosSerigrafia: number;
  } | null>(null);

  const isLider = isOwnerOrAdmin || isManager;
  const setor = profile?.sector ?? null;
  const isDesigner = setor === "design";
  const isComercial = setor === "comercial";

  useEffect(() => {
    if (!user?.id) return;
    fetchAll();
  }, [user?.id, profile?.sector]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [
        xpRes,
        tarefasRes,
        tarefasConcluidasRes,
        comprRes,
        narrRes,
        badgesRes,
        atividadeRes,
      ] = await Promise.all([
        supabase
          .from("nct_xp_log")
          .select("xp_ganho")
          .eq("usuario_id", user!.id),
        supabase
          .from("nct_tarefas")
          .select(
            "id, titulo, status, prioridade, prazo_fim, compromisso_id, xp_reward, nct_compromissos(titulo)",
          )
          .eq("responsavel_id", user!.id)
          .neq("status", "concluida")
          .order("prazo_fim", { ascending: true }),
        supabase
          .from("nct_tarefas")
          .select("id", { count: "exact" })
          .eq("responsavel_id", user!.id)
          .eq("status", "concluida"),
        supabase
          .from("nct_compromissos")
          .select(
            "id, titulo, status, progresso, narrativa_id, nct_narrativas(titulo, setor_id)",
          )
          .eq("responsavel_id", user!.id)
          .neq("status", "cancelado"),
        supabase
          .from("nct_narrativa_participantes")
          .select(
            "narrativa_id, nct_narrativas(id, titulo, status, progresso, setor_id, prazo_fim)",
          )
          .eq("usuario_id", user!.id),
        supabase
          .from("nct_user_badges")
          .select("id, badge_id, nct_badges(nome, icone, tipo)")
          .eq("usuario_id", user!.id)
          .limit(6),
        supabase
          .from("nct_xp_log")
          .select("id, xp_ganho, motivo, created_at, origem_tipo")
          .eq("usuario_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      const totalXp = (xpRes.data ?? []).reduce(
        (s: number, r: any) => s + r.xp_ganho,
        0,
      );
      setXpTotal(totalXp);
      setTarefasConcluidas(tarefasConcluidasRes.count ?? 0);

      setTarefas(
        (tarefasRes.data ?? []).map((t: any) => ({
          ...t,
          _compromisso: t.nct_compromissos,
        })),
      );

      setCompromissos(
        (comprRes.data ?? []).map((c: any) => ({
          ...c,
          _narrativa: c.nct_narrativas,
        })),
      );

      setNarrativas(
        (narrRes.data ?? []).map((p: any) => p.nct_narrativas).filter(Boolean),
      );

      setBadges(
        (badgesRes.data ?? []).map((b: any) => ({
          ...b,
          nct_badges: Array.isArray(b.nct_badges)
            ? (b.nct_badges[0] ?? null)
            : b.nct_badges,
        })) as Badge[],
      );
      setAtividade(atividadeRes.data ?? []);

      // Fetch ranking
      const rankRes = await supabase
        .from("nct_xp_log")
        .select("usuario_id, xp_ganho");
      if (rankRes.data) {
        const map: Record<string, number> = {};
        rankRes.data.forEach((r: any) => {
          map[r.usuario_id] = (map[r.usuario_id] ?? 0) + r.xp_ganho;
        });
        const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
        const pos = sorted.findIndex(([uid]) => uid === user!.id);
        setRanking(pos >= 0 ? pos + 1 : null);
      }

      // Fetch sector data for leaders
      if (isLider && setor) {
        await fetchSectorData(setor);
      }

      // Fetch designer data
      if (isDesigner && profile) {
        await fetchDesignerData(
          profile.first_name ?? "",
          profile.last_name ?? "",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchSectorData(setorId: string) {
    const hoje = new Date().toISOString();
    const em3dias = new Date(
      Date.now() + 3 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [atrasadasRes, expirandoRes, comprSetorRes, narrSetorRes] =
      await Promise.all([
        supabase
          .from("nct_tarefas")
          .select("id", { count: "exact" })
          .lt("prazo_fim", hoje)
          .neq("status", "concluida"),
        supabase
          .from("nct_tarefas")
          .select("id", { count: "exact" })
          .gte("prazo_fim", hoje)
          .lte("prazo_fim", em3dias)
          .neq("status", "concluida"),
        supabase
          .from("nct_compromissos")
          .select("progresso")
          .neq("status", "cancelado"),
        supabase
          .from("nct_narrativas")
          .select("progresso")
          .eq("setor_id", setorId)
          .neq("status", "cancelada"),
      ]);

    setSetorTarefasAtrasadas(atrasadasRes.count ?? 0);
    setSetorTarefasExpirando(expirandoRes.count ?? 0);

    if (comprSetorRes.data && comprSetorRes.data.length > 0) {
      const avg =
        comprSetorRes.data.reduce((s: number, c: any) => s + c.progresso, 0) /
        comprSetorRes.data.length;
      setSetorProgCompromissos(Math.round(avg));
    }

    if (narrSetorRes.data && narrSetorRes.data.length > 0) {
      const avg =
        narrSetorRes.data.reduce((s: number, n: any) => s + n.progresso, 0) /
        narrSetorRes.data.length;
      setSetorProgNarrativas(Math.round(avg));
    }
  }

  async function fetchDesignerData(firstName: string, lastName: string) {
    const designerName = `${firstName} ${lastName}`.trim();
    if (!designerName) return;

    const { data } = await supabase
      .from("designer_mockups_cache")
      .select("is_mockup_feito, is_alteracao, is_arquivo_serigrafia")
      .ilike("designer", `%${firstName}%`)
      .eq("sync_status", "synced");

    if (data) {
      setDesignerStats({
        mockupsFeitos: data.filter((d: any) => d.is_mockup_feito).length,
        alteracoesFeitas: data.filter((d: any) => d.is_alteracao).length,
        arquivosSerigrafia: data.filter((d: any) => d.is_arquivo_serigrafia)
          .length,
      });
    }
  }

  const nivel = calcularNivel(xpTotal);
  const nomeCompleto =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    "Usuário";
  const setorInfo = getSetor(setor);

  const tarefasAtrasadas = tarefas.filter((t) =>
    isAtrasada(t.prazo_fim, t.status),
  );
  const tarefasExpirando = tarefas.filter(
    (t) =>
      !isAtrasada(t.prazo_fim, t.status) && isExpirando(t.prazo_fim, t.status),
  );
  const tarefasAndamento = tarefas.filter(
    (t) =>
      !isAtrasada(t.prazo_fim, t.status) && !isExpirando(t.prazo_fim, t.status),
  );
  const narrativasAtivas = narrativas.filter(
    (n) => n.status === "em_andamento",
  );
  const compromissosAtivos = compromissos.filter(
    (c) => c.status === "em_andamento",
  );

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold shrink-0">
            {loading ? "?" : nomeCompleto.charAt(0).toUpperCase()}
          </div>
          <div>
            {loading ? (
              <Skeleton className="h-7 w-48 mb-1" />
            ) : (
              <h1 className="text-xl font-bold">
                {saudacao()}, {profile?.first_name ?? nomeCompleto}! 👋
              </h1>
            )}
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {setorInfo && (
                <Badge
                  variant="outline"
                  style={{ borderColor: setorInfo.cor, color: setorInfo.cor }}
                >
                  {setorInfo.nome}
                </Badge>
              )}
              {profile?.role && (
                <Badge variant="secondary" className="capitalize">
                  {profile.role}
                </Badge>
              )}
              {!loading && (
                <span className="text-sm text-muted-foreground">
                  Nível {nivel.nivel} • {xpTotal.toLocaleString()} XP
                </span>
              )}
            </div>
          </div>
        </div>

        {/* XP Card resumido no header */}
        {!loading && (
          <div className="sm:ml-auto flex flex-col gap-1 min-w-[160px]">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Nível {nivel.nivel}</span>
              <span>Nível {nivel.nivel + 1}</span>
            </div>
            <Progress value={nivel.progresso} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">
              {nivel.xpAtual} / {nivel.xpProximo} XP
            </p>
          </div>
        )}
      </div>

      {/* ── Quick Stats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <QuickStatCard
          icon={<Zap className="h-5 w-5" />}
          label="XP Total"
          value={xpTotal.toLocaleString()}
          color="text-amber-500"
          loading={loading}
        />
        <QuickStatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Nível"
          value={`Nível ${nivel.nivel}`}
          color="text-blue-500"
          loading={loading}
        />
        <QuickStatCard
          icon={<Trophy className="h-5 w-5" />}
          label="Ranking Geral"
          value={ranking ? `#${ranking}` : "—"}
          color="text-purple-500"
          loading={loading}
        />
        <QuickStatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Tarefas Atrasadas"
          value={tarefasAtrasadas.length}
          color="text-red-500"
          loading={loading}
        />
        <QuickStatCard
          icon={<ListTodo className="h-5 w-5" />}
          label="Tarefas Pendentes"
          value={tarefas.length}
          color="text-slate-500"
          loading={loading}
        />
        <QuickStatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Concluídas"
          value={tarefasConcluidas}
          color="text-emerald-500"
          loading={loading}
        />
      </div>

      {/* ── Summary Card ─────────────────────────────────────────────── */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            Resumo de Progresso
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              {[
                {
                  label: "Tarefas concluídas",
                  value: tarefasConcluidas,
                  icon: CheckCircle2,
                  color: "text-emerald-500",
                },
                {
                  label: "Compromissos ativos",
                  value: compromissosAtivos.length,
                  icon: CheckSquare,
                  color: "text-blue-500",
                },
                {
                  label: "Narrativas ativas",
                  value: narrativasAtivas.length,
                  icon: Target,
                  color: "text-purple-500",
                },
                {
                  label: "Conquistas",
                  value: badges.length,
                  icon: Star,
                  color: "text-amber-500",
                },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <Icon className={`h-6 w-6 ${color}`} />
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Two-column main area ──────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* ── LEFT: My Tasks ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-slate-500" />
                Minhas Tarefas
                {!loading && (
                  <Badge variant="secondary">{tarefas.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))
              ) : tarefas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                  <p className="text-sm">
                    Nenhuma tarefa pendente. Ótimo trabalho!
                  </p>
                </div>
              ) : (
                <>
                  {tarefasAtrasadas.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-red-600 mb-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Atrasadas (
                        {tarefasAtrasadas.length})
                      </p>
                      {tarefasAtrasadas.map((t) => (
                        <TarefaItem key={t.id} tarefa={t} />
                      ))}
                    </div>
                  )}
                  {tarefasExpirando.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-amber-600 mb-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Expirando em breve (
                        {tarefasExpirando.length})
                      </p>
                      {tarefasExpirando.map((t) => (
                        <TarefaItem key={t.id} tarefa={t} />
                      ))}
                    </div>
                  )}
                  {tarefasAndamento.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">
                        Em andamento ({tarefasAndamento.length})
                      </p>
                      {tarefasAndamento.slice(0, 5).map((t) => (
                        <TarefaItem key={t.id} tarefa={t} />
                      ))}
                    </div>
                  )}
                  <Link
                    href="/ncts/tarefas"
                    className="flex items-center gap-1 text-xs text-primary hover:underline pt-1"
                  >
                    Ver todas as tarefas <ArrowRight className="h-3 w-3" />
                  </Link>
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Recent Activity ───────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                Atividade Recente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))
              ) : atividade.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma atividade registrada ainda.
                </p>
              ) : (
                atividade.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 py-1.5 border-b border-border last:border-0"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 shrink-0">
                      <Zap className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{a.motivo}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatarData(a.created_at)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      +{a.xp_ganho} XP
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT: Commitments + Narratives ────────────────────────── */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-blue-500" />
                Meus Compromissos
                {!loading && (
                  <Badge variant="secondary">{compromissos.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))
              ) : compromissos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum compromisso vinculado ao seu usuário.
                </p>
              ) : (
                <>
                  {compromissos.slice(0, 6).map((c) => (
                    <CompromissoItem key={c.id} compromisso={c} />
                  ))}
                  <Link
                    href="/ncts/compromissos"
                    className="flex items-center gap-1 text-xs text-primary hover:underline pt-1"
                  >
                    Ver todos os compromissos <ArrowRight className="h-3 w-3" />
                  </Link>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-purple-500" />
                Minhas Narrativas
                {!loading && (
                  <Badge variant="secondary">{narrativas.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))
              ) : narrativas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Você não participa de nenhuma narrativa ainda.
                </p>
              ) : (
                <>
                  {narrativas.slice(0, 6).map((n) => (
                    <NarrativaItem key={n.id} narrativa={n} />
                  ))}
                  <Link
                    href="/ncts/narrativas"
                    className="flex items-center gap-1 text-xs text-primary hover:underline pt-1"
                  >
                    Ver todas as narrativas <ArrowRight className="h-3 w-3" />
                  </Link>
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Gamification / Badges ───────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" />
                Conquistas
                {!loading && <Badge variant="secondary">{badges.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : badges.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma conquista ainda. Complete tarefas para ganhar badges!
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {badges.map((b) => (
                    <div
                      key={b.id}
                      className="flex flex-col items-center gap-1 p-2 border rounded-lg min-w-[60px] text-center"
                    >
                      <span className="text-2xl">
                        {b.nct_badges?.icone ?? "🏅"}
                      </span>
                      <span className="text-xs text-muted-foreground leading-tight">
                        {b.nct_badges?.nome}
                      </span>
                    </div>
                  ))}
                  <Link
                    href="/ncts/conquistas"
                    className="flex items-center gap-1 text-xs text-primary hover:underline w-full mt-1"
                  >
                    Ver todas as conquistas <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Conditional Blocks ────────────────────────────────────────── */}

      {/* Sector Leader Block */}
      {isLider && (
        <Card className="border-blue-200 dark:border-blue-900/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Visão do Setor
              {setorInfo && (
                <Badge
                  variant="outline"
                  style={{ borderColor: setorInfo.cor, color: setorInfo.cor }}
                >
                  {setorInfo.nome}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: "Tarefas atrasadas",
                    value: setorTarefasAtrasadas,
                    color: "text-red-500",
                    icon: AlertTriangle,
                  },
                  {
                    label: "Expirando em 3 dias",
                    value: setorTarefasExpirando,
                    color: "text-amber-500",
                    icon: Clock,
                  },
                  {
                    label: "Progresso compromissos",
                    value: `${setorProgCompromissos}%`,
                    color: "text-blue-500",
                    icon: CheckSquare,
                  },
                  {
                    label: "Progresso narrativas",
                    value: `${setorProgNarrativas}%`,
                    color: "text-purple-500",
                    icon: Target,
                  },
                ].map(({ label, value, color, icon: Icon }) => (
                  <div
                    key={label}
                    className="text-center p-3 rounded-lg bg-muted/40"
                  >
                    <Icon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
                    <p className="text-xl font-bold">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Designer Block */}
      {isDesigner && (
        <Card className="border-red-200 dark:border-red-900/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4 text-red-500" />
              Métricas de Design
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading || designerStats === null ? (
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  {
                    label: "Mockups feitos",
                    value: designerStats.mockupsFeitos,
                    color: "text-red-500",
                  },
                  {
                    label: "Alterações",
                    value: designerStats.alteracoesFeitas,
                    color: "text-orange-500",
                  },
                  {
                    label: "Arquivos de serigrafia",
                    value: designerStats.arquivosSerigrafia,
                    color: "text-pink-500",
                  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-3 rounded-lg bg-muted/40">
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Dados do período atual — sincronizado com Google Sheets
            </p>
          </CardContent>
        </Card>
      )}

      {/* Commercial Block */}
      {isComercial && (
        <Card className="border-pink-200 dark:border-pink-900/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-pink-500" />
              Desempenho Comercial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/40 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold">
                    Ranking de Vendas
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Dados de ranking serão exibidos conforme a integração com o
                  sistema de vendas.
                </p>
                <Link
                  href="/sellers"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  Ver painel de vendedores <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="p-4 rounded-lg bg-muted/40 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-semibold">
                    Ranking de Treinamentos
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Progresso de treinamentos e aproveitamento serão exibidos aqui
                  em breve.
                </p>
                <Link
                  href="/ncts"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  Ver dashboard NCT <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
