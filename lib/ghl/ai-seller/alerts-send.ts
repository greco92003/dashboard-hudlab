import "server-only";

import { fetchGhlLocationUsers } from "@/lib/ghl/api";
import { dashboardUserIdForGhlUser, notifyUsers, ownerUserIds } from "@/lib/notifications/notify-users";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { buildDailySummary, fmtMinutes, handoffAlertsDue, type PendingHandoff } from "./alerts";
import { loadConversations, loadOverview } from "./intel-load";
import type { SellerSettings } from "./settings";

const HANDOFF_ALERT_WINDOW_MS = 72 * 60 * 60 * 1000;
const CONVERSAS_URL = "/cami?tab=conversas";

const MOTIVO: Record<string, string> = {
  pronto_para_pagar: "pronto para pagar",
  desconto_ou_excecao: "pediu desconto",
  reclamacao: "reclamação",
  cliente_pediu_pessoa: "pediu uma pessoa",
  pedido_grande: "pedido grande",
  falha_tecnica: "falha técnica",
  limite_mensagens: "limite de mensagens",
  cami_desligada: "Cami desligada",
};

/**
 * Passagens sem resposta do time: avisa quem recebe as passagens e, mais
 * tarde, o owner. Roda no cron refresh-cami, depois de conferir no GHL quais
 * passagens já foram respondidas.
 */
export async function sendHandoffAlerts(settings: SellerSettings, now = Date.now()): Promise<{ pessoa: number; owner: number }> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from("ai_seller_handoffs")
    .select("id, contact_id, motivo, to_user_id, escalated_at, answered_at, alerted_at, owner_alerted_at")
    .is("answered_at", null)
    .gte("escalated_at", new Date(now - HANDOFF_ALERT_WINDOW_MS).toISOString());
  if (error) throw new Error(`ai_seller_handoffs: ${error.message}`);
  const handoffs = (data ?? []) as Array<PendingHandoff & { contact_id: string; motivo: string; to_user_id: string | null }>;
  const due = handoffAlertsDue(handoffs, now, settings.alertas, settings.shifts);
  if (due.length === 0) return { pessoa: 0, owner: 0 };

  const contactIds = [...new Set(handoffs.map((h) => h.contact_id))];
  const { data: convs } = await supabase
    .from("ai_seller_conversations")
    .select("contact_id, contact_name")
    .in("contact_id", contactIds);
  const nameOf = new Map((convs ?? []).map((c) => [c.contact_id as string, (c.contact_name as string) || null]));

  // GHL user (quem recebeu a passagem) → usuário do dashboard, pelo e-mail.
  const ghlUsers = await fetchGhlLocationUsers().catch((err) => {
    console.error("CAMI alertas: usuários do GHL não lidos", err);
    return [];
  });
  const dashboardUserOf = new Map<string, string | null>();
  const owners = await ownerUserIds();
  let pessoa = 0;
  let owner = 0;

  for (const d of due) {
    const h = handoffs.find((x) => x.id === d.id)!;
    const nome = nameOf.get(h.contact_id) ?? "Um cliente";
    const motivo = MOTIVO[h.motivo] ?? h.motivo;
    const espera = fmtMinutes(d.minutos);
    const patch: Record<string, string> = {};

    if (d.pessoa) {
      const ghlId = h.to_user_id ?? "";
      if (!dashboardUserOf.has(ghlId)) {
        dashboardUserOf.set(ghlId, await dashboardUserIdForGhlUser(ghlUsers.find((u) => u.id === ghlId)));
      }
      const userId = dashboardUserOf.get(ghlId);
      if (userId) {
        await notifyUsers({
          userIds: [userId],
          title: "Cliente esperando sua resposta",
          message: `${nome} espera há ${espera} úteis (${motivo}). A Cami passou o atendimento para você.`,
          type: "warning",
          url: CONVERSAS_URL,
          data: { contactId: h.contact_id, handoffId: h.id },
        });
        pessoa++;
      } else {
        console.warn("CAMI alertas: quem recebe a passagem não tem usuário no dashboard", { ghlId });
      }
      // Marca mesmo sem destinatário: não repete a cada 15 min.
      patch.alerted_at = new Date(now).toISOString();
    }

    if (d.owner && owners.length) {
      await notifyUsers({
        userIds: owners,
        title: "Passagem da Cami sem resposta",
        message: `${nome} espera há ${espera} úteis (${motivo}) e ninguém do time respondeu ainda.`,
        type: "warning",
        url: CONVERSAS_URL,
        data: { contactId: h.contact_id, handoffId: h.id },
      });
      owner++;
      patch.owner_alerted_at = new Date(now).toISOString();
    }

    if (Object.keys(patch).length) {
      const { error: updateError } = await supabase.from("ai_seller_handoffs").update(patch).eq("id", h.id);
      if (updateError) console.error("CAMI alertas: marca do aviso não gravada", { handoffId: h.id, updateError });
    }
  }
  return { pessoa, owner };
}

/** Resumo do dia para o owner. Não manda nada em dia sem atividade da Cami. */
export async function sendDailySummary(): Promise<{ enviado: boolean; motivo?: string }> {
  const [payload, conversations] = await Promise.all([loadOverview("hoje"), loadConversations()]);
  if (!payload.settings.alertas.resumoDiario) return { enviado: false, motivo: "resumo desligado no Controle" };
  const summary = buildDailySummary({
    overview: payload.overview,
    paraRevisar: conversations.filter((c) => c.paraRevisar).length,
    escalationName: payload.settings.escalationName,
  });
  if (!summary) return { enviado: false, motivo: "sem atividade hoje" };
  const owners = await ownerUserIds();
  if (!owners.length) return { enviado: false, motivo: "nenhum owner" };
  await notifyUsers({ userIds: owners, title: summary.title, message: summary.message, url: "/cami" });
  return { enviado: true };
}
