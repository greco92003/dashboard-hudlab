import "server-only";

import { fetchGhlLocationUsers } from "@/lib/ghl/api";
import { dashboardUserIdForGhlUser, notifyUsers } from "@/lib/notifications/notify-users";
import { camiAdminUserIds } from "./admin-access";
import { isCamiAdmin } from "./admin-shape";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { escalationUserId } from "./config";
import { FEEDBACK_ATALHOS, type FeedbackInput } from "./feedback-shape";
import { loadSellerSettings } from "./settings";

export interface Feedback {
  id: string;
  autor: string;
  texto: string;
  atalhos: string[];
  mensagens: string[];
  urgente: boolean;
  status: string;
  at: string;
}

/** Usuário do dashboard de quem recebe as passagens (Controle), ou null se não der para saber. */
async function escalationDashboardUserId(): Promise<string | null> {
  const settings = await loadSellerSettings();
  let ghlId: string | null = settings.escalationUserId;
  if (!ghlId) {
    try {
      ghlId = escalationUserId();
    } catch {
      return null;
    }
  }
  const users = await fetchGhlLocationUsers().catch(() => []);
  return dashboardUserIdForGhlUser(users.find((u) => u.id === ghlId));
}

/** Ensina a Cami: quem administra a Cami e quem recebe as passagens (hoje a Schay). */
export async function canGiveFeedback(
  userId: string,
  role: string | null | undefined,
  email: string | null | undefined,
): Promise<boolean> {
  if (isCamiAdmin(role, email)) return true;
  return (await escalationDashboardUserId()) === userId;
}

function toFeedback(r: Record<string, unknown>): Feedback {
  return {
    id: r.id as string,
    autor: (r.author_name as string) || "Alguém do time",
    texto: (r.texto as string) ?? "",
    atalhos: (r.atalhos as string[]) ?? [],
    mensagens: (r.mensagens as string[]) ?? [],
    urgente: r.urgente === true,
    status: r.status as string,
    at: r.created_at as string,
  };
}

export async function listFeedback(opportunityId: string): Promise<Feedback[]> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from("ai_seller_feedback")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`ai_seller_feedback: ${error.message}`);
  return (data ?? []).map(toFeedback);
}

/** Feedbacks que ainda vão entrar no próximo anexo. */
export async function pendingFeedbackCount(): Promise<number> {
  const supabase = await createSupabaseServerForSync();
  const { count, error } = await supabase
    .from("ai_seller_feedback")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");
  if (error) throw new Error(`ai_seller_feedback: ${error.message}`);
  return count ?? 0;
}

/** Nome de quem escreve, como aparece para o owner. */
async function authorName(userId: string): Promise<string | null> {
  const supabase = await createSupabaseServerForSync();
  const { data } = await supabase
    .from("user_profiles")
    .select("first_name, last_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  const nome = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
  return nome || (data.email as string | null)?.split("@")[0] || null;
}

/**
 * Push simples de feedback urgente para o dono: só quando a revisão urgente
 * não pôde ser gerada (ela mesma já avisa quando fica pronta).
 */
export async function notifyUrgentFeedback(input: {
  feedback: Feedback;
  opportunityId: string;
  contactName: string | null;
  userId: string;
}): Promise<void> {
  const owners = (await camiAdminUserIds()).filter((id) => id !== input.userId);
  if (!owners.length) return;
  const atalhos = input.feedback.atalhos
    .map((id) => FEEDBACK_ATALHOS.find((a) => a.id === id)?.label)
    .filter(Boolean)
    .join(", ");
  const corpo = input.feedback.texto || atalhos;
  await notifyUsers({
    userIds: owners,
    title: "Feedback urgente sobre a Cami",
    message: `${input.feedback.autor} sobre ${input.contactName || "um cliente"}: ${corpo.length > 160 ? `${corpo.slice(0, 159)}…` : corpo}`,
    type: "warning",
    url: `/cami?tab=conversas&conversa=${encodeURIComponent(input.opportunityId)}`,
    data: { opportunityId: input.opportunityId, feedbackId: input.feedback.id },
  });
}

/** Guarda o feedback (pendente para a próxima revisão do anexo). */
export async function createFeedback(input: FeedbackInput & {
  opportunityId: string;
  contactId: string;
  contactName: string | null;
  userId: string;
}): Promise<Feedback> {
  const supabase = await createSupabaseServerForSync();
  const autor = await authorName(input.userId);
  const { data, error } = await supabase
    .from("ai_seller_feedback")
    .insert({
      opportunity_id: input.opportunityId,
      contact_id: input.contactId,
      author_id: input.userId,
      author_name: autor,
      texto: input.texto,
      atalhos: input.atalhos,
      mensagens: input.mensagens,
      urgente: input.urgente,
    })
    .select("*")
    .single();
  if (error) throw new Error(`ai_seller_feedback: ${error.message}`);
  return toFeedback(data);
}
