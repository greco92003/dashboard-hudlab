"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  CheckSquare,
  CheckCircle2,
  Calendar,
  Zap,
  Target,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  getSetor,
  STATUS_COMPROMISSO,
  formatarData,
  diasRestantes,
  SETORES,
} from "@/lib/ncts";

type Compromisso = {
  id: string;
  titulo: string;
  descricao: string | null;
  narrativa_id: string;
  status: string;
  progresso: number;
  peso: number;
  prazo_fim: string | null;
  xp_total: number;
  responsavel_id: string | null;
  _narrativa?: { titulo: string; setor_id: string } | null;
  _responsavel?: { first_name: string | null; last_name: string | null } | null;
  _tarefas?: number;
  _concluidas?: number;
};

export default function NctsCompromissosPage() {
  const { user } = useAuth();
  const {
    isAdmin,
    isOwner,
    isTeamLeader,
    getSectorManaged,
    canManageCompromissos,
  } = usePermissions();
  const supabase = useMemo(() => createClient(), []);
  const [compromissos, setCompromissos] = useState<Compromisso[]>([]);
  const [narrativas, setNarrativas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroSetor, setFiltroSetor] = useState("todos");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    narrativa_id: "",
    peso: "100",
    prazo_fim: "",
    xp_total: "30",
  });
  const [salvando, setSalvando] = useState(false);

  const sectorManaged = getSectorManaged();
  const canCreate = canManageCompromissos;

  // Initialize sector filter for team leaders
  useEffect(() => {
    if (isTeamLeader && sectorManaged) {
      setFiltroSetor(sectorManaged);
    }
  }, [isTeamLeader, sectorManaged]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [cRes, nRes] = await Promise.all([
      supabase
        .from("nct_compromissos")
        .select(
          "*, narrativa:narrativa_id(titulo, setor_id), responsavel:responsavel_id(first_name, last_name), nct_tarefas(id, status)",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("nct_narrativas")
        .select("id, titulo, setor_id")
        .eq("status", "em_andamento"),
    ]);
    if (cRes.data) {
      setCompromissos(
        cRes.data.map((c: any) => ({
          ...c,
          _narrativa: c.narrativa,
          _responsavel: c.responsavel,
          _tarefas: c.nct_tarefas?.length ?? 0,
          _concluidas:
            c.nct_tarefas?.filter((t: any) => t.status === "concluida")
              .length ?? 0,
        })),
      );
    }
    setNarrativas(nRes.data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCriar() {
    if (!form.titulo || !form.narrativa_id)
      return toast.error("Título e narrativa são obrigatórios.");
    setSalvando(true);
    const { error } = await supabase.from("nct_compromissos").insert({
      titulo: form.titulo,
      descricao: form.descricao || null,
      narrativa_id: form.narrativa_id,
      peso: parseInt(form.peso) || 100,
      prazo_fim: form.prazo_fim || null,
      xp_total: parseInt(form.xp_total) || 30,
      responsavel_id: user!.id,
    });
    setSalvando(false);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Compromisso criado!");
    setOpen(false);
    setForm({
      titulo: "",
      descricao: "",
      narrativa_id: "",
      peso: "100",
      prazo_fim: "",
      xp_total: "30",
    });
    fetchData();
  }

  // For team leaders, narrativas available in the form are limited to their sector
  const narrativasDisponiveis =
    isTeamLeader && sectorManaged
      ? narrativas.filter((n) => n.setor_id === sectorManaged)
      : narrativas;

  const filtrados = compromissos.filter((c) => {
    const matchBusca = c.titulo.toLowerCase().includes(busca.toLowerCase());
    const matchStatus = filtroStatus === "todos" || c.status === filtroStatus;
    // Team leaders can only see their sector's compromissos
    const effectiveFiltroSetor =
      isTeamLeader && sectorManaged ? sectorManaged : filtroSetor;
    const matchSetor =
      effectiveFiltroSetor === "todos" ||
      c._narrativa?.setor_id === effectiveFiltroSetor;
    return matchBusca && matchStatus && matchSetor;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CheckSquare className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Compromissos</h1>
            <p className="text-sm text-muted-foreground">
              Os marcos que fazem as narrativas avançarem.
            </p>
          </div>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Novo Compromisso
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Compromisso</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Título *</Label>
                  <Input
                    value={form.titulo}
                    onChange={(e) =>
                      setForm({ ...form, titulo: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea
                    value={form.descricao}
                    onChange={(e) =>
                      setForm({ ...form, descricao: e.target.value })
                    }
                    rows={2}
                  />
                </div>
                <div>
                  <Label>Narrativa *</Label>
                  <Select
                    value={form.narrativa_id}
                    onValueChange={(v) => setForm({ ...form, narrativa_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a narrativa" />
                    </SelectTrigger>
                    <SelectContent>
                      {narrativasDisponiveis.map((n) => (
                        <SelectItem key={n.id} value={n.id}>
                          {n.titulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Peso (%)</Label>
                    <Input
                      type="number"
                      value={form.peso}
                      onChange={(e) =>
                        setForm({ ...form, peso: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Prazo</Label>
                    <Input
                      type="date"
                      value={form.prazo_fim}
                      onChange={(e) =>
                        setForm({ ...form, prazo_fim: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>XP</Label>
                    <Input
                      type="number"
                      value={form.xp_total}
                      onChange={(e) =>
                        setForm({ ...form, xp_total: e.target.value })
                      }
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleCriar}
                  disabled={salvando}
                >
                  {salvando ? "Criando..." : "Criar Compromisso"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar compromisso..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        {/* Sector filter: team leaders see locked badge, admins/owners get full select */}
        {isTeamLeader && sectorManaged ? (
          <Badge
            variant="outline"
            className="flex items-center gap-1.5 px-3 py-1 h-9"
            style={{
              borderColor: getSetor(sectorManaged)?.cor,
              color: getSetor(sectorManaged)?.cor,
            }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: getSetor(sectorManaged)?.cor }}
            />
            Setor {getSetor(sectorManaged)?.nome}
          </Badge>
        ) : (
          <Select value={filtroSetor} onValueChange={setFiltroSetor}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Todos setores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos setores</SelectItem>
              {SETORES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="em_andamento">Em andamento</SelectItem>
            <SelectItem value="concluido">Concluído</SelectItem>
            <SelectItem value="pausado">Pausado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))
        ) : filtrados.length === 0 ? (
          <div className="col-span-full flex flex-col items-center py-16 text-muted-foreground gap-2">
            <CheckSquare className="h-12 w-12 opacity-20" />
            <p>Nenhum compromisso encontrado.</p>
          </div>
        ) : (
          filtrados.map((c) => {
            const setor = getSetor(c._narrativa?.setor_id);
            const status =
              STATUS_COMPROMISSO[c.status as keyof typeof STATUS_COMPROMISSO];
            const dias = diasRestantes(c.prazo_fim);
            const respNome = c._responsavel
              ? `${c._responsavel.first_name ?? ""} ${c._responsavel.last_name ?? ""}`.trim()
              : null;
            return (
              <Card
                key={c.id}
                className="border-l-4"
                style={{ borderLeftColor: setor?.cor ?? "#6b7280" }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold leading-snug">
                      {c.titulo}
                    </CardTitle>
                    <Badge
                      className={`text-white border-0 text-xs shrink-0 ${status?.color ?? "bg-slate-500"}`}
                    >
                      {status?.label ?? c.status}
                    </Badge>
                  </div>
                  {c._narrativa && (
                    <Link
                      href={`/ncts/narrativas/${c.narrativa_id}`}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      <Target className="h-3 w-3" />
                      {c._narrativa.titulo}
                    </Link>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Progresso</span>
                      <span>{c.progresso}%</span>
                    </div>
                    <Progress value={c.progresso} className="h-1.5" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      {c._concluidas}/{c._tarefas} tarefas
                    </span>
                    <span className="font-medium">Peso: {c.peso}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-amber-500">
                      <Zap className="h-3 w-3" />
                      {c.xp_total} XP
                    </span>
                    {c.prazo_fim && (
                      <span
                        className={`flex items-center gap-1 ${dias < 0 ? "text-red-500" : dias < 7 ? "text-amber-500" : "text-muted-foreground"}`}
                      >
                        <Calendar className="h-3 w-3" />
                        {formatarData(c.prazo_fim)}
                      </span>
                    )}
                  </div>
                  {respNome && (
                    <p className="text-xs text-muted-foreground border-t pt-2">
                      Resp: {respNome}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
