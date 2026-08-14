"use client";

import { useEffect, useState } from "react";
import { Building2, CheckCircle2, Loader2, Pencil, Save, SearchCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ErpContactDraft } from "@/lib/erp/contact-rules";
import type { ErpContactPreview } from "@/lib/erp/types";

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Erro inesperado.");
  return body as T;
}

type Props = {
  contactId: string;
  onReadyChange: (ready: boolean) => void;
  onTinyContactIdChange: (tinyContactId: number | null) => void;
  onContactDraftChange: (draft: ErpContactDraft | null) => void;
};

export function ContactImportCard({ contactId, onReadyChange, onTinyContactIdChange, onContactDraftChange }: Props) {
  const [draft, setDraft] = useState<ErpContactDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState<ErpContactDraft | null>(null);
  const [existing, setExisting] = useState<ErpContactPreview["existingTinyContact"]>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [editingExisting, setEditingExisting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setDraft(null);
    setSavedDraft(null);
    setExisting(null);
    setReady(false);
    setEditingExisting(false);
    onReadyChange(false);
    onTinyContactIdChange(null);
    onContactDraftChange(null);
    apiJson<ErpContactPreview>(`/api/erp/ghl/contacts/${encodeURIComponent(contactId)}/tiny-preview`)
      .then((data) => {
        if (!active) return;
        setDraft(data.draft);
        setSavedDraft(data.draft);
        onContactDraftChange(data.draft);
        setExisting(data.existingTinyContact);
        const isReady = Boolean(data.existingTinyContact);
        setReady(isReady);
        onReadyChange(isReady);
        onTinyContactIdChange(data.existingTinyContact?.id ?? null);
      })
      .catch((error) => active && toast.error(error.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [contactId, onReadyChange, onTinyContactIdChange, onContactDraftChange]);

  const update = <K extends keyof ErpContactDraft>(key: K, value: ErpContactDraft[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setReady(false);
    onReadyChange(false);
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const result = await apiJson<{ id: number | null; action: "created" | "updated"; contributorApplied: boolean }>("/api/erp/tiny/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      setExisting({ id: result.id ?? existing?.id ?? 0, name: draft.name, fantasy: draft.fantasy, document: draft.document });
      setSavedDraft(draft);
      setEditingExisting(false);
      setReady(true);
      onReadyChange(true);
      onTinyContactIdChange(result.id);
      onContactDraftChange(draft);
      toast.success(result.action === "created" ? "Cliente cadastrado no Tiny." : "Cliente atualizado no Tiny; o contribuinte existente foi preservado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar o cliente.");
    } finally {
      setSaving(false);
    }
  };

  const consultFiscal = async () => {
    if (!draft || fiscalLoading) return;
    if (!draft.state) return toast.error("Informe a UF antes da consulta fiscal.");
    setFiscalLoading(true);
    try {
      const result = await apiJson<{
        stateRegistration: string;
        municipalRegistration: string;
        contributor: "1" | "2" | "9" | null;
        type: string;
        cached: boolean;
        source: "tiny" | "sintegrapi";
      }>(
        "/api/erp/fiscal/sintegra",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cnpj: draft.document, state: draft.state, name: draft.name }),
        },
      );
      setDraft((current) => current ? {
        ...current,
        stateRegistration: result.stateRegistration || current.stateRegistration,
        municipalRegistration: result.municipalRegistration || current.municipalRegistration,
        contributor: result.contributor ?? current.contributor,
      } : current);
      setReady(false);
      onReadyChange(false);
      toast.success(
        result.source === "tiny"
          ? "Dados fiscais encontrados no cadastro existente do Tiny."
          : result.stateRegistration
            ? `Inscrição estadual localizada na SintegrAPI${result.cached ? " em cache" : ""}.`
            : "Nenhuma inscrição estadual ativa foi localizada.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na consulta fiscal.", { duration: 8000 });
    } finally {
      setFiscalLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">3</span>
              Cliente no Tiny
            </CardTitle>
            <CardDescription className="mt-1">{existing ? "Cadastro localizado no Tiny e pronto para o pedido." : "Revise os dados importados do GHL antes de cadastrar produtos."}</CardDescription>
          </div>
          {ready ? <Badge className="bg-emerald-600"><CheckCircle2 /> {existing ? `Tiny ID ${existing.id}` : "Cliente verificado"}</Badge>
            : existing ? <Badge variant="secondary"><Building2 /> Tiny ID {existing.id}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent>
        {loading || !draft ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando contato e verificando duplicidade…</div>
        ) : (
          <div className="space-y-5">
            {existing && (
              <div className="flex gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div><p className="font-medium">Cliente já cadastrado no Tiny.</p><p className="text-xs text-muted-foreground">O cadastro Tiny ID {existing.id} será utilizado na criação do pedido. Não é necessário cadastrar ou atualizar este cliente novamente.</p></div>
              </div>
            )}

            {existing && !editingExisting ? (
              <ExistingTinyContact draft={draft} tinyId={existing.id} onEdit={() => { setEditingExisting(true); setReady(false); onReadyChange(false); }} />
            ) : (
              <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Field label={draft.personType === "J" ? "Razão social" : "Nome e sobrenome"} className="lg:col-span-2"><Input value={draft.name} maxLength={50} onChange={(e) => update("name", e.target.value)} /></Field>
              <Field label="Tipo de pessoa">
                <Select value={draft.personType} onValueChange={(value: "F" | "J") => update("personType", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="F">Pessoa física</SelectItem><SelectItem value="J">Pessoa jurídica</SelectItem></SelectContent></Select>
              </Field>
              <Field label={draft.personType === "J" ? "CNPJ" : "CPF"}><Input value={draft.document} maxLength={18} onChange={(e) => update("document", e.target.value)} /></Field>
              {draft.personType === "J" && <Field label="Nome fantasia" className="lg:col-span-2"><Input value={draft.fantasy} maxLength={60} onChange={(e) => update("fantasy", e.target.value)} /></Field>}
              <Field label="Contribuinte">
                <Select value={draft.contributor} onValueChange={(value: ErpContactDraft["contributor"]) => update("contributor", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">0 - Não informado</SelectItem><SelectItem value="1">1 - Contribuinte ICMS</SelectItem><SelectItem value="2">2 - Contribuinte isento</SelectItem><SelectItem value="9">9 - Não contribuinte</SelectItem></SelectContent></Select>
              </Field>
              <Field label="Inscrição estadual"><Input value={draft.stateRegistration} maxLength={18} onChange={(e) => update("stateRegistration", e.target.value)} /></Field>
              <Field label="Inscrição municipal"><Input value={draft.municipalRegistration} maxLength={18} onChange={(e) => update("municipalRegistration", e.target.value)} /></Field>
              {draft.personType === "J" && <div className="flex items-end lg:col-span-2"><Button type="button" variant="outline" onClick={() => void consultFiscal()} disabled={fiscalLoading}>{fiscalLoading ? <Loader2 className="animate-spin" /> : <SearchCheck />}Consultar cadastro fiscal</Button><span className="ml-3 text-xs text-muted-foreground">Tiny primeiro; Sintegra somente como fallback.</span></div>}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
              <Field label="Endereço" className="lg:col-span-3"><Input value={draft.address} maxLength={50} onChange={(e) => update("address", e.target.value)} /></Field>
              <Field label="Número"><Input value={draft.number} maxLength={10} onChange={(e) => update("number", e.target.value)} /></Field>
              <Field label="Complemento" className="lg:col-span-2"><Input value={draft.complement} maxLength={50} onChange={(e) => update("complement", e.target.value)} /></Field>
              <Field label="Bairro" className="lg:col-span-2"><Input value={draft.neighborhood} maxLength={30} onChange={(e) => update("neighborhood", e.target.value)} /></Field>
              <Field label="CEP"><Input value={draft.postalCode} maxLength={10} onChange={(e) => update("postalCode", e.target.value)} /></Field>
              <Field label="Cidade" className="lg:col-span-2"><Input value={draft.city} maxLength={30} onChange={(e) => update("city", e.target.value)} /></Field>
              <Field label="UF"><Input value={draft.state} maxLength={2} onChange={(e) => update("state", e.target.value.toUpperCase())} /></Field>
              <Field label="País" className="lg:col-span-2"><Input value={draft.country} maxLength={30} onChange={(e) => update("country", e.target.value)} /></Field>
              <Field label="Telefone" className="lg:col-span-2"><Input value={draft.phone} maxLength={30} onChange={(e) => update("phone", e.target.value)} /></Field>
              <Field label="E-mail" className="lg:col-span-2"><Input type="email" value={draft.email} maxLength={50} onChange={(e) => update("email", e.target.value)} /></Field>
              <Field label="E-mail NFe" className="lg:col-span-2"><Input type="email" value={draft.emailNfe} maxLength={50} onChange={(e) => update("emailNfe", e.target.value)} /></Field>
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-lg bg-muted/30 p-4 sm:flex-row sm:items-center">
              <p className="text-xs text-muted-foreground">{ready ? "Cliente pronto. O cadastro de produtos está liberado." : "Salve ou confirme este cliente antes de cadastrar os produtos."}</p>
              <div className="flex gap-2">
                {existing && <Button variant="outline" onClick={() => { setDraft(savedDraft); onContactDraftChange(savedDraft); setEditingExisting(false); setReady(true); onReadyChange(true); }} disabled={saving}><X />Cancelar</Button>}
                <Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{existing ? "Salvar alterações no Tiny" : "Cadastrar cliente no Tiny"}</Button>
              </div>
            </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={`space-y-2 ${className}`}><Label>{label}</Label>{children}</div>;
}

function ExistingTinyContact({ draft, tinyId, onEdit }: { draft: ErpContactDraft; tinyId: number; onEdit: () => void }) {
  const address = [draft.address, draft.number, draft.complement].filter(Boolean).join(", ");
  const location = [draft.neighborhood, draft.city, draft.state, draft.postalCode].filter(Boolean).join(" · ");
  return (
    <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <p className="font-medium">Cadastro do Tiny</p>
        <Badge variant="outline">ID {tinyId}</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TinyValue label={draft.personType === "J" ? "Razão social" : "Nome"} value={draft.name} />
        {draft.fantasy && <TinyValue label="Nome fantasia" value={draft.fantasy} />}
        <TinyValue label={draft.personType === "J" ? "CNPJ" : "CPF"} value={draft.document} />
        <TinyValue label="Tipo de pessoa" value={draft.personType === "J" ? "Pessoa jurídica" : "Pessoa física"} />
        <TinyValue label="Endereço" value={address} className="lg:col-span-2" />
        <TinyValue label="Localidade" value={location} className="lg:col-span-2" />
        <TinyValue label="Telefone" value={draft.phone} />
        <TinyValue label="E-mail" value={draft.email} />
        <TinyValue label="Inscrição estadual" value={draft.stateRegistration} />
        <TinyValue label="Inscrição municipal" value={draft.municipalRegistration} />
      </div>
      <div className="flex flex-col justify-between gap-3 rounded-lg bg-emerald-500/10 p-3 sm:flex-row sm:items-center">
        <p className="text-xs text-emerald-700 dark:text-emerald-300">Cliente confirmado. Este ID ficará vinculado ao pedido.</p>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}><Pencil />Editar cliente</Button>
      </div>
    </div>
  );
}

function TinyValue({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value || "Não informado"}</p>
    </div>
  );
}
