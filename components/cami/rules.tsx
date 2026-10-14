"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Rule } from "@/lib/ghl/ai-seller/rules";
import type { RuleTestItem, SimulatedReply } from "@/lib/ghl/ai-seller/simulate";
import { cn } from "@/lib/utils";
import { MOTIVO_LABEL, fmtDateTime, label } from "./format";

interface ReferenceItem {
  id: string;
  nome: string;
  boaResposta: string | null;
  contactId: string;
  createdAt: string;
  stageName: string | null;
  at: string;
  cliente: string | null;
  mensagens: number;
}

export interface RuleDraft {
  texto: string;
  contactId: string | null;
  contactName: string | null;
}

const ORIGEM_LABEL: Record<Rule["origem"], string> = {
  manual: "Manual",
  correcao: "Correção de conversa",
  sugestao: "Sugestão da IA",
};

const DECISAO_LABEL: Record<string, string> = {
  respondeu: "Respondeu",
  nao_respondeu: "Não respondeu",
  escalou: "Passou para humano",
  erro: "Erro",
  "pulou:mensagem_nova": "Esperaria o cliente",
};

function Reply({ reply, title, highlight }: { reply: SimulatedReply; title: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-md border p-3 space-y-2 min-w-0", highlight && "border-primary/50 bg-primary/5")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        <Badge variant="outline">{DECISAO_LABEL[reply.decisao] ?? reply.decisao}</Badge>
      </div>
      {reply.mensagens.map((m, i) => (
        <p key={i} className="text-sm whitespace-pre-line rounded-md bg-muted/50 px-3 py-2">
          {m}
        </p>
      ))}
      {reply.motivo && (
        <p className="text-xs text-muted-foreground">
          {reply.decisao === "escalou" ? "Passaria para humano: " : "Motivo: "}
          {reply.decisao === "escalou" ? label(MOTIVO_LABEL, reply.motivo.split(":")[0]) : reply.motivo}
          {reply.decisao === "escalou" && reply.motivo.includes(":") && ` — ${reply.motivo.slice(reply.motivo.indexOf(":") + 1).trim()}`}
        </p>
      )}
      {reply.ferramentas.length > 0 && <p className="text-xs text-muted-foreground">Usou: {reply.ferramentas.join(", ")}</p>}
      {reply.erro && <p className="text-xs text-destructive">{reply.erro}</p>}
    </div>
  );
}

function TestResults({ items }: { items: RuleTestItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.referenceId} className="rounded-lg border p-4 space-y-3">
          <div>
            <p className="font-medium">{item.nome}</p>
            <p className="text-sm text-muted-foreground">Cliente: “{item.cliente}”</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Reply reply={item.atual} title="Hoje" />
            <Reply reply={item.comRegra} title="Com a regra" highlight />
          </div>
          {item.boaResposta && (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold">O que seria uma boa resposta:</span> {item.boaResposta}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function CamiRules({ draft, onDraftUsed }: { draft: RuleDraft | null; onDraftUsed: () => void }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [maxAtivas, setMaxAtivas] = useState(15);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  const [texto, setTexto] = useState("");
  const [origemContact, setOrigemContact] = useState<{ id: string; name: string | null } | null>(null);
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<RuleTestItem[] | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const [refContato, setRefContato] = useState("");
  const [refNome, setRefNome] = useState("");
  const [refBoa, setRefBoa] = useState("");
  const [savingRef, setSavingRef] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cami/rules", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar as regras");
      setRules(data.rules);
      setReferences(data.references);
      setMaxAtivas(data.maxAtivas);
      setCanEdit(!!data.podeEditar);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!draft) return;
    setTexto(draft.texto);
    setOrigemContact(draft.contactId ? { id: draft.contactId, name: draft.contactName } : null);
    setResults(null);
    onDraftUsed();
  }, [draft, onDraftUsed]);

  const ativas = rules.filter((r) => r.ativa).length;

  const runTest = async (body: { texto: string; replaceRuleText?: string | null }) => {
    setTesting(true);
    setResults(null);
    try {
      const res = await fetch("/api/cami/rules/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no teste");
      setResults(data.items);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const createRule = async (ativa: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/cami/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, ativa, origem: origemContact ? "correcao" : "manual", contactId: origemContact?.id ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar");
      toast.success(ativa ? "Regra ligada: vale a partir da próxima resposta da Cami" : "Regra salva desligada");
      setTexto("");
      setOrigemContact(null);
      setResults(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const patchRule = async (id: string, patch: { ativa?: boolean; texto?: string }) => {
    try {
      const res = await fetch(`/api/cami/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível alterar");
      if (patch.texto !== undefined) setEditingId(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const removeRule = async (rule: Rule) => {
    if (!window.confirm(`Apagar a regra "${rule.texto.slice(0, 80)}"?`)) return;
    try {
      const res = await fetch(`/api/cami/rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Não foi possível apagar");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const addReference = async () => {
    setSavingRef(true);
    try {
      const res = await fetch("/api/cami/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contato: refContato, nome: refNome, boaResposta: refBoa }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível guardar");
      toast.success("Referência guardada");
      setRefContato("");
      setRefNome("");
      setRefBoa("");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingRef(false);
    }
  };

  const removeReference = async (ref: ReferenceItem) => {
    if (!window.confirm(`Apagar a referência "${ref.nome}"?`)) return;
    try {
      const res = await fetch(`/api/cami/references/${ref.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Não foi possível apagar");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading) return <p className="text-center text-muted-foreground py-8">Carregando…</p>;

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova regra</CardTitle>
            <p className="text-sm text-muted-foreground">
              Uma instrução curta que vale acima do manual. Teste nas conversas de referência antes de ligar: a Cami responde
              cada uma com e sem a regra, sem mandar nada a ninguém.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {origemContact && (
              <p className="text-xs text-muted-foreground">
                A partir da conversa com {origemContact.name || "o cliente"}.
              </p>
            )}
            <Textarea
              aria-label="Texto da regra"
              rows={3}
              placeholder="Ex.: Quando o cliente pedir prazo, pergunte a data do evento antes de responder."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => runTest({ texto })}
                disabled={testing || texto.trim().length < 5 || references.length === 0}
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                Testar nas referências
              </Button>
              <Button variant="outline" onClick={() => createRule(false)} disabled={saving || texto.trim().length < 5}>
                Salvar desligada
              </Button>
              <Button onClick={() => createRule(true)} disabled={saving || texto.trim().length < 5 || ativas >= maxAtivas}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar e ligar
              </Button>
            </div>
            {references.length === 0 && (
              <p className="text-xs text-muted-foreground">Guarde uma conversa de referência abaixo para poder testar.</p>
            )}
            {testing && (
              <p className="text-sm text-muted-foreground">
                A Cami está respondendo {Math.min(references.length, 8)} conversas duas vezes. Leva até 1 minuto.
              </p>
            )}
            {results && !editingId && <TestResults items={results} />}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2">
            <span>Regras da casa</span>
            <span className="text-sm font-normal text-muted-foreground">
              {ativas} de {maxAtivas} ligadas
            </span>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Valem a partir da próxima resposta da Cami. Regra que se provou deve virar parte do manual e sair daqui.
          </p>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma regra ainda. A Cami segue só o manual.</p>
          ) : (
            <ul className="space-y-3">
              {rules.map((rule) => (
                <li key={rule.id} className={cn("rounded-lg border p-3 space-y-2", !rule.ativa && "opacity-70")}>
                  <div className="flex items-start gap-3">
                    <Switch
                      checked={rule.ativa}
                      disabled={!canEdit || (!rule.ativa && ativas >= maxAtivas)}
                      onCheckedChange={(v) => patchRule(rule.id, { ativa: v })}
                      aria-label={rule.ativa ? "Desligar regra" : "Ligar regra"}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      {editingId === rule.id ? (
                        <Textarea aria-label="Editar regra" rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
                      ) : (
                        <p className="text-sm">{rule.texto}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {ORIGEM_LABEL[rule.origem]} · atualizada {fmtDateTime(rule.updatedAt)}
                      </p>
                    </div>
                    {canEdit && editingId !== rule.id && (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Editar regra"
                          onClick={() => {
                            setEditingId(rule.id);
                            setEditText(rule.texto);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Apagar regra" onClick={() => removeRule(rule)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {editingId === rule.id && (
                    <div className="flex flex-wrap gap-2 pl-12">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={testing || references.length === 0}
                        onClick={() => runTest({ texto: editText, replaceRuleText: rule.ativa ? rule.texto : null })}
                      >
                        {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                        Testar a edição
                      </Button>
                      <Button size="sm" onClick={() => patchRule(rule.id, { texto: editText })}>
                        Salvar texto
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!canEdit && results === null && rules.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">Só o dono da conta muda as regras.</p>
          )}
          {canEdit && editingId && results && (
            <div className="mt-4">
              <TestResults items={results} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2">
            <span>Conversas de referência</span>
            <span className="text-sm font-normal text-muted-foreground">
              {references.length === 1 ? "1 guardada" : `${references.length} guardadas`} · o teste usa até 8
            </span>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Fotos de conversas até uma mensagem do cliente: preço, frete, ajuste de arte, desconto, pronto para pagar,
            reclamação, cliente que sumiu e voltou.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {references.length > 0 && (
            <ul className="space-y-2">
              {references.map((ref) => (
                <li key={ref.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{ref.nome}</p>
                    {ref.cliente && <p className="text-sm text-muted-foreground line-clamp-2">Cliente: “{ref.cliente}”</p>}
                    <p className="text-xs text-muted-foreground">
                      {ref.stageName ?? "etapa —"} · {ref.mensagens} mensagens · {fmtDateTime(ref.at)}
                    </p>
                    {ref.boaResposta && <p className="text-xs text-muted-foreground">Boa resposta: {ref.boaResposta}</p>}
                  </div>
                  {canEdit && (
                    <Button size="icon" variant="ghost" aria-label="Apagar referência" onClick={() => removeReference(ref)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEdit && (
            <div className="rounded-lg border border-dashed p-3 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Guardar uma conversa
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="ref-contato">Contato no GHL (link ou ID)</Label>
                  <Input
                    id="ref-contato"
                    placeholder="https://app.gohighlevel.com/…/contacts/detail/…"
                    value={refContato}
                    onChange={(e) => setRefContato(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ref-nome">Nome do cenário</Label>
                  <Input id="ref-nome" placeholder="Ex.: Cliente achando caro" value={refNome} onChange={(e) => setRefNome(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ref-boa">O que seria uma boa resposta (opcional)</Label>
                <Textarea id="ref-boa" rows={2} value={refBoa} onChange={(e) => setRefBoa(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Guarda a conversa até a última mensagem do cliente, com a etapa e o valor do CRM de agora.
              </p>
              <Button onClick={addReference} disabled={savingRef || !refContato.trim() || !refNome.trim()}>
                {savingRef && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar referência
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
