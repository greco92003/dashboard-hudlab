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
import {
  faixasDaPromocao,
  fmtVigencia,
  isoToLocalInput,
  localInputToIso,
  precoComPromocao,
  vigencia,
  type Aviso,
  type FaixaPromocao,
  type Promocao,
  type Vigencia,
} from "@/lib/ghl/ai-seller/vigentes";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const VIGENCIA: Record<Vigencia, { label: (fim: string, inicio: string) => string; cls: string }> = {
  agendada: { label: (_f, i) => `Agendada · começa ${fmtVigencia(i)}`, cls: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200" },
  ativa: { label: (f) => `Ativa até ${fmtVigencia(f)}`, cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  encerrada: { label: (f) => `Encerrada em ${fmtVigencia(f)}`, cls: "text-muted-foreground" },
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Hora cheia de agora e o último minuto do mês, em Brasília: o padrão de uma promoção nova. */
function defaultPeriodo(): { inicio: string; fim: string } {
  const local = new Date(Date.now() - 3 * 3600e3);
  const p = (n: number) => String(n).padStart(2, "0");
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    inicio: `${y}-${p(m)}-${p(local.getUTCDate())}T${p(local.getUTCHours())}:00:00-03:00`,
    fim: `${y}-${p(m)}-${p(lastDay)}T23:59:00-03:00`,
  };
}

function DateTimeField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (iso: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="datetime-local"
        className="w-52"
        disabled={disabled}
        value={isoToLocalInput(value)}
        onChange={(e) => {
          const iso = localInputToIso(e.target.value);
          if (iso) onChange(iso);
        }}
      />
    </div>
  );
}

function VigenciaBadge({ item }: { item: { inicio: string; fim: string } }) {
  const v = vigencia(item, Date.now());
  return (
    <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", VIGENCIA[v].cls)}>
      {VIGENCIA[v].label(item.fim, item.inicio)}
    </span>
  );
}

function VigentesCard({
  promocao,
  avisos,
  canEdit,
  saving,
  onPromocao,
  onAvisos,
  onSave,
  onRemovePromocao,
}: {
  promocao: Promocao | null;
  avisos: Aviso[];
  canEdit: boolean;
  saving: boolean;
  onPromocao: (p: Promocao | null) => void;
  onAvisos: (a: Aviso[]) => void;
  onSave: () => void;
  onRemovePromocao: () => void;
}) {
  // Prévia: o primeiro par de cada faixa, com o preço no cartão e no PIX.
  const previa = promocao
    ? faixasDaPromocao(promocao)
        .map((f) => ({ pares: Math.max(12, f.minPares), preco: precoComPromocao(Math.max(12, f.minPares), promocao) }))
        .filter((p) => p.preco?.aplicada)
    : [];
  const setP = <K extends keyof Promocao>(k: K, v: Promocao[K]) => promocao && onPromocao({ ...promocao, [k]: v });
  const faixas = promocao?.faixas ?? [];
  const setFaixa = (i: number, patch: Partial<FaixaPromocao>) =>
    setP("faixas", faixas.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const addFaixa = () => {
    if (!promocao) return;
    const ultima = faixas.at(-1) ?? { minPares: promocao.minPares, descontoPct: promocao.descontoPct };
    setP("faixas", [...faixas, { minPares: ultima.minPares + 1, descontoPct: ultima.descontoPct + 1 }]);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Regras comerciais vigentes</CardTitle>
        <p className="text-sm text-muted-foreground">
          Valem só no período e não mudam o jeito de atender da Cami. Preço, frete e prazos fixos continuam no manual.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Promoção vigente</h3>
              <p className="text-xs text-muted-foreground">Uma por vez. Termina sozinha no fim do período.</p>
            </div>
            {promocao && <VigenciaBadge item={promocao} />}
          </div>
          {!promocao ? (
            canEdit ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => onPromocao({ nome: "", ...defaultPeriodo(), descontoPct: 5, minPares: 12, texto: "" })}
              >
                <Plus className="h-4 w-4" />
                Criar promoção
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma promoção.</p>
            )
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <div className="space-y-1">
                  <Label htmlFor="promo-nome">Nome</Label>
                  <Input
                    id="promo-nome"
                    className="w-56"
                    placeholder="Ex.: Fecha Mês"
                    disabled={!canEdit}
                    value={promocao.nome}
                    onChange={(e) => setP("nome", e.target.value)}
                  />
                </div>
                <DateTimeField id="promo-inicio" label="Começa" value={promocao.inicio} disabled={!canEdit} onChange={(v) => setP("inicio", v)} />
                <DateTimeField id="promo-fim" label="Termina" value={promocao.fim} disabled={!canEdit} onChange={(v) => setP("fim", v)} />
                <div className="space-y-1">
                  <Label htmlFor="promo-desconto">Desconto nos pares (%)</Label>
                  <Input
                    id="promo-desconto"
                    type="number"
                    step="0.5"
                    min={0.5}
                    max={30}
                    className="w-28"
                    disabled={!canEdit}
                    value={promocao.descontoPct}
                    onChange={(e) => setP("descontoPct", Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="promo-minimo">A partir de (pares)</Label>
                  <Input
                    id="promo-minimo"
                    type="number"
                    min={12}
                    className="w-28"
                    disabled={!canEdit}
                    value={promocao.minPares}
                    onChange={(e) => setP("minPares", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium">Faixas com mais desconto (opcional)</p>
                  <p className="text-xs text-muted-foreground">
                    Cada faixa vale a partir da quantidade dela. Ex.: Black November com 7% a partir de 36 pares, 10% a partir de 100 e 15% a partir de 500.
                  </p>
                </div>
                {faixas.map((f, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <Label htmlFor={`promo-faixa-min-${i}`}>A partir de (pares)</Label>
                      <Input
                        id={`promo-faixa-min-${i}`}
                        type="number"
                        min={13}
                        className="w-28"
                        disabled={!canEdit}
                        value={f.minPares}
                        onChange={(e) => setFaixa(i, { minPares: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`promo-faixa-pct-${i}`}>Desconto nos pares (%)</Label>
                      <Input
                        id={`promo-faixa-pct-${i}`}
                        type="number"
                        step="0.5"
                        min={0.5}
                        max={30}
                        className="w-28"
                        disabled={!canEdit}
                        value={f.descontoPct}
                        onChange={(e) => setFaixa(i, { descontoPct: Number(e.target.value) })}
                      />
                    </div>
                    {canEdit && (
                      <Button type="button" variant="ghost" onClick={() => setP("faixas", faixas.filter((_, j) => j !== i))}>
                        Remover faixa
                      </Button>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <Button type="button" variant="outline" onClick={addFaixa}>
                    <Plus className="h-4 w-4" />
                    Adicionar faixa
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Sempre acumula com os 5% do PIX, que é desconto pela forma de pagamento.</p>
              <div className="space-y-1">
                <Label htmlFor="promo-texto">Como a Cami apresenta (opcional)</Label>
                <Textarea
                  id="promo-texto"
                  rows={2}
                  disabled={!canEdit}
                  placeholder="Ex.: Fecha Mês: 5% de desconto nos pares para pedidos fechados até 31/10."
                  value={promocao.texto}
                  onChange={(e) => setP("texto", e.target.value)}
                />
              </div>
              {previa.length > 0 && (
                <div className="space-y-1 rounded-lg border border-dashed p-3 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">No orçamento da Cami (preço do par)</p>
                  {previa.map(({ pares, preco }) =>
                    preco ? (
                      <p key={pares}>
                        {pares} pares: {brl(preco.unitarioCheio)} → <strong>{brl(preco.unitario)}</strong> no cartão ({preco.descontoPct}%)
                        {" · "}
                        <strong>{brl(preco.pixUnitario)}</strong> no PIX ({preco.pixDescontoPct}%)
                      </p>
                    ) : null,
                  )}
                </div>
              )}
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={onSave} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Salvar promoção
                  </Button>
                  <Button type="button" variant="outline" onClick={onRemovePromocao} disabled={saving}>
                    Remover promoção
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Avisos com prazo</h3>
            <p className="text-xs text-muted-foreground">
              Mesma ideia, sem desconto. Ex.: &quot;Férias coletivas: prazos de produção contam a partir de 06/01&quot;.
            </p>
          </div>
          {avisos.length === 0 && !canEdit && <p className="text-sm text-muted-foreground">Nenhum aviso.</p>}
          {avisos.map((a, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <VigenciaBadge item={a} />
                {canEdit && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover aviso ${i + 1}`}
                    onClick={() => onAvisos(avisos.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <Input
                aria-label={`Texto do aviso ${i + 1}`}
                disabled={!canEdit}
                value={a.texto}
                placeholder="O que a Cami precisa saber neste período"
                onChange={(e) => onAvisos(avisos.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))}
              />
              <div className="flex flex-wrap gap-4">
                <DateTimeField
                  id={`aviso-inicio-${i}`}
                  label="Começa"
                  value={a.inicio}
                  disabled={!canEdit}
                  onChange={(v) => onAvisos(avisos.map((x, j) => (j === i ? { ...x, inicio: v } : x)))}
                />
                <DateTimeField
                  id={`aviso-fim-${i}`}
                  label="Termina"
                  value={a.fim}
                  disabled={!canEdit}
                  onChange={(v) => onAvisos(avisos.map((x, j) => (j === i ? { ...x, fim: v } : x)))}
                />
              </div>
            </div>
          ))}
          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onAvisos([...avisos, { texto: "", ...defaultPeriodo() }])}
            >
              <Plus className="h-4 w-4" />
              Adicionar aviso
            </Button>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

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

  const save = async (next: SellerSettings = form) => {
    setSaving(true);
    try {
      const res = await fetch("/api/cami/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
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

      <VigentesCard
        promocao={form.promocao}
        avisos={form.avisos}
        canEdit={canEdit}
        saving={saving}
        onPromocao={(p) => set("promocao", p)}
        onAvisos={(a) => set("avisos", a)}
        onSave={() => void save()}
        onRemovePromocao={() => {
          // Remover vale na hora: a Cami para de dar o desconto já na próxima resposta.
          const next = { ...form, promocao: null };
          setForm(next);
          void save(next);
        }}
      />

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
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar Controle
          </Button>
        </div>
      )}
    </div>
  );
}
