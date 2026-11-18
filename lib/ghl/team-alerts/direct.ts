import "server-only";

import {
  getRecentMessagesAllChannels,
  searchRecentConversationsWithTags,
} from "@/lib/ghl/negotiation-conversations";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { canalDoDirect, dentroDoHorarioDeAviso, ehPedidoDePessoa, inicioDaBusca, ultimoClique } from "./rules";
import { avisarTime } from "./send";
import { avisoDePedidoNoDirect, juntarAvisos, linkDoContato, type Aviso } from "./text";

// Pedidos de atendimento humano no Direct do Instagram e do Facebook que
// ninguém do time respondeu. O workflow "Responder DM Instagram v2 Black"
// marca o contato (ig_quer_pessoa / fb_quer_pessoa), atribui à Schay e manda só
// a notificação interna do GHL, que se perde no app: de 05 a 18/11/2026, 11 de
// 15 pedidos ficaram sem resposta. Aqui o pedido vira aviso no WhatsApp do
// time, uma vez por mensagem (mesma tabela dos cliques).

// Lê a última execução gravada pelos cliques e não grava nada: roda antes deles
// no mesmo cron, então o "desde" é o mesmo (a tabela de estado tem uma linha só).
const ESTADO = "avisos_time_estado";
const ENVIADOS = "avisos_time_enviados";
const TAGS = ["ig_quer_pessoa", "fb_quer_pessoa"];

interface Pedido {
  messageId: string;
  contactId: string;
  aviso: Aviso;
}

/** `dryRun`: só mostra o que avisaria (ignora o horário, não grava nem envia). */
export async function avisarPedidosNoDirect(
  agoraMs = Date.now(),
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<Record<string, unknown>> {
  if (!dryRun && !dentroDoHorarioDeAviso(agoraMs)) return { rodou: false, motivo: "fora do horário de aviso" };
  const supabase = await createSupabaseServerForSync();
  const { data: estado } = await supabase.from(ESTADO).select("ultima_execucao").eq("id", 1).maybeSingle();
  const desde = inicioDaBusca(estado?.ultima_execucao ? Date.parse(estado.ultima_execucao) : null, agoraMs);

  const conversas = await searchRecentConversationsWithTags(desde, TAGS);
  const pedidos: Pedido[] = [];
  let atendidos = 0;
  // Uma por vez: costumam ser poucas, e a leitura divide o limite de rajada do GHL.
  for (const c of conversas) {
    const mensagens = await getRecentMessagesAllChannels(c.conversationId, 30);
    const doDirect = new Set(mensagens.filter((m) => canalDoDirect(m.messageType)).map((m) => m.id));
    const pedido = ultimoClique(
      mensagens.map((m) => ({ ...m, body: doDirect.has(m.id) ? m.body : "" })),
      desde,
      ehPedidoDePessoa,
    );
    if (!pedido) continue;
    if (pedido.atendido) {
      atendidos++;
      continue;
    }
    const original = mensagens.find((m) => m.id === pedido.mensagem.id);
    pedidos.push({
      messageId: pedido.mensagem.id,
      contactId: c.contactId,
      aviso: avisoDePedidoNoDirect({
        nome: c.contactName,
        canal: canalDoDirect(original?.messageType ?? "") ?? "Instagram",
        texto: original?.body ?? "",
        quandoMs: Date.parse(pedido.mensagem.dateAdded),
        link: linkDoContato(c.contactId),
      }),
    });
  }

  if (dryRun) {
    const { data: jaAvisados } = await supabase
      .from(ENVIADOS)
      .select("message_id")
      .in("message_id", pedidos.map((p) => p.messageId));
    const avisados = new Set((jaAvisados ?? []).map((r) => r.message_id as string));
    const pendentes = pedidos.filter((p) => !avisados.has(p.messageId));
    return {
      dryRun: true,
      desde: new Date(desde).toISOString(),
      conversas: conversas.length,
      pedidos: pedidos.length,
      jaAvisados: pedidos.length - pendentes.length,
      aviso: pendentes.length ? juntarAvisos(pendentes.map((p) => p.aviso)) : null,
    };
  }

  // Só avisa o que ainda não avisou: o insert é a trava (message_id é a chave).
  const novos: Pedido[] = [];
  for (const pedido of pedidos) {
    const { data, error } = await supabase
      .from(ENVIADOS)
      .upsert(
        { message_id: pedido.messageId, contact_id: pedido.contactId, status: "avisado" },
        { onConflict: "message_id", ignoreDuplicates: true },
      )
      .select("message_id");
    if (error) throw new Error(`${ENVIADOS}: ${error.message}`);
    if (data?.length) novos.push(pedido);
  }

  const resultado = novos.length ? await avisarTime(juntarAvisos(novos.map((n) => n.aviso))) : [];
  return {
    rodou: true,
    desde: new Date(desde).toISOString(),
    conversas: conversas.length,
    pedidos: pedidos.length,
    jaAtendidos: atendidos,
    avisados: novos.length,
    envio: resultado,
  };
}
