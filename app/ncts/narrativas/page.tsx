"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Search,
  Target,
  Users,
  Calendar,
  Zap,
  ImagePlus,
  X,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  SETORES,
  getSetor,
  STATUS_NARRATIVA,
  formatarData,
  diasRestantes,
} from "@/lib/ncts";

type SetorInfo = { id: string; nome: string; cor: string };

type Narrativa = {
  id: string;
  titulo: string;
  descricao: string | null;
  setor_id: string;
  status: string;
  progresso: number;
  prazo_fim: string | null;
  xp_total: number;
  logo_url: string | null;
  criado_por: string | null;
  lider_id: string | null;
  _setores: SetorInfo[];
  _compromissos?: number;
  _participantes?: number;
  _lider?: { first_name: string | null; last_name: string | null } | null;
};

export default function NctsNarrativasPage() {
  const { user } = useAuth();
  const {
    isAdmin,
    isOwner,
    isTeamLeader,
    getSectorManaged,
    canManageNarrativas,
  } = usePermissions();
  const supabase = useMemo(() => createClient(), []);
  const [narrativas, setNarrativas] = useState<Narrativa[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [criandoOpen, setCriandoOpen] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    prazo_fim: "",
    xp_total: "100",
  });
  const [setoresSelecionados, setSetoresSelecionados] = useState<string[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Team leader context
  const sectorManaged = getSectorManaged();

  const canCreate = canManageNarrativas;

  // For team leaders, initialize the sector filter and form sector to their managed sector
  useEffect(() => {
    if (isTeamLeader && sectorManaged) {
      setFiltroSetor(sectorManaged);
      setSetoresSelecionados([sectorManaged]);
    }
  }, [isTeamLeader, sectorManaged]);

  function toggleSetor(id: string) {
    setSetoresSelecionados((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  const fetchNarrativas = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("nct_narrativas")
      .select(
        "*, nct_compromissos(id), nct_narrativa_participantes(id), lider:lider_id(first_name, last_name), nct_narrativa_setores(setor_id)",
      )
      .order("created_at", { ascending: false });
    if (data) {
      setNarrativas(
        data.map((n: any) => {
          // Monta lista de setores a partir da junction table (fallback para setor_id)
          const setorIds: string[] =
            (n.nct_narrativa_setores ?? []).map((s: any) => s.setor_id).length >
            0
              ? (n.nct_narrativa_setores ?? []).map((s: any) => s.setor_id)
              : n.setor_id
                ? [n.setor_id]
                : [];
          const _setores: SetorInfo[] = setorIds
            .map((id) => getSetor(id))
            .filter(Boolean) as SetorInfo[];
          return {
            ...n,
            _setores,
            _compromissos: n.nct_compromissos?.length ?? 0,
            _participantes: n.nct_narrativa_participantes?.length ?? 0,
            _lider: n.lider,
          };
        }),
      );
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchNarrativas();
  }, [fetchNarrativas]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024)
      return toast.error("Imagem deve ter no máximo 2MB.");
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function handleRemoveLogo() {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCriar() {
    if (!form.titulo || setoresSelecionados.length === 0)
      return toast.error("Título e pelo menos um setor são obrigatórios.");
    setSalvando(true);

    // Upload logo se houver
    let logoUrl: string | null = null;
    if (logoFile) {
      const ext = logoFile.name.split(".").pop();
      const fileName = `logos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("nct-narrativas")
        .upload(fileName, logoFile, { cacheControl: "3600", upsert: false });
      if (uploadError) {
        setSalvando(false);
        return toast.error("Erro ao enviar logo: " + uploadError.message);
      }
      const { data: urlData } = supabase.storage
        .from("nct-narrativas")
        .getPublicUrl(fileName);
      logoUrl = urlData.publicUrl;
    }

    const { data: novaRow, error } = await supabase
      .from("nct_narrativas")
      .insert({
        titulo: form.titulo,
        descricao: form.descricao || null,
        setor_id: setoresSelecionados[0], // setor principal = primeiro selecionado
        prazo_fim: form.prazo_fim || null,
        xp_total: parseInt(form.xp_total) || 100,
        criado_por: user!.id,
        lider_id: user!.id,
        logo_url: logoUrl,
      })
      .select("id")
      .single();

    if (error || !novaRow) {
      setSalvando(false);
      return toast.error("Erro ao criar narrativa: " + error?.message);
    }

    // Inserir todos os setores na junction table
    await supabase.from("nct_narrativa_setores").insert(
      setoresSelecionados.map((setor_id) => ({
        narrativa_id: novaRow.id,
        setor_id,
      })),
    );

    setSalvando(false);
    toast.success("Narrativa criada!");
    setCriandoOpen(false);
    setForm({ titulo: "", descricao: "", prazo_fim: "", xp_total: "100" });
    // Restore sector for team leaders
    setSetoresSelecionados(
      isTeamLeader && sectorManaged ? [sectorManaged] : [],
    );
    handleRemoveLogo();
    fetchNarrativas();
  }

  const filtradas = narrativas.filter((n) => {
    const matchBusca = n.titulo.toLowerCase().includes(busca.toLowerCase());
    // Team leaders can only see their own sector's narrativas
    const effectiveFiltroSetor =
      isTeamLeader && sectorManaged ? sectorManaged : filtroSetor;
    const matchSetor =
      effectiveFiltroSetor === "todos" ||
      n._setores.some((s) => s.id === effectiveFiltroSetor);
    const matchStatus = filtroStatus === "todos" || n.status === filtroStatus;
    return matchBusca && matchSetor && matchStatus;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Target className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Narrativas</h1>
            <p className="text-sm text-muted-foreground">
              Os objetivos macro da organização.
            </p>
          </div>
        </div>
        {canCreate && (
          <Dialog open={criandoOpen} onOpenChange={setCriandoOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Nova Narrativa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Narrativa</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Título *</Label>
                  <Input
                    value={form.titulo}
                    onChange={(e) =>
                      setForm({ ...form, titulo: e.target.value })
                    }
                    placeholder="Ex: Melhorar eficiência comercial"
                  />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea
                    value={form.descricao}
                    onChange={(e) =>
                      setForm({ ...form, descricao: e.target.value })
                    }
                    rows={3}
                  />
                </div>

                {/* Logo upload */}
                <div>
                  <Label>Logo / Ícone</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                  {logoPreview ? (
                    <div className="relative mt-1.5 inline-flex">
                      <img
                        src={logoPreview}
                        alt="Preview do logo"
                        className="h-20 w-20 rounded-xl object-cover border"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 p-5 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-muted/40 transition-colors"
                    >
                      <ImagePlus className="h-5 w-5" />
                      Clique para adicionar um logo (max. 2MB)
                    </button>
                  )}
                </div>

                <div>
                  <Label>
                    Setores *{" "}
                    <span className="text-muted-foreground font-normal">
                      (selecione um ou mais)
                    </span>
                  </Label>
                  {/* Team leaders get their sector locked - cannot change */}
                  {isTeamLeader && sectorManaged ? (
                    <div className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-muted text-sm">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: getSetor(sectorManaged)?.cor,
                        }}
                      />
                      <span>{getSetor(sectorManaged)?.nome}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        (fixo)
                      </span>
                    </div>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="mt-1.5 flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs hover:bg-muted/50 transition-colors"
                        >
                          <span
                            className={
                              setoresSelecionados.length === 0
                                ? "text-muted-foreground"
                                : ""
                            }
                          >
                            {setoresSelecionados.length === 0
                              ? "Selecione os setores..."
                              : `${setoresSelecionados.length} setor${setoresSelecionados.length > 1 ? "es" : ""} selecionado${setoresSelecionados.length > 1 ? "s" : ""}`}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        <div className="space-y-1">
                          {SETORES.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-muted cursor-pointer"
                              onClick={() => toggleSetor(s.id)}
                            >
                              <Checkbox
                                checked={setoresSelecionados.includes(s.id)}
                                onCheckedChange={() => toggleSetor(s.id)}
                              />
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: s.cor }}
                              />
                              <span className="text-sm">{s.nome}</span>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                  {/* Badges dos setores selecionados */}
                  {setoresSelecionados.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {setoresSelecionados.map((id) => {
                        const s = getSetor(id);
                        return s ? (
                          <span
                            key={id}
                            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white font-medium"
                            style={{ backgroundColor: s.cor }}
                          >
                            {s.nome}
                            <X
                              className="h-3 w-3 cursor-pointer opacity-80 hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSetor(id);
                              }}
                            />
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                    <Label>XP Total</Label>
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
                  {salvando ? "Criando..." : "Criar Narrativa"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar narrativa..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        {/* Team leaders see only their sector - no sector filter shown */}
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
              <SelectValue />
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
            <SelectItem value="concluida">Concluída</SelectItem>
            <SelectItem value="pausada">Pausada</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid de cards */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))
        ) : filtradas.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Target className="h-12 w-12 opacity-20" />
            <p>Nenhuma narrativa encontrada.</p>
            {canCreate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCriandoOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Criar primeira narrativa
              </Button>
            )}
          </div>
        ) : (
          filtradas.map((n) => {
            const setorPrincipal = n._setores[0] ?? null;
            const status =
              STATUS_NARRATIVA[n.status as keyof typeof STATUS_NARRATIVA];
            const dias = diasRestantes(n.prazo_fim);
            const liderNome = n._lider
              ? `${n._lider.first_name ?? ""} ${n._lider.last_name ?? ""}`.trim()
              : null;
            return (
              <Link href={`/ncts/narrativas/${n.id}`} key={n.id}>
                <Card
                  className="h-full hover:shadow-md transition-shadow cursor-pointer border-l-4"
                  style={{ borderLeftColor: setorPrincipal?.cor ?? "#6b7280" }}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-3">
                      {/* Logo */}
                      {n.logo_url ? (
                        <img
                          src={n.logo_url}
                          alt={n.titulo}
                          className="h-10 w-10 rounded-lg object-cover shrink-0 border"
                        />
                      ) : (
                        <div
                          className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center text-white text-lg font-bold"
                          style={{
                            backgroundColor: setorPrincipal?.cor ?? "#6b7280",
                          }}
                        >
                          {n.titulo[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-sm font-semibold leading-snug">
                            {n.titulo}
                          </CardTitle>
                          {status && (
                            <Badge
                              variant="outline"
                              className={`text-xs shrink-0 border-0 text-white ${status.color}`}
                            >
                              {status.label}
                            </Badge>
                          )}
                        </div>
                        {/* Múltiplos setores como pills coloridos */}
                        {n._setores.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {n._setores.map((s) => (
                              <span
                                key={s.id}
                                className="text-xs px-1.5 py-0.5 rounded-full text-white font-medium"
                                style={{ backgroundColor: s.cor }}
                              >
                                {s.nome}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Progresso</span>
                        <span>{n.progresso}%</span>
                      </div>
                      <Progress value={n.progresso} className="h-1.5" />
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        {n._compromissos} comp.
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {n._participantes} part.
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3 text-amber-400" />
                        {n.xp_total} XP
                      </span>
                    </div>
                    {n.prazo_fim && (
                      <div
                        className={`flex items-center gap-1 text-xs ${dias < 7 && dias >= 0 ? "text-amber-500" : dias < 0 ? "text-red-500" : "text-muted-foreground"}`}
                      >
                        <Calendar className="h-3 w-3" />
                        Prazo: {formatarData(n.prazo_fim)}
                        {dias < 0
                          ? " (atrasado)"
                          : dias < 7
                            ? ` (${dias}d)`
                            : ""}
                      </div>
                    )}
                    {liderNome && (
                      <p className="text-xs text-muted-foreground">
                        Líder: {liderNome}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
