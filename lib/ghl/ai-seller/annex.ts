import "server-only";

import OpenAI from "openai";
import { getNegotiationTranscript, type NegotiationMessage } from "@/lib/ghl/negotiation-conversations";
import { notifyUsers, ownerUserIds } from "@/lib/notifications/notify-users";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { ANNEX_INSTRUCTIONS, ANNEX_SCHEMA, buildAnnexInput, type FeedbackForAnnex } from "./annex-prompt";
import {
  activeTexts,
  annexStats,
  applyEdits,
  cutReferenceSnapshot,
  exampleCut,
  parseAnnexResponse,
  reconcileWithCurrent,
  type AnnexItem,
} from "./annex-shape";
import { currentAnnex, toAnnex, type Annex } from "./annex-store";
import { AI_SELLER_MODEL } from "./config";
import { loadSellerSettings } from "./settings";
import { simulateReply } from "./simulate";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

/** Feedbacks por revisão: acima disso, os mais antigos ficam para a próxima. */
const MAX_FEEDBACKS_PER_REVIEW = 40;
/** "Como teria sido" simulado em até tantos itens novos/ajustados. */
const MAX_EXAMPLES = 3;
const ANEXO_URL = "/cami?tab=anexo";

export class AnnexError extends Error {}
export type { Annex };

export interface AnnexPage {
  rascunho: Annex | null;
  vigente: Annex | null;
  historico: Array<Pick<Annex, "id" | "status" | "origem" | "createdAt" | "decidedAt"> & { itens: number }>;
  fila: { total: number; porAutor: Array<{ autor: string; n: number }> };
}

/** Tudo da aba Anexo: revisão para aprovar, anexo em vigor, histórico e fila de feedbacks. */
export async function loadAnnexPage(): Promise<AnnexPage> {
  const supabase = await createSupabaseServerForSync();
  const [{ data: rows, error }, { data: pend, error: pendError }] = await Promise.all([
    supabase.from("ai_seller_annex").select("*").order("created_at", { ascending: false }).limit(30),
    supabase.from("ai_seller_feedback").select("author_name").eq("status", "pendente"),
  ]);
  if (error) throw new Error(`ai_seller_annex: ${error.message}`);
  if (pendError) throw new Error(`ai_seller_feedback: ${pendError.message}`);
  const all = (rows ?? []).map(toAnnex);
  const vigente =
    all
      .filter((a) => a.status === "publicado")
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))[0] ?? null;
  const porAutor = new Map<string, number>();
  for (const p of pend ?? []) {
    const autor = (p.author_name as string) || "Alguém do time";
    porAutor.set(autor, (porAutor.get(autor) ?? 0) + 1);
  }
  return {
    rascunho: all.find((a) => a.status === "rascunho") ?? null,
    vigente,
    historico: all
      .filter((a) => a.status !== "rascunho")
      .map((a) => ({ id: a.id, status: a.status, origem: a.origem, createdAt: a.createdAt, decidedAt: a.decidedAt, itens: annexStats(a.itens).ativos })),
    fila: { total: pend?.length ?? 0, porAutor: [...porAutor].map(([autor, n]) => ({ autor, n })) },
  };
}

const TZ = "America/Sao_Paulo";
const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Trecho do atendimento para a IA: em volta das mensagens marcadas, senão o fim da conversa. Só texto. */
function trechoDoAtendimento(messages: readonly NegotiationMessage[], camiIds: ReadonlySet<string>, marcadas: readonly string[]): string {
  const marked = new Set(marcadas);
  const idx = messages.map((m, i) => (marked.has(m.id) ? i : -1)).filter((i) => i >= 0);
  const [from, to] = idx.length
    ? [Math.max(0, idx[0] - 8), Math.min(messages.length, idx[idx.length - 1] + 5)]
    : [Math.max(0, messages.length - 24), messages.length];
  return messages
    .slice(from, to)
    .map((m) => {
      const quem =
        m.direction === "inbound" ? "CLIENTE" : camiIds.has(m.id) ? "CAMI" : m.isAutomated || !m.userId ? "ROBÔ" : "TIME";
      const texto = [m.body?.trim(), m.attachments?.length ? "[anexo/imagem]" : ""].filter(Boolean).join(" ");
      return `[${hora(m.dateAdded)}] ${quem}${marked.has(m.id) ? " (marcada no feedback)" : ""}: ${texto || "(sem texto)"}`;
    })
    .join("\n");
}

interface PendingFeedback {
  id: string;
  opportunity_id: string;
  contact_id: string;
  author_name: string | null;
  texto: string;
  atalhos: string[];
  mensagens: string[];
  urgente: boolean;
}

/**
 * Reescreve o anexo a partir dos feedbacks pendentes e grava o rascunho para
 * o dono aprovar (avisando por push). Sem feedback pendente, não faz nada.
 */
export async function generateAnnexDraft(origem: "semanal" | "urgente" | "manual"): Promise<Annex | null> {
  const supabase = await createSupabaseServerForSync();
  const { data: pend, error } = await supabase
    .from("ai_seller_feedback")
    .select("id, opportunity_id, contact_id, author_name, texto, atalhos, mensagens, urgente")
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .limit(MAX_FEEDBACKS_PER_REVIEW);
  if (error) throw new Error(`ai_seller_feedback: ${error.message}`);
  const feedbacks = (pend ?? []) as PendingFeedback[];
  if (feedbacks.length === 0) return null;

  const [vigente, settings] = await Promise.all([currentAnnex(supabase), loadSellerSettings()]);
  const current = vigente ? activeTexts(vigente.itens) : [];

  // A conversa de cada atendimento citado (uma leitura por contato).
  const contactIds = [...new Set(feedbacks.map((f) => f.contact_id))];
  const conversas = new Map<string, { messages: NegotiationMessage[]; camiIds: Set<string> }>();
  await Promise.all(
    contactIds.map(async (contactId) => {
      try {
        const [t, { data: runs }] = await Promise.all([
          getNegotiationTranscript(contactId),
          supabase.from("ai_seller_runs").select("sent_message_ids").eq("contact_id", contactId),
        ]);
        const camiIds = new Set((runs ?? []).flatMap((r) => (r.sent_message_ids as string[] | null) ?? []));
        conversas.set(contactId, { messages: t.messages, camiIds });
      } catch (err) {
        console.error("Anexo: conversa não lida", { contactId, err });
      }
    }),
  );

  const paraIa: FeedbackForAnnex[] = feedbacks.map((f) => {
    const conversa = conversas.get(f.contact_id);
    return {
      id: f.id,
      autor: f.author_name || "Alguém do time",
      atalhos: f.atalhos ?? [],
      texto: f.texto ?? "",
      urgente: f.urgente,
      trecho: conversa ? trechoDoAtendimento(conversa.messages, conversa.camiIds, f.mensagens ?? []) : "",
    };
  });

  const response = await openai.responses.create({
    model: AI_SELLER_MODEL,
    instructions: ANNEX_INSTRUCTIONS,
    input: buildAnnexInput(current, paraIa),
    reasoning: { effort: "medium" },
    text: { format: { type: "json_schema", name: "anexo", strict: true, schema: ANNEX_SCHEMA } },
    max_output_tokens: 8000,
    store: false,
  });
  const parsed = parseAnnexResponse(JSON.parse(response.output_text), new Set(feedbacks.map((f) => f.id)));
  const itens = reconcileWithCurrent(current, parsed.itens);

  // "Como teria sido": a Cami com o anexo novo, no ponto do atendimento que motivou o item.
  const anexoNovo = activeTexts(itens);
  const comExemplo = itens.filter((i) => (i.estado === "novo" || i.estado === "ajustado") && i.feedbackIds.length).slice(0, MAX_EXAMPLES);
  await Promise.all(
    comExemplo.map(async (item) => {
      const f = feedbacks.find((x) => x.id === item.feedbackIds[0]);
      const conversa = f && conversas.get(f.contact_id);
      if (!f || !conversa) return;
      const cut = exampleCut(conversa.messages, conversa.camiIds, f.mensagens ?? []);
      const snapshot = cut && cutReferenceSnapshot(conversa.messages, conversa.camiIds, cut.clientMessageId);
      if (!cut || !snapshot) return;
      try {
        const { data: conv } = await supabase
          .from("ai_seller_conversations")
          .select("contact_name, pipeline_name, stage_name, pares, monetary_value")
          .eq("opportunity_id", f.opportunity_id)
          .maybeSingle();
        const reply = await simulateReply(
          {
            id: f.id,
            nome: (conv?.contact_name as string) || "Atendimento",
            contactId: f.contact_id,
            messages: snapshot,
            context: {
              contactName: (conv?.contact_name as string) ?? null,
              pipelineName: (conv?.pipeline_name as string) ?? null,
              stageName: (conv?.stage_name as string) ?? null,
              crmPares: (conv?.pares as number) ?? null,
              crmValor: conv?.monetary_value == null ? null : Number(conv.monetary_value),
              at: snapshot[snapshot.length - 1].dateAdded,
            },
          },
          anexoNovo,
          settings,
        );
        if (reply.erro || reply.mensagens.length === 0) return;
        item.exemplo = {
          opportunityId: f.opportunity_id,
          nome: (conv?.contact_name as string) ?? null,
          cliente: cut.cliente,
          antes: cut.antes,
          depois: reply.mensagens,
        };
      } catch (err) {
        console.error("Anexo: exemplo não simulado", { feedbackId: f.id, err });
      }
    }),
  );

  // Uma revisão aberta por vez: a nova substitui a anterior (os feedbacks dela continuam pendentes e entram aqui).
  await supabase.from("ai_seller_annex").update({ status: "substituido" }).eq("status", "rascunho");
  const { data: row, error: insertError } = await supabase
    .from("ai_seller_annex")
    .insert({
      status: "rascunho",
      origem,
      itens,
      para_o_manual: parsed.paraOManual,
      resumo: parsed.resumo || null,
      feedback_ids: feedbacks.map((f) => f.id),
    })
    .select("*")
    .single();
  if (insertError) throw new Error(`ai_seller_annex: ${insertError.message}`);
  const draft = toAnnex(row);

  const stats = annexStats(itens);
  const owners = await ownerUserIds();
  if (owners.length) {
    await notifyUsers({
      userIds: owners,
      title: origem === "urgente" ? "Correção urgente da Cami para aprovar" : "Anexo da Cami para aprovar",
      message: `${feedbacks.length} ${feedbacks.length === 1 ? "feedback" : "feedbacks"}: ${stats.novo} novo, ${stats.ajustado} ajustado, ${stats.removido} removido.${parsed.paraOManual.length ? " Há ponto para o manual." : ""}`,
      url: ANEXO_URL,
      data: { annexId: draft.id },
      from: "CAMI Intelligence",
    });
  }
  return draft;
}

/** O dono aprova (com os textos que ajustou): vira o anexo em vigor na próxima resposta da Cami. */
export async function approveAnnex(id: string, userId: string, textos?: unknown): Promise<Annex> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase.from("ai_seller_annex").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`ai_seller_annex: ${error.message}`);
  if (!data) throw new AnnexError("Revisão não encontrada");
  const draft = toAnnex(data);
  if (draft.status !== "rascunho") throw new AnnexError("Esta revisão já foi decidida");
  const edited = applyEdits(draft.itens, textos);
  if (!edited.ok) throw new AnnexError(edited.error);

  // Publica antes de aposentar a anterior: a Cami nunca fica sem anexo no meio.
  const now = new Date().toISOString();
  const { data: saved, error: saveError } = await supabase
    .from("ai_seller_annex")
    .update({ status: "publicado", itens: edited.itens, decided_at: now, decided_by: userId, published_at: now })
    .eq("id", id)
    .eq("status", "rascunho")
    .select("*")
    .single();
  if (saveError) throw new Error(`ai_seller_annex: ${saveError.message}`);
  await supabase.from("ai_seller_annex").update({ status: "substituido" }).eq("status", "publicado").neq("id", id);
  if (draft.feedbackIds.length) {
    await supabase.from("ai_seller_feedback").update({ status: "usado", anexo_id: id }).in("id", draft.feedbackIds);
  }
  return toAnnex(saved);
}

/** O dono descarta a revisão: o anexo em vigor continua e os feedbacks dela não voltam. */
export async function discardAnnex(id: string, userId: string): Promise<void> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from("ai_seller_annex")
    .update({ status: "descartado", decided_at: new Date().toISOString(), decided_by: userId })
    .eq("id", id)
    .eq("status", "rascunho")
    .select("feedback_ids")
    .maybeSingle();
  if (error) throw new Error(`ai_seller_annex: ${error.message}`);
  if (!data) throw new AnnexError("Esta revisão já foi decidida");
  const ids = (data.feedback_ids as string[]) ?? [];
  if (ids.length) {
    await supabase.from("ai_seller_feedback").update({ status: "descartado", anexo_id: id }).in("id", ids);
  }
}
