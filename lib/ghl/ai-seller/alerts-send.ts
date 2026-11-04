import "server-only";

import { fetchGhlContactById, fetchGhlLocationUsers } from "@/lib/ghl/api";
import { dashboardUserIdForGhlUser, notifyUsers } from "@/lib/notifications/notify-users";
import { camiAdminUserIds } from "./admin-access";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import {
  buildDailySummary,
  fmtMinutes,
  handoffAlertsDue,
  handoffNoticeText,
  type PendingHandoff,
} from "./alerts";
import { loadConversations, loadOverview } from "./intel-load";
import { algumEntregue } from "@/lib/ghl/team-alerts/rules";
import { avisarTime } from "@/lib/ghl/team-alerts/send";
import {
  avisoDeEspera,
  avisoDePassagem,
  avisoDoResumo,
  juntarAvisos,
  diaEHora,
  linkDoContato,
  type Aviso,
} from "@/lib/ghl/team-alerts/text";
import type { SellerSettings } from "./settings";

const HANDOFF_ALERT_WINDOW_MS = 72 * 60 * 60 * 1000;
/** Aviso que sai mais tarde que isso depois da passagem leva a data e a hora dela. */
const AVISO_ATRASADO_MS = 20 * 60 * 1000;
const CONVERSAS_URL = "/cami?tab=conversas";
/** Toque no push abre o atendimento, quando a passagem sabe a oportunidade. */
const conversaUrl = (opportunityId: string | null | undefined) =>
  opportunityId ? `${CONVERSAS_URL}&conversa=${encodeURIComponent(opportunityId)}` : CONVERSAS_URL;

const MOTIVO: Record<string, string> = {
  pronto_para_pagar: "pronto para pagar",
  desconto_ou_excecao: "pediu desconto",
  reclamacao: "reclamação",
  cliente_pediu_pessoa: "pediu uma pessoa",
  pedido_grande: "pedido grande",
  falha_tecnica: "falha técnica",
  limite_mensagens: "limite de mensagens",
  sem_oportunidade: "sem oportunidade aberta",
  cami_desligada: "Cami desligada",
  outro: "outro motivo",
};

type GhlUsers = Awaited<ReturnType<typeof fetchGhlLocationUsers>>;

/** Usuário do dashboard de quem recebeu a passagem no GHL (e-mail, senão primeiro nome). */
async function recipientFor(
  ghlUserId: string | null,
  ghlUsers: GhlUsers,
  cache: Map<string, string | null>,
): Promise<string | null> {
  const id = ghlUserId ?? "";
  if (!cache.has(id)) cache.set(id, await dashboardUserIdForGhlUser(ghlUsers.find((u) => u.id === id)));
  return cache.get(id) ?? null;
}

async function loadGhlUsers(): Promise<GhlUsers> {
  return fetchGhlLocationUsers().catch((err) => {
    console.error("CAMI alertas: usuários do GHL não lidos", err);
    return [];
  });
}

interface HandoffForNotice {
  id: string;
  contact_id: string;
  opportunity_id: string | null;
  motivo: string;
  resumo: string | null;
  to_user_id: string | null;
}

/** O resumo da passagem que pode ir para o time: na falha técnica é o erro cru (em inglês). */
function resumoParaOTime(h: HandoffForNotice): string | null {
  return h.motivo === "falha_tecnica" ? "A Cami não conseguiu responder; siga pela conversa no GHL." : h.resumo;
}

/** Aviso de passagem para o WhatsApp do time, junto com o push. */
function avisoDaPassagem(h: HandoffForNotice, nome: string | null, passadaEm: string | null = null): Aviso {
  return avisoDePassagem({
    nome,
    motivo: MOTIVO[h.motivo] ?? h.motivo,
    resumo: resumoParaOTime(h),
    link: linkDoContato(h.contact_id),
    passadaEm,
  });
}

/** Push "cliente passado para você" a quem recebeu. true se havia destinatário. */
async function sendNotice(
  h: HandoffForNotice,
  nome: string | null,
  ghlUsers: GhlUsers,
  cache: Map<string, string | null>,
): Promise<boolean> {
  const userId = await recipientFor(h.to_user_id, ghlUsers, cache);
  if (!userId) {
    console.warn("CAMI alertas: quem recebe a passagem não tem usuário no dashboard", { ghlId: h.to_user_id });
    return false;
  }
  // Falha técnica: o resumo é o erro cru (em inglês); fica na nota do GHL, não no push.
  const resumo = resumoParaOTime(h);
  const { title, message } = handoffNoticeText({ nome, motivo: MOTIVO[h.motivo] ?? h.motivo, resumo });
  await notifyUsers({
    userIds: [userId],
    title,
    message,
    type: "warning",
    url: conversaUrl(h.opportunity_id),
    data: { contactId: h.contact_id, handoffId: h.id },
  });
  return true;
}

/**
 * Aviso na hora da passagem, chamado pela rodada da Cami quando quem recebe
 * está no turno (fora do turno, o cron manda no início do turno seguinte).
 * Marca notified_at mesmo sem destinatário, para não repetir; o WhatsApp só
 * fica marcado se chegou (senão o cron tenta de novo). Nunca lança.
 */
export async function notifyHandoffNow(h: HandoffForNotice, contactName: string | null): Promise<void> {
  try {
    let nome = contactName;
    if (!nome) {
      nome = await fetchGhlContactById(h.contact_id)
        .then((c) => c.firstName ?? c.contactName ?? null)
        .catch(() => null);
    }
    await sendNotice(h, nome, await loadGhlUsers(), new Map());
    const entregue = algumEntregue(await avisarTime(avisoDaPassagem(h, nome)));
    const agora = new Date().toISOString();
    const supabase = await createSupabaseServerForSync();
    const { error } = await supabase
      .from("ai_seller_handoffs")
      .update({ notified_at: agora, ...(entregue ? { whatsapp_avisado_at: agora } : { whatsapp_falhas: 1 }) })
      .eq("id", h.id);
    if (error) console.error("CAMI alertas: marca do aviso de passagem não gravada", { handoffId: h.id, error });
  } catch (err) {
    console.error("CAMI alertas: aviso de passagem não enviado; o cron tenta de novo", { handoffId: h.id, err });
  }
}

/**
 * Passagens sem resposta do time, no cron refresh-cami (depois de conferir no
 * GHL quais já foram respondidas):
 * - aviso pendente de passagem feita fora do turno, no primeiro minuto do turno;
 * - WhatsApp que falhou, de novo a cada rodada do turno até chegar;
 * - lembrete a quem recebe e, mais tarde, aviso ao owner.
 * Um WhatsApp só por rodada: as passagens do fim de semana chegam juntas na segunda.
 */
export async function sendHandoffAlerts(
  settings: SellerSettings,
  now = Date.now(),
): Promise<{ aviso: number; whatsapp: number; pessoa: number; owner: number }> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from("ai_seller_handoffs")
    .select(
      "id, contact_id, opportunity_id, motivo, resumo, to_user_id, escalated_at, answered_at, notified_at, whatsapp_avisado_at, whatsapp_falhas, alerted_at, owner_alerted_at",
    )
    .is("answered_at", null)
    .gte("escalated_at", new Date(now - HANDOFF_ALERT_WINDOW_MS).toISOString());
  if (error) throw new Error(`ai_seller_handoffs: ${error.message}`);
  const handoffs = (data ?? []) as Array<PendingHandoff & HandoffForNotice & { whatsapp_falhas: number | null }>;
  const due = handoffAlertsDue(handoffs, now, settings.alertas, settings.shifts);
  if (due.length === 0) return { aviso: 0, whatsapp: 0, pessoa: 0, owner: 0 };

  const contactIds = [...new Set(handoffs.map((h) => h.contact_id))];
  const { data: convs } = await supabase
    .from("ai_seller_conversations")
    .select("contact_id, contact_name")
    .in("contact_id", contactIds);
  const nameOf = new Map((convs ?? []).map((c) => [c.contact_id as string, (c.contact_name as string) || null]));

  const ghlUsers = await loadGhlUsers();
  const cache = new Map<string, string | null>();
  const owners = await camiAdminUserIds();
  const nowIso = new Date(now).toISOString();
  const patches = new Map<string, Record<string, string | number>>();
  const patchOf = (id: string) => {
    if (!patches.has(id)) patches.set(id, {});
    return patches.get(id)!;
  };
  const avisos: Aviso[] = [];
  const noWhatsApp: typeof handoffs = [];
  let aviso = 0;
  let pessoa = 0;
  let owner = 0;

  for (const d of due) {
    const h = handoffs.find((x) => x.id === d.id)!;
    const nome = nameOf.get(h.contact_id) ?? null;
    const motivo = MOTIVO[h.motivo] ?? h.motivo;
    const espera = fmtMinutes(d.minutos);

    if (d.aviso || d.whatsapp) {
      const nomeAviso =
        nome ??
        (await fetchGhlContactById(h.contact_id)
          .then((c) => c.firstName ?? c.contactName ?? null)
          .catch(() => null));
      if (d.aviso) {
        if (await sendNotice(h, nomeAviso, ghlUsers, cache)) aviso++;
        // Marca mesmo sem destinatário: não repete a cada 15 min.
        patchOf(h.id).notified_at = nowIso;
      }
      if (d.whatsapp) {
        const passagem = Date.parse(h.escalated_at);
        avisos.push(avisoDaPassagem(h, nomeAviso, now - passagem > AVISO_ATRASADO_MS ? diaEHora(passagem) : null));
        noWhatsApp.push(h);
      }
    }

    if (d.pessoa) {
      const userId = await recipientFor(h.to_user_id, ghlUsers, cache);
      if (userId) {
        await notifyUsers({
          userIds: [userId],
          title: "Cliente esperando sua resposta",
          message: `${nome ?? "Um cliente"} espera há ${espera} úteis (${motivo}). A Cami passou o atendimento para você.`,
          type: "warning",
          url: conversaUrl(h.opportunity_id),
          data: { contactId: h.contact_id, handoffId: h.id },
        });
        pessoa++;
      } else {
        console.warn("CAMI alertas: quem recebe a passagem não tem usuário no dashboard", { ghlId: h.to_user_id });
      }
      avisos.push(avisoDeEspera({ nome, espera, motivo, link: linkDoContato(h.contact_id), owner: false }));
      patchOf(h.id).alerted_at = nowIso;
    }

    if (d.owner) {
      avisos.push(avisoDeEspera({ nome, espera, motivo, link: linkDoContato(h.contact_id), owner: true }));
      // Marca mesmo sem owner no dashboard: o WhatsApp não repete a cada 15 min.
      patchOf(h.id).owner_alerted_at = nowIso;
    }
    if (d.owner && owners.length) {
      await notifyUsers({
        userIds: owners,
        title: "Passagem da Cami sem resposta",
        message: `${nome ?? "Um cliente"} espera há ${espera} úteis (${motivo}) e ninguém do time respondeu ainda.`,
        type: "warning",
        url: conversaUrl(h.opportunity_id),
        data: { contactId: h.contact_id, handoffId: h.id },
      });
      owner++;
    }
  }

  let whatsapp = 0;
  if (avisos.length) {
    const entregue = algumEntregue(await avisarTime(juntarAvisos(avisos)));
    for (const h of noWhatsApp) {
      if (entregue) patchOf(h.id).whatsapp_avisado_at = nowIso;
      else patchOf(h.id).whatsapp_falhas = (h.whatsapp_falhas ?? 0) + 1;
    }
    if (entregue) whatsapp = noWhatsApp.length;
    else if (noWhatsApp.length) {
      console.error("CAMI alertas: aviso de passagem não chegou no WhatsApp; tenta de novo na próxima rodada", {
        passagens: noWhatsApp.map((h) => h.id),
      });
    }
  }

  for (const [id, patch] of patches) {
    const { error: updateError } = await supabase.from("ai_seller_handoffs").update(patch).eq("id", id);
    if (updateError) console.error("CAMI alertas: marca do aviso não gravada", { handoffId: id, updateError });
  }
  return { aviso, whatsapp, pessoa, owner };
}

/** Resumo do dia para o owner. Não manda nada em dia sem atividade da Cami. */
export async function sendDailySummary(): Promise<{ enviado: boolean; motivo?: string }> {
  const [payload, conversations] = await Promise.all([loadOverview("hoje"), loadConversations()]);
  if (!payload.settings.alertas.resumoDiario) return { enviado: false, motivo: "resumo desligado no Controle" };
  const supabase = await createSupabaseServerForSync();
  const { count: whatsappSemEntrega, error } = await supabase
    .from("ai_seller_handoffs")
    .select("id", { count: "exact", head: true })
    .is("answered_at", null)
    .is("whatsapp_avisado_at", null)
    .gt("whatsapp_falhas", 0)
    .gte("escalated_at", new Date(Date.now() - HANDOFF_ALERT_WINDOW_MS).toISOString());
  if (error) console.error("CAMI resumo: avisos sem entrega não contados", error);
  const summary = buildDailySummary({
    overview: payload.overview,
    paraRevisar: conversations.filter((c) => c.paraRevisar).length,
    escalationName: payload.settings.escalationName,
    whatsappSemEntrega: whatsappSemEntrega ?? 0,
  });
  if (!summary) return { enviado: false, motivo: "sem atividade hoje" };
  const owners = await camiAdminUserIds();
  if (!owners.length) return { enviado: false, motivo: "nenhum owner" };
  await notifyUsers({ userIds: owners, title: summary.title, message: summary.message, url: "/cami" });
  await avisarTime(avisoDoResumo(summary));
  return { enviado: true };
}
