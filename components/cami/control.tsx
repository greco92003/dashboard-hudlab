"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SellerSettings } from "@/lib/ghl/ai-seller/settings-shape";
import { cn } from "@/lib/utils";

const ESTADOS: Array<{ id: SellerSettings["estado"]; titulo: string; texto: string }> = [
  { id: "ligada", titulo: "Ligada", texto: "Assume clientes novos na faixa de pares e responde quem já está com ela." },
  {
    id: "nao_pega_novos",
    titulo: "Não pega clientes novos",
    texto: "Termina os atendimentos atuais; amostras novas ficam com o time.",
  },
  {
    id: "desligada",
    titulo: "Desligada",
    texto: "Não responde ninguém: o cliente que escrever vai para quem recebe as passagens, sem mensagem da IA.",
  },
];

interface GhlUser {
  id: string;
  name: string;
}

export function CamiControl({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState<SellerSettings | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [users, setUsers] = useState<GhlUser[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/cami/settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setForm(data.settings);
        setCanEdit(!!data.podeEditar);
        if (data.podeEditar) {
          fetch("/api/cami/ghl-users", { cache: "no-store" })
            .then((res) => res.json())
            .then((u) => setUsers(u.users ?? []))
            .catch(() => setUsers([]));
        }
      })
      .catch((err) => toast.error((err as Error).message || "Não foi possível ler o Controle"));
  }, []);

  if (!form) {
    return <p className="text-center text-muted-foreground py-8"><Loader2 className="inline h-4 w-4 animate-spin" /> Carregando…</p>;
  }

  const set = <K extends keyof SellerSettings>(key: K, value: SellerSettings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/cami/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar");
      setForm(data.settings);
      toast.success("Controle salvo");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const shifts = form.shifts.map((s) => [...s] as [string, string]);

  return (
    <div className="space-y-4 max-w-3xl">
      {!canEdit && (
        <p className="text-sm text-muted-foreground">Só o dono da conta muda o Controle. Você está vendo como está agora.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado da Cami</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset className="grid gap-3 sm:grid-cols-3" disabled={!canEdit}>
            <legend className="sr-only">Estado da Cami</legend>
            {ESTADOS.map((e) => (
              <label
                key={e.id}
                className={cn(
                  "cursor-pointer rounded-lg border p-3 space-y-1 has-[:disabled]:cursor-default",
                  form.estado === e.id
                    ? e.id === "desligada"
                      ? "border-destructive bg-destructive/5"
                      : "border-primary bg-primary/5"
                    : "hover:bg-muted/40",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="estado"
                    value={e.id}
                    checked={form.estado === e.id}
                    onChange={() => set("estado", e.id)}
                  />
                  {e.titulo}
                </span>
                <span className="block text-xs text-muted-foreground">{e.texto}</span>
              </label>
            ))}
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faixa de pares</CardTitle>
          <p className="text-sm text-muted-foreground">
            A Cami assume a amostra entregue quando o pedido está nesta faixa. Mínimo de 12 (pedido mínimo).
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="min-pares">De</Label>
            <Input
              id="min-pares"
              type="number"
              min={12}
              className="w-28"
              disabled={!canEdit}
              value={form.minPares}
              onChange={(e) => set("minPares", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="max-pares">Até</Label>
            <Input
              id="max-pares"
              type="number"
              min={12}
              className="w-28"
              disabled={!canEdit}
              value={form.maxPares}
              onChange={(e) => set("maxPares", Number(e.target.value))}
            />
          </div>
          <span className="text-sm text-muted-foreground pb-2">pares</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quem recebe as passagens</CardTitle>
          <p className="text-sm text-muted-foreground">
            A Cami atribui o contato a esta pessoa no GHL e diz esse nome ao cliente. Fora dos turnos, avisa quando a pessoa volta.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1 min-w-56">
              <Label>Pessoa no GHL</Label>
              <Select
                disabled={!canEdit || users.length === 0}
                value={form.escalationUserId ?? ""}
                onValueChange={(id) => {
                  const user = users.find((u) => u.id === id);
                  setForm((f) =>
                    f ? { ...f, escalationUserId: id, escalationName: user ? user.name.split(" ")[0] : f.escalationName } : f,
                  );
                }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Padrão do servidor" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="escalation-name">Nome que a Cami usa com o cliente</Label>
              <Input
                id="escalation-name"
                className="w-56"
                disabled={!canEdit}
                value={form.escalationName}
                onChange={(e) => set("escalationName", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Turnos (segunda a sexta, horário de Brasília)</Label>
            {shifts.map(([start, end], i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="time"
                  aria-label={`Início do turno ${i + 1}`}
                  className="w-32"
                  disabled={!canEdit}
                  value={start}
                  onChange={(e) => {
                    const next = shifts.map((s) => [...s] as [string, string]);
                    next[i][0] = e.target.value;
                    set("shifts", next);
                  }}
                />
                <span className="text-muted-foreground">às</span>
                <Input
                  type="time"
                  aria-label={`Fim do turno ${i + 1}`}
                  className="w-32"
                  disabled={!canEdit}
                  value={end}
                  onChange={(e) => {
                    const next = shifts.map((s) => [...s] as [string, string]);
                    next[i][1] = e.target.value;
                    set("shifts", next);
                  }}
                />
                {canEdit && shifts.length > 1 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover turno ${i + 1}`}
                    onClick={() => set("shifts", shifts.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {canEdit && (
              <Button type="button" size="sm" variant="outline" onClick={() => set("shifts", [...shifts, ["14:00", "18:00"]])}>
                <Plus className="h-4 w-4" />
                Adicionar turno
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertas</CardTitle>
          <p className="text-sm text-muted-foreground">
            Chegam no sininho do dashboard e no celular de quem ativou as notificações. Quem recebe a passagem é avisado na
            hora (fora do turno, no início do turno seguinte); os prazos abaixo contam só minutos dos turnos acima.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label htmlFor="alerta-pessoa">Lembrar quem recebe, sem resposta após (min)</Label>
              <Input
                id="alerta-pessoa"
                type="number"
                min={15}
                className="w-36"
                disabled={!canEdit}
                value={form.alertas.passagemSemRespostaMin}
                onChange={(e) => set("alertas", { ...form.alertas, passagemSemRespostaMin: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="alerta-owner">Avisar você após (min)</Label>
              <Input
                id="alerta-owner"
                type="number"
                min={15}
                className="w-36"
                disabled={!canEdit}
                value={form.alertas.ownerAposMin}
                onChange={(e) => set("alertas", { ...form.alertas, ownerAposMin: Number(e.target.value) })}
              />
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={form.alertas.resumoDiario}
              disabled={!canEdit}
              onCheckedChange={(v) => set("alertas", { ...form.alertas, resumoDiario: v })}
              aria-label="Resumo diário"
            />
            Resumo do dia às 18h30 (segunda a sexta), só quando a Cami atendeu alguém
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custo do modelo</CardTitle>
          <p className="text-sm text-muted-foreground">
            Usado só para estimar o custo na Visão geral. Preço em dólar por milhão de tokens.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          {(
            [
              ["entradaUsdPorMilhao", "Entrada (US$/milhão)"],
              ["saidaUsdPorMilhao", "Saída (US$/milhão)"],
              ["dolar", "Dólar (R$)"],
            ] as const
          ).map(([key, text]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`custo-${key}`}>{text}</Label>
              <Input
                id={`custo-${key}`}
                type="number"
                step="0.01"
                min={0}
                className="w-36"
                disabled={!canEdit}
                value={form.custo[key]}
                onChange={(e) => set("custo", { ...form.custo, [key]: Number(e.target.value) })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar Controle
          </Button>
        </div>
      )}
    </div>
  );
}
