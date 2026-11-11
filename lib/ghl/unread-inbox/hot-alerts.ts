import "server-only";

import { fetchGhlLocationUsers } from "@/lib/ghl/api";
import type { SellerSettings } from "@/lib/ghl/ai-seller/settings";
import { algumEntregue } from "@/lib/ghl/team-alerts/rules";
import { avisarTime } from "@/lib/ghl/team-alerts/send";
import { dashboardUserIdForGhlUser, notifyUsers } from "@/lib/notifications/notify-users";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import {
  decidirAvisoQuente,
  PASSAGEM_RECENTE_MS,
  primeiroNome,
  textoDoAvisoQuente,
  type HotDecision,
  type HotRow,
} from "./hot-alert-rules";

// Aviso de lead quente para quem recebe as passagens da Cami (a Schay): push
// no dashboard e WhatsApp "Aviso time" só para ela. Roda logo depois de
// atualizar a fila de não lidas (cron nao-lidas).

const TABLE = "ghl_unread_triage";
const URL_FILA = "/cami?tab=nao-lidas";

/** Usuário do dashboard de quem recebe as passagens (pelo id do GHL; sem id, pelo primeiro nome). */
async function destinatario(settings: SellerSettings): Promise<string | null> {
  const users = await fetchGhlLocationUsers().catch((err) => {
    console.error("aviso de lead quente: usuários do GHL não lidos", err);
    return [];
  });
  const alvo = settings.escalationUserId
    ? users.find((u) => u.id === settings.escalationUserId)
    : users.find((u) => primeiroNome(u.name) === primeiroNome(settings.escalationName));
  return dashboardUserIdForGhlUser(alvo);
}

export interface ResultadoDoAvisoQuente {
  avisados: string[];
  dispensados: Partial<Record<HotDecision, number>>;
  push: boolean;
  whatsapp: boolean;
  previa?: { title: string; message: string; whatsapp: string };
}

/**
 * Leads quentes com mensagem nova do cliente desde o último aviso. Marca a
 * mensagem como avisada (ou dispensada) para não repetir; se nem o push nem
 * o WhatsApp saíram, os avisados ficam para a próxima rodada.
 */
export async function avisarLeadsQuentes(
  settings: SellerSettings,
  opts: { dryRun?: boolean; now?: number } = {},
): Promise<ResultadoDoAvisoQuente> {
  const now = opts.now ?? Date.now();
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "conversation_id, contact_id, contact_name, reason, last_message_id, last_message_body, contact_tags, hot_notified_message_id",
    )
    .eq("is_unread", true)
    .eq("category", "quente");
  if (error) throw new Error(`${TABLE}: ${error.message}`);

  const pendentes = ((data ?? []) as HotRow[]).filter(
    (r) => r.last_message_id && r.hot_notified_message_id !== r.last_message_id,
  );
  const resultado: ResultadoDoAvisoQuente = { avisados: [], dispensados: {}, push: false, whatsapp: false };
  if (pendentes.length === 0) return resultado;

  const { data: passagens, error: passagensError } = await supabase
    .from("ai_seller_handoffs")
    .select("contact_id")
    .in("contact_id", [...new Set(pendentes.map((r) => r.contact_id))])
    .gte("escalated_at", new Date(now - PASSAGEM_RECENTE_MS).toISOString());
  if (passagensError) console.error("aviso de lead quente: passagens da Cami não lidas", passagensError);
  const comPassagem = new Set((passagens ?? []).map((p) => p.contact_id as string));

  const avisar: HotRow[] = [];
  const dispensar: HotRow[] = [];
  for (const r of pendentes) {
    const decisao = decidirAvisoQuente(r, comPassagem);
    if (decisao === "avisar") avisar.push(r);
    else {
      dispensar.push(r);
      resultado.dispensados[decisao] = (resultado.dispensados[decisao] ?? 0) + 1;
    }
  }
  resultado.avisados = avisar.map((r) => r.contact_name ?? r.contact_id);

  const texto = avisar.length ? textoDoAvisoQuente(avisar) : null;
  if (opts.dryRun) {
    if (texto) resultado.previa = { title: texto.title, message: texto.message, whatsapp: texto.aviso.texto };
    return resultado;
  }

  if (texto) {
    const userId = await destinatario(settings);
    if (userId) {
      const push = await notifyUsers({
        userIds: [userId],
        title: texto.title,
        message: texto.message,
        type: "warning",
        url: URL_FILA,
        from: "Não lidas",
        data: { conversationIds: avisar.map((r) => r.conversation_id) },
      });
      resultado.push = push.notificationId != null;
    } else {
      console.warn("aviso de lead quente: quem recebe não tem usuário no dashboard", {
        escalationUserId: settings.escalationUserId,
      });
    }
    const nome = primeiroNome(settings.escalationName);
    resultado.whatsapp = algumEntregue(await avisarTime(texto.aviso, (d) => primeiroNome(d.nome) === nome));
  }

  const entregue = resultado.push || resultado.whatsapp;
  const marcar = entregue ? [...avisar, ...dispensar] : dispensar;
  const agora = new Date(now).toISOString();
  await Promise.all(
    marcar.map(async (r) => {
      const { error: markError } = await supabase
        .from(TABLE)
        .update({ hot_notified_message_id: r.last_message_id, hot_notified_at: agora })
        .eq("conversation_id", r.conversation_id);
      if (markError) console.error("aviso de lead quente: marca não gravada", { conversationId: r.conversation_id, markError });
    }),
  );
  if (avisar.length && !entregue) console.error("aviso de lead quente: nem push nem WhatsApp saíram; tenta na próxima rodada");
  return resultado;
}
