"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  ListTodo,
  Calendar,
  Zap,
  CheckCircle,
  User,
} from "lucide-react";
import { toast } from "sonner";
import {
  SETORES,
  STATUS_TAREFA,
  PRIORIDADE_TAREFA,
  formatarData,
  diasRestantes,
  type StatusTarefa,
  type PrioridadeTarefa,
} from "@/lib/ncts";

const COLUNAS: StatusTarefa[] = [
  "nao_iniciada",
  "em_andamento",
  "em_revisao",
  "concluida",
  "bloqueada",
];

type Tarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  compromisso_id: string;
  responsavel_id: string | null;
  status: StatusTarefa;
  prioridade: PrioridadeTarefa;
  prazo_fim: string | null;
  xp_reward: number;
  _responsavel?: { first_name: string | null; last_name: string | null } | null;
  _compromisso?: { titulo: string } | null;
};

export default function NctsTarefasPage() {
  const { user } = useAuth();
  const { isAdmin, isOwner } = usePermissions();
  const supabase = useMemo(() => createClient(), []);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [compromissos, setCompromissos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [somenteMinhas, setSomenteMinhas] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    compromisso_id: "",
    responsavel_id: "",
    prioridade: "media",
    prazo_fim: "",
    xp_reward: "10",
  });
  const [participantes, setParticipantes] = useState<
    { id: string; nome: string; sector: string | null }[]
  >([]);
  const [loadingParticipantes, setLoadingParticipantes] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const canCreate = isAdmin || isOwner;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [tRes, cRes] = await Promise.all([
      supabase
        .from("nct_tarefas")
        .select(
          "*, responsavel:responsavel_id(first_name, last_name), compromisso:compromisso_id(titulo)",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("nct_compromissos")
        .select("id, titulo, narrativa_id")
        .eq("status", "em_andamento"),
    ]);
    if (tRes.data) {
      setTarefas(
        tRes.data.map((t: any) => ({
          ...t,
          _responsavel: t.responsavel,
          _compromisso: t.compromisso,
        })),
      );
    }
    setCompromissos(cRes.data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function fetchParticipantes(compromissoId: string) {
    if (!compromissoId) {
      setParticipantes([]);
      return;
    }
    setLoadingParticipantes(true);
    const compromisso = compromissos.find((c) => c.id === compromissoId);
    if (!compromisso) {
      setParticipantes([]);
      setLoadingParticipantes(false);
      return;
    }

    // Busca setores da narrativa via junction table
    const { data: setoresData } = await supabase
      .from("nct_narrativa_setores")
      .select("setor_id")
      .eq("narrativa_id", compromisso.narrativa_id);

    const setorIds = setoresData?.map((s: any) => s.setor_id) ?? [];

    // Fallback: usa setor_id direto da narrativa se junction estiver vazia
    if (setorIds.length === 0) {
      const { data: nData } = await supabase
        .from("nct_narrativas")
        .select("setor_id")
        .eq("id", compromisso.narrativa_id)
        .single();
      if (nData?.setor_id) setorIds.push(nData.setor_id);
    }

    if (setorIds.length === 0) {
      setParticipantes([]);
      setLoadingParticipantes(false);
      return;
    }

    const { data: users } = await supabase
      .from("user_profiles")
      .select("id, first_name, last_name, sector")
      .in("sector", setorIds)
      .eq("approved", true);

    setParticipantes(
      (users ?? []).map((u: any) => ({
        id: u.id,
        nome: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Sem nome",
        sector: u.sector,
      })),
    );
    setLoadingParticipantes(false);
  }

  function handleCompromissoChange(v: string) {
    setForm({ ...form, compromisso_id: v, responsavel_id: "" });
    fetchParticipantes(v);
  }

  async function handleCriar() {
    if (!form.titulo || !form.compromisso_id || !form.responsavel_id)
      return toast.error("Título, compromisso e responsável são obrigatórios.");
    setSalvando(true);
    const { error } = await supabase.from("nct_tarefas").insert({
      titulo: form.titulo,
      descricao: form.descricao || null,
      compromisso_id: form.compromisso_id,
      prioridade: form.prioridade,
      prazo_fim: form.prazo_fim || null,
      xp_reward: parseInt(form.xp_reward) || 10,
      responsavel_id: form.responsavel_id,
    });
    setSalvando(false);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Tarefa criada! +2 XP");
    await supabase.from("nct_xp_log").insert({
      usuario_id: user!.id,
      origem_tipo: "tarefa",
      xp_ganho: 2,
      motivo: "Tarefa criada",
    });
    setOpen(false);
    setForm({
      titulo: "",
      descricao: "",
      compromisso_id: "",
      responsavel_id: "",
      prioridade: "media",
      prazo_fim: "",
      xp_reward: "10",
    });
    setParticipantes([]);
    fetchData();
  }

  async function handleConcluir(tarefa: Tarefa) {
    const { error } = await supabase
      .from("nct_tarefas")
      .update({ status: "concluida", concluida_em: new Date().toISOString() })
      .eq("id", tarefa.id);
    if (error) return toast.error("Erro ao concluir tarefa.");
    const xp =
      tarefa.xp_reward +
      (tarefa.prazo_fim && diasRestantes(tarefa.prazo_fim) > 0 ? 5 : 0);
    await supabase.from("nct_xp_log").insert({
      usuario_id: user!.id,
      origem_tipo: "tarefa",
      origem_id: tarefa.id,
      xp_ganho: xp,
      motivo: "Tarefa concluída",
    });
    toast.success(`Tarefa concluída! +${xp} XP 🎉`);
    fetchData();
  }

  async function handleMoverStatus(tarefa: Tarefa, novoStatus: StatusTarefa) {
    await supabase
      .from("nct_tarefas")
      .update({ status: novoStatus })
      .eq("id", tarefa.id);
    await supabase.from("nct_xp_log").insert({
      usuario_id: user!.id,
      origem_tipo: "tarefa",
      origem_id: tarefa.id,
      xp_ganho: 1,
      motivo: "Status atualizado",
    });
    fetchData();
  }

  const tarefasFiltradas = tarefas.filter((t) => {
    const matchBusca = t.titulo.toLowerCase().includes(busca.toLowerCase());
    const matchMinhas = !somenteMinhas || t.responsavel_id === user?.id;
    return matchBusca && matchMinhas;
  });

  const porColuna = (col: StatusTarefa) =>
    tarefasFiltradas.filter((t) => t.status === col);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ListTodo className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Tarefas</h1>
            <p className="text-sm text-muted-foreground">
              O operacional que faz os compromissos avançarem.
            </p>
          </div>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Nova Tarefa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Tarefa</DialogTitle>
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
                  <Label>Compromisso *</Label>
                  <Select
                    value={form.compromisso_id}
                    onValueChange={handleCompromissoChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o compromisso" />
                    </SelectTrigger>
                    <SelectContent>
                      {compromissos.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.titulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Responsável — aparece após selecionar compromisso */}
                <div>
                  <Label>
                    Responsável *
                    {form.compromisso_id &&
                      participantes.length === 0 &&
                      !loadingParticipantes && (
                        <span className="ml-2 text-xs font-normal text-amber-500">
                          Nenhum usuário com setor vinculado encontrado
                        </span>
                      )}
                  </Label>
                  <Select
                    value={form.responsavel_id}
                    onValueChange={(v) =>
                      setForm({ ...form, responsavel_id: v })
                    }
                    disabled={!form.compromisso_id || loadingParticipantes}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          !form.compromisso_id
                            ? "Selecione o compromisso primeiro"
                            : loadingParticipantes
                              ? "Carregando participantes..."
                              : "Selecione o responsável"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {participantes.map((p) => {
                        const setor = p.sector
                          ? SETORES.find((s) => s.id === p.sector)
                          : null;
                        return (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="flex items-center gap-2">
                              {setor && (
                                <span
                                  className="inline-block h-2 w-2 rounded-full shrink-0"
                                  style={{ backgroundColor: setor.cor }}
                                />
                              )}
                              {p.nome}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Prioridade</Label>
                    <Select
                      value={form.prioridade}
                      onValueChange={(v) => setForm({ ...form, prioridade: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRIORIDADE_TAREFA).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      value={form.xp_reward}
                      onChange={(e) =>
                        setForm({ ...form, xp_reward: e.target.value })
                      }
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleCriar}
                  disabled={salvando}
                >
                  {salvando ? "Criando..." : "Criar Tarefa (+2 XP)"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar tarefa..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Button
          variant={somenteMinhas ? "default" : "outline"}
          size="sm"
          onClick={() => setSomenteMinhas(!somenteMinhas)}
        >
          <User className="h-3.5 w-3.5 mr-1.5" />
          Somente minhas
        </Button>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 overflow-x-auto">
          {COLUNAS.map((col) => {
            const info = STATUS_TAREFA[col];
            const items = porColuna(col);
            return (
              <div key={col} className="flex flex-col gap-2 min-w-[200px]">
                <div
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${info.color} text-white`}
                >
                  <span className="text-xs font-semibold">{info.label}</span>
                  <Badge
                    variant="secondary"
                    className="text-xs h-5 px-1.5 bg-white/20 text-white border-0"
                  >
                    {items.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {items.map((t) => {
                    const prio = PRIORIDADE_TAREFA[t.prioridade];
                    const dias = diasRestantes(t.prazo_fim);
                    const isMinhaT = t.responsavel_id === user?.id;
                    return (
                      <Card key={t.id} className="shadow-sm">
                        <CardContent className="pt-3 pb-3 space-y-2">
                          <p className="text-xs font-semibold leading-snug">
                            {t.titulo}
                          </p>
                          {t._compromisso && (
                            <p className="text-xs text-muted-foreground truncate">
                              {t._compromisso.titulo}
                            </p>
                          )}
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-medium ${prio.color}`}
                            >
                              {prio.label}
                            </span>
                            <span className="flex items-center gap-0.5 text-xs text-amber-500">
                              <Zap className="h-3 w-3" />
                              {t.xp_reward}
                            </span>
                          </div>
                          {t.prazo_fim && (
                            <div
                              className={`flex items-center gap-1 text-xs ${dias < 0 ? "text-red-500" : dias < 3 ? "text-amber-500" : "text-muted-foreground"}`}
                            >
                              <Calendar className="h-3 w-3" />
                              {formatarData(t.prazo_fim)}
                            </div>
                          )}
                          {t._responsavel && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              {t._responsavel.first_name}{" "}
                              {t._responsavel.last_name}
                            </div>
                          )}
                          {isMinhaT && t.status !== "concluida" && (
                            <div className="flex gap-1 pt-1 border-t">
                              {t.status !== "em_andamento" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs px-2 flex-1"
                                  onClick={() =>
                                    handleMoverStatus(t, "em_andamento")
                                  }
                                >
                                  Iniciar
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-2 text-emerald-600 flex-1"
                                onClick={() => handleConcluir(t)}
                              >
                                <CheckCircle className="h-3 w-3 mr-0.5" />
                                Concluir
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                  {items.length === 0 && (
                    <div className="rounded-lg border-2 border-dashed border-muted p-4 text-center text-xs text-muted-foreground">
                      Vazio
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
