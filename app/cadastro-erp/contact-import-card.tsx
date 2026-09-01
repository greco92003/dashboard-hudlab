"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Building2, CheckCircle2, Loader2, Pencil, Save, SearchCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TINY_CONTACT_LIMITS, type ErpContactDraft } from "@/lib/erp/contact-rules";
import type { ErpContactPreview } from "@/lib/erp/types";

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error || "Erro inesperado.", body.fieldErrors);
  return body as T;
}

type ContactFieldErrors = Partial<Record<keyof ErpContactDraft, string>>;

class ApiError extends Error {
  fieldErrors: ContactFieldErrors;

  constructor(message: string, fieldErrors?: ContactFieldErrors) {
    super(message);
    this.name = "ApiError";
    this.fieldErrors = fieldErrors ?? {};
  }
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
  const [saveError, setSaveError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setDraft(null);
    setSavedDraft(null);
    setExisting(null);
    setReady(false);
    setEditingExisting(false);
    setSaveError("");
    setFieldErrors({});
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
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setSaveError("");
    setReady(false);
    onReadyChange(false);
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setSaveError("");
    setFieldErrors({});
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
      const message = error instanceof Error ? error.message : "Falha ao salvar o cliente.";
      setSaveError(message);
      if (error instanceof ApiError) setFieldErrors(error.fieldErrors);
      toast.error(message, { duration: 8000 });
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
            {saveError && (
              <div className="flex gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Não foi possível salvar o cliente</p>
                  <p className="mt-1">{saveError}</p>
                  {Object.keys(fieldErrors).length > 0 && <p className="mt-1 text-xs">Os campos que precisam de correção estão destacados abaixo.</p>}
                </div>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Field label={draft.personType === "J" ? "Razão social" : "Nome e sobrenome"} required className="lg:col-span-2"><LimitedInput value={draft.name} limit={TINY_CONTACT_LIMITS.name} error={fieldErrors.name} onChange={(e) => update("name", e.target.value)} /></Field>
              <Field label="Tipo de pessoa" required error={fieldErrors.personType}>
                <Select value={draft.personType} onValueChange={(value: "F" | "J") => update("personType", value)}><SelectTrigger aria-invalid={Boolean(fieldErrors.personType) || undefined} className={fieldErrors.personType ? "border-destructive focus:ring-destructive" : ""}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="F">Pessoa física</SelectItem><SelectItem value="J">Pessoa jurídica</SelectItem></SelectContent></Select>
              </Field>
              <Field label={draft.personType === "J" ? "CNPJ" : "CPF"} required><LimitedInput value={draft.document} limit={TINY_CONTACT_LIMITS.document} error={fieldErrors.document} onChange={(e) => update("document", e.target.value)} /></Field>
              {draft.personType === "J" && <Field label="Nome fantasia" className="lg:col-span-2"><LimitedInput value={draft.fantasy} limit={TINY_CONTACT_LIMITS.fantasy} error={fieldErrors.fantasy} onChange={(e) => update("fantasy", e.target.value)} /></Field>}
              <Field label="Contribuinte" error={fieldErrors.contributor}>
                <Select value={draft.contributor} onValueChange={(value: ErpContactDraft["contributor"]) => update("contributor", value)}><SelectTrigger aria-invalid={Boolean(fieldErrors.contributor) || undefined} className={fieldErrors.contributor ? "border-destructive focus:ring-destructive" : ""}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">0 - Não informado</SelectItem><SelectItem value="1">1 - Contribuinte ICMS</SelectItem><SelectItem value="2">2 - Contribuinte isento</SelectItem><SelectItem value="9">9 - Não contribuinte</SelectItem></SelectContent></Select>
              </Field>
              <Field label="Inscrição estadual"><LimitedInput value={draft.stateRegistration} limit={TINY_CONTACT_LIMITS.stateRegistration} error={fieldErrors.stateRegistration} onChange={(e) => update("stateRegistration", e.target.value)} /></Field>
              <Field label="Inscrição municipal"><LimitedInput value={draft.municipalRegistration} limit={TINY_CONTACT_LIMITS.municipalRegistration} error={fieldErrors.municipalRegistration} onChange={(e) => update("municipalRegistration", e.target.value)} /></Field>
              {draft.personType === "J" && <div className="flex items-end lg:col-span-2"><Button type="button" variant="outline" onClick={() => void consultFiscal()} disabled={fiscalLoading}>{fiscalLoading ? <Loader2 className="animate-spin" /> : <SearchCheck />}Consultar cadastro fiscal</Button><span className="ml-3 text-xs text-muted-foreground">Tiny primeiro; Sintegra somente como fallback.</span></div>}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
              <Field label="Endereço" className="lg:col-span-3"><LimitedInput value={draft.address} limit={TINY_CONTACT_LIMITS.address} error={fieldErrors.address} onChange={(e) => update("address", e.target.value)} /></Field>
              <Field label="Número"><LimitedInput value={draft.number} limit={TINY_CONTACT_LIMITS.number} error={fieldErrors.number} onChange={(e) => update("number", e.target.value)} /></Field>
              <Field label="Complemento (opcional)" className="lg:col-span-2"><LimitedInput value={draft.complement} limit={TINY_CONTACT_LIMITS.complement} error={fieldErrors.complement} onChange={(e) => update("complement", e.target.value)} /></Field>
              <Field label="Bairro" className="lg:col-span-2"><LimitedInput value={draft.neighborhood} limit={TINY_CONTACT_LIMITS.neighborhood} error={fieldErrors.neighborhood} onChange={(e) => update("neighborhood", e.target.value)} /></Field>
              <Field label="CEP"><LimitedInput value={draft.postalCode} limit={TINY_CONTACT_LIMITS.postalCode} error={fieldErrors.postalCode} onChange={(e) => update("postalCode", e.target.value)} /></Field>
              <Field label="Cidade" className="lg:col-span-2"><LimitedInput value={draft.city} limit={TINY_CONTACT_LIMITS.city} error={fieldErrors.city} onChange={(e) => update("city", e.target.value)} /></Field>
              <Field label="UF"><LimitedInput value={draft.state} limit={TINY_CONTACT_LIMITS.state} error={fieldErrors.state} onChange={(e) => update("state", e.target.value.toUpperCase())} /></Field>
              <Field label="País" className="lg:col-span-2"><LimitedInput value={draft.country} limit={TINY_CONTACT_LIMITS.country} error={fieldErrors.country} onChange={(e) => update("country", e.target.value)} /></Field>
              <Field label="Telefone" className="lg:col-span-2"><LimitedInput value={draft.phone} limit={TINY_CONTACT_LIMITS.phone} error={fieldErrors.phone} onChange={(e) => update("phone", e.target.value)} /></Field>
              <Field label="E-mail" className="lg:col-span-2"><LimitedInput type="email" value={draft.email} limit={TINY_CONTACT_LIMITS.email} error={fieldErrors.email} onChange={(e) => update("email", e.target.value)} /></Field>
              <Field label="E-mail NFe" className="lg:col-span-2"><LimitedInput type="email" value={draft.emailNfe} limit={TINY_CONTACT_LIMITS.emailNfe} error={fieldErrors.emailNfe} onChange={(e) => update("emailNfe", e.target.value)} /></Field>
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

function Field({ label, required = false, error, className = "", children }: { label: string; required?: boolean; error?: string; className?: string; children: React.ReactNode }) {
  return <div className={`space-y-2 ${className}`}><Label className={error ? "text-destructive" : ""}>{label}{required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}</Label>{children}{error && <p className="text-xs text-destructive" role="alert">{error}</p>}</div>;
}

function LimitedInput({ value, limit, error, ...props }: Omit<React.ComponentProps<typeof Input>, "value" | "maxLength"> & { value: string; limit: number; error?: string }) {
  const length = value.trim().length;
  const exceedsLimit = length > limit;
  const message = error || (exceedsLimit ? `Excede o limite do Tiny: ${length}/${limit} caracteres. Reduza este campo.` : "");
  return (
    <div className="space-y-1">
      <Input {...props} value={value} maxLength={limit} aria-invalid={Boolean(message) || undefined} className={`${props.className ?? ""} ${message ? "border-destructive focus-visible:ring-destructive" : ""}`} />
      {message && (
        <p className="text-xs text-destructive" role="alert">
          {message}
        </p>
      )}
    </div>
  );
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
