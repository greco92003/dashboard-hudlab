import "server-only";

import { getNegotiationTranscript, getQtyParesForOpportunity } from "@/lib/ghl/negotiation-conversations";
import { fetchGhlContactById, fetchGhlPipelines } from "@/lib/ghl/api";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { cutReferenceSnapshot, canActivateRule, validateRuleText, type SnapshotMessage } from "./rules-shape";
import { findCurrentOpportunity } from "./opportunity";
import { loadAiHistory } from "./runs-store";

export interface Rule {
  id: string;
  texto: string;
  ativa: boolean;
  origem: "manual" | "correcao" | "sugestao";
  contactId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceContext {
  contactName: string | null;
  pipelineName: string | null;
  stageName: string | null;
  crmPares: number | null;
  crmValor: number | null;
  /** Momento da última mensagem do cliente na foto: a Cami responde "naquele dia". */
  at: string;
}

export interface Reference {
  id: string;
  nome: string;
  boaResposta: string | null;
  contactId: string;
  messages: SnapshotMessage[];
  context: ReferenceContext;
  createdAt: string;
}

type Row = Record<string, unknown>;

const toRule = (r: Row): Rule => ({
  id: r.id as string,
  texto: r.texto as string,
  ativa: r.ativa as boolean,
  origem: r.origem as Rule["origem"],
  contactId: (r.contact_id as string) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

const toReference = (r: Row): Reference => ({
  id: r.id as string,
  nome: r.nome as string,
  boaResposta: (r.boa_resposta as string) ?? null,
  contactId: r.contact_id as string,
  messages: r.messages as SnapshotMessage[],
  context: r.context as ReferenceContext,
  createdAt: r.created_at as string,
});

/** Regras ligadas, na ordem em que foram criadas. Nunca lança: sem banco, a Cami segue sem elas. */
export async function loadActiveRules(): Promise<string[]> {
  try {
    const supabase = await createSupabaseServerForSync();
    const { data, error } = await supabase
      .from("ai_seller_rules")
      .select("texto")
      .eq("ativa", true)
      .order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.texto as string);
  } catch (err) {
    console.error("IA vendedora: regras da casa não lidas; seguindo sem elas", err);
    return [];
  }
}

export async function listRules(): Promise<Rule[]> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase.from("ai_seller_rules").select("*").order("created_at");
  if (error) throw new Error(`ai_seller_rules: ${error.message}`);
  return (data ?? []).map(toRule);
}

export class RuleError extends Error {}

async function activeCount(excludeId?: string): Promise<number> {
  const supabase = await createSupabaseServerForSync();
  let query = supabase.from("ai_seller_rules").select("id", { count: "exact", head: true }).eq("ativa", true);
  if (excludeId) query = query.neq("id", excludeId);
  const { count, error } = await query;
  if (error) throw new Error(`ai_seller_rules: ${error.message}`);
  return count ?? 0;
}

export async function createRule(input: {
  texto: unknown;
  ativa: boolean;
  origem?: Rule["origem"];
  contactId?: string | null;
  userId: string;
}): Promise<Rule> {
  const valid = validateRuleText(input.texto);
  if (!valid.ok) throw new RuleError(valid.error);
  if (input.ativa && !canActivateRule(await activeCount())) {
    throw new RuleError("Já há 15 regras ligadas: desligue uma antes (ou passe a que se provou para o manual)");
  }
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from("ai_seller_rules")
    .insert({
      texto: valid.texto,
      ativa: input.ativa,
      origem: input.origem ?? "manual",
      contact_id: input.contactId ?? null,
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`ai_seller_rules: ${error.message}`);
  return toRule(data);
}

export async function updateRule(
  id: string,
  input: { texto?: unknown; ativa?: boolean },
  userId: string,
): Promise<Rule | null> {
  const patch: Row = { updated_by: userId, updated_at: new Date().toISOString() };
  if (input.texto !== undefined) {
    const valid = validateRuleText(input.texto);
    if (!valid.ok) throw new RuleError(valid.error);
    patch.texto = valid.texto;
  }
  if (input.ativa !== undefined) {
    if (input.ativa && !canActivateRule(await activeCount(id))) {
      throw new RuleError("Já há 15 regras ligadas: desligue uma antes (ou passe a que se provou para o manual)");
    }
    patch.ativa = input.ativa;
  }
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase.from("ai_seller_rules").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw new Error(`ai_seller_rules: ${error.message}`);
  return data ? toRule(data) : null;
}

export async function deleteRule(id: string): Promise<boolean> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase.from("ai_seller_rules").delete().eq("id", id).select("id");
  if (error) throw new Error(`ai_seller_rules: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function listReferences(): Promise<Reference[]> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase.from("ai_seller_references").select("*").order("created_at");
  if (error) throw new Error(`ai_seller_references: ${error.message}`);
  return (data ?? []).map(toReference);
}

export async function getReferences(ids: string[]): Promise<Reference[]> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase.from("ai_seller_references").select("*").in("id", ids).order("created_at");
  if (error) throw new Error(`ai_seller_references: ${error.message}`);
  return (data ?? []).map(toReference);
}

/**
 * Guarda uma foto da conversa do contato até a última mensagem do cliente
 * (ou a escolhida), com o contexto do CRM de agora. Mensagens da IA ficam
 * marcadas como dela.
 */
export async function createReferenceFromContact(input: {
  contactId: string;
  nome: unknown;
  boaResposta?: unknown;
  uptoMessageId?: string | null;
  userId: string;
}): Promise<Reference> {
  const nome = typeof input.nome === "string" ? input.nome.trim() : "";
  if (!nome) throw new RuleError("Dê um nome para a referência (ex.: Cliente achando caro)");
  const boaResposta = typeof input.boaResposta === "string" && input.boaResposta.trim() ? input.boaResposta.trim() : null;

  const [contact, transcript, history, opportunity, pipelines] = await Promise.all([
    fetchGhlContactById(input.contactId),
    getNegotiationTranscript(input.contactId),
    loadAiHistory(input.contactId, Date.now()),
    findCurrentOpportunity(input.contactId),
    fetchGhlPipelines(),
  ]);
  const snapshot = cutReferenceSnapshot(transcript.messages, history.sentMessageIds, input.uptoMessageId);
  if (!snapshot) throw new RuleError("Esse contato não tem mensagem do cliente no WhatsApp para a Cami responder");

  const pipeline = opportunity ? pipelines.find((p) => p.id === opportunity.pipelineId) : undefined;
  const context: ReferenceContext = {
    contactName: contact.firstName ?? contact.contactName ?? null,
    pipelineName: pipeline?.name ?? null,
    stageName: pipeline?.stages?.find((s) => s.id === opportunity?.pipelineStageId)?.name ?? null,
    crmPares: opportunity ? await getQtyParesForOpportunity(opportunity) : null,
    crmValor: opportunity?.monetaryValue ?? null,
    at: snapshot[snapshot.length - 1].dateAdded,
  };

  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from("ai_seller_references")
    .insert({
      nome,
      boa_resposta: boaResposta,
      contact_id: input.contactId,
      messages: snapshot,
      context,
      created_by: input.userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`ai_seller_references: ${error.message}`);
  return toReference(data);
}

export async function deleteReference(id: string): Promise<boolean> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase.from("ai_seller_references").delete().eq("id", id).select("id");
  if (error) throw new Error(`ai_seller_references: ${error.message}`);
  return (data ?? []).length > 0;
}
