import "server-only";

import { fetchGhlLocationUsers } from "@/lib/ghl/api";
import type { SellerSettings } from "@/lib/ghl/ai-seller/settings";
import { algumEntregue } from "@/lib/ghl/team-alerts/rules";
import { avisarTime, TAG_AVISOS, TAG_AVISOS_POS_VENDA, type Destino } from "@/lib/ghl/team-alerts/send";
import { dashboardUserIdForGhlUser, notifyUsers } from "@/lib/notifications/notify-users";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import {
  decidirAviso,
  PASSAGEM_RECENTE_MS,
  primeiroNome,
  textoDoAviso,
  type HotDecision,
  type HotRow,
  type TipoDeAviso,
} from "./hot-alert-rules";

// Avisos da fila de não lidas, logo depois de atualizá-la (cron nao-lidas):
// - lead quente (qualquer dono) para quem recebe as passagens da Cami (a
//   Schay): push no dashboard e WhatsApp "Aviso time" só para ela;
// - cliente do pós-venda cuja conversa é da Amanda: push (se ela tem login no
//   dashboard) e WhatsApp para quem tem a tag `avisos_pos_venda`.

const TABLE = "ghl_unread_triage";
const URL_FILA = "/cami?tab=nao-lidas";
/** Usuária do GHL responsável pelo pós-venda (dona dos contatos de Cadastro ERP em diante). */
const POS_VENDA_USUARIO = "Amanda Augustin";

type GhlUser = Awaited<ReturnType<typeof fetchGhlLocationUsers>>[number];

export interface ResultadoDoAviso {
  avisados: string[];
  dispensados: Partial<Record<HotDecision, number>>;
  push: boolean;
  whatsapp: boolean;
  previa?: { title: string; message: string; whatsapp: string };
}

interface Rodada {
  tipo: TipoDeAviso;
  /** Usuário do GHL que recebe o push. */
  usuario: GhlUser | undefined;
  /** Só conversas deste dono (pós-venda); undefined = qualquer dono. */
  dono?: string | null;
  /** Lista de destinos do WhatsApp e filtro dentro dela. */
  tag: string;
  so?: (d: Destino) => boolean;
}

async function rodar(
  rodada: Rodada,
  opts: { dryRun?: boolean; now: number },
): Promise<ResultadoDoAviso> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "conversation_id, contact_id, contact_name, reason, last_message_id, last_message_body, contact_tags, assigned_to, hot_notified_message_id",
    )
    .eq("is_unread", true)
    .eq("category", rodada.tipo);
  if (error) throw new Error(`${TABLE}: ${error.message}`);

  const pendentes = ((data ?? []) as HotRow[]).filter(
    (r) => r.last_message_id && r.hot_notified_message_id !== r.last_message_id,
  );
  const resultado: ResultadoDoAviso = { avisados: [], dispensados: {}, push: false, whatsapp: false };
  if (pendentes.length === 0) return resultado;

  // Passagem recente da Cami já avisou a Schay; no pós-venda não se aplica.
  let passagensRecentes = new Set<string>();
  if (rodada.tipo === "quente") {
    const { data: passagens, error: passagensError } = await supabase
      .from("ai_seller_handoffs")
      .select("contact_id")
      .in("contact_id", [...new Set(pendentes.map((r) => r.contact_id))])
      .gte("escalated_at", new Date(opts.now - PASSAGEM_RECENTE_MS).toISOString());
    if (passagensError) console.error("aviso de não lidas: passagens da Cami não lidas", passagensError);
    passagensRecentes = new Set((passagens ?? []).map((p) => p.contact_id as string));
  }

  const avisar: HotRow[] = [];
  const dispensar: HotRow[] = [];
  for (const r of pendentes) {
    const decisao = decidirAviso(r, { passagensRecentes, dono: rodada.dono });
    if (decisao === "avisar") avisar.push(r);
    else {
      dispensar.push(r);
      resultado.dispensados[decisao] = (resultado.dispensados[decisao] ?? 0) + 1;
    }
  }
  resultado.avisados = avisar.map((r) => r.contact_name ?? r.contact_id);

  const texto = avisar.length ? textoDoAviso(avisar, rodada.tipo) : null;
  if (opts.dryRun) {
    if (texto) resultado.previa = { title: texto.title, message: texto.message, whatsapp: texto.aviso.texto };
    return resultado;
  }

  if (texto) {
    const userId = await dashboardUserIdForGhlUser(rodada.usuario);
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
      console.warn("aviso de não lidas: quem recebe não tem usuário no dashboard", {
        tipo: rodada.tipo,
        ghlUserId: rodada.usuario?.id ?? null,
      });
    }
    resultado.whatsapp = algumEntregue(await avisarTime(texto.aviso, rodada.so, rodada.tag));
  }

  // Marca a mensagem como avisada (ou dispensada) para não repetir; se nem o
  // push nem o WhatsApp saíram, os avisados ficam para a próxima rodada.
  const entregue = resultado.push || resultado.whatsapp;
  const marcar = entregue ? [...avisar, ...dispensar] : dispensar;
  const agora = new Date(opts.now).toISOString();
  await Promise.all(
    marcar.map(async (r) => {
      const { error: markError } = await supabase
        .from(TABLE)
        .update({ hot_notified_message_id: r.last_message_id, hot_notified_at: agora })
        .eq("conversation_id", r.conversation_id);
      if (markError) console.error("aviso de não lidas: marca não gravada", { conversationId: r.conversation_id, markError });
    }),
  );
  if (avisar.length && !entregue) {
    console.error("aviso de não lidas: nem push nem WhatsApp saíram; tenta na próxima rodada", { tipo: rodada.tipo });
  }
  return resultado;
}

/** As duas rodadas de aviso: lead quente para a Schay, pós-venda para a Amanda. */
export async function avisarNaoLidas(
  settings: SellerSettings,
  opts: { dryRun?: boolean; now?: number } = {},
): Promise<{ quente: ResultadoDoAviso; posVenda: ResultadoDoAviso | { erro: string } }> {
  const now = opts.now ?? Date.now();
  const users = await fetchGhlLocationUsers().catch((err) => {
    console.error("aviso de não lidas: usuários do GHL não lidos", err);
    return [] as GhlUser[];
  });

  const schay = settings.escalationUserId
    ? users.find((u) => u.id === settings.escalationUserId)
    : users.find((u) => primeiroNome(u.name) === primeiroNome(settings.escalationName));
  const nomeSchay = primeiroNome(settings.escalationName);
  const quente = await rodar(
    { tipo: "quente", usuario: schay, tag: TAG_AVISOS, so: (d) => primeiroNome(d.nome) === nomeSchay },
    { dryRun: opts.dryRun, now },
  );

  const amanda = users.find((u) => u.name === POS_VENDA_USUARIO);
  if (!amanda) {
    console.error("aviso de não lidas: usuária do pós-venda não encontrada no GHL", { nome: POS_VENDA_USUARIO });
    return { quente, posVenda: { erro: `usuária ${POS_VENDA_USUARIO} não encontrada no GHL` } };
  }
  const posVenda = await rodar(
    { tipo: "pos_venda", usuario: amanda, dono: amanda.id, tag: TAG_AVISOS_POS_VENDA },
    { dryRun: opts.dryRun, now },
  );
  return { quente, posVenda };
}
