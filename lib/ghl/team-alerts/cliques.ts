import "server-only";

import { fetchGhlPipelines, searchGhlOpportunitiesByContact, type GhlOpportunity } from "@/lib/ghl/api";
import {
  getQtyParesForOpportunity,
  getRecentWhatsappMessages,
  getVendedorForOpportunity,
  searchRecentInboundWhatsappConversations,
} from "@/lib/ghl/negotiation-conversations";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { dentroDoHorarioDeAviso, inicioDaBusca, ultimoClique } from "./rules";
import { avisarTime } from "./send";
import { avisoDeClique, botaoDoClique, campanhaDoEnvio, juntarAvisos, linkDoContato, type Aviso } from "./text";

// Cliques nos botões das campanhas (Quero Aproveitar, Ver Tabela, Fazer
// Pedido, Consultar Prazo, aceite da Lista VIP) que ninguém do time respondeu.
// Roda no cron avisos-time a cada 5 min e avisa no WhatsApp do time. Cada
// clique avisa uma vez só (tabela avisos_time_enviados).

const ESTADO = "avisos_time_estado";
const ENVIADOS = "avisos_time_enviados";
const CONCORRENCIA = 5;

interface Clique {
  messageId: string;
  contactId: string;
  aviso: Aviso;
}

async function emLotes<T, R>(itens: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += CONCORRENCIA) {
    saida.push(...(await Promise.all(itens.slice(i, i + CONCORRENCIA).map(fn))));
  }
  return saida;
}

function negocioAberto(opportunities: GhlOpportunity[]): GhlOpportunity | null {
  const abertas = opportunities.filter((o) => o.status === "open");
  const lista = abertas.length ? abertas : opportunities;
  return [...lista].sort((a, b) => Date.parse(b.updatedAt ?? b.createdAt ?? "") - Date.parse(a.updatedAt ?? a.createdAt ?? ""))[0] ?? null;
}

/** `dryRun`: só mostra o que avisaria (ignora o horário, não grava nem envia). */
export async function avisarCliquesSemResposta(
  agoraMs = Date.now(),
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<Record<string, unknown>> {
  if (!dryRun && !dentroDoHorarioDeAviso(agoraMs)) return { rodou: false, motivo: "fora do horário de aviso" };
  const supabase = await createSupabaseServerForSync();
  const { data: estado } = await supabase.from(ESTADO).select("ultima_execucao").eq("id", 1).maybeSingle();
  const desde = inicioDaBusca(estado?.ultima_execucao ? Date.parse(estado.ultima_execucao) : null, agoraMs);

  const conversas = await searchRecentInboundWhatsappConversations(desde);
  const pipelines = await fetchGhlPipelines();
  const etapa = new Map(pipelines.flatMap((p) => (p.stages ?? []).map((s) => [s.id, s.name] as const)));

  const achados = await emLotes(conversas, async (c): Promise<Clique | { atendido: string } | null> => {
    const mensagens = await getRecentWhatsappMessages(c.conversationId, 30);
    const clique = ultimoClique(mensagens, desde, (corpo) => botaoDoClique(corpo) != null);
    if (!clique) return null;
    if (clique.atendido) return { atendido: clique.mensagem.id };
    const negocio = negocioAberto(await searchGhlOpportunitiesByContact(c.contactId).catch(() => []));
    const [pares, vendedor] = negocio
      ? await Promise.all([getQtyParesForOpportunity(negocio), getVendedorForOpportunity(negocio)])
      : [null, null];
    return {
      messageId: clique.mensagem.id,
      contactId: c.contactId,
      aviso: avisoDeClique({
        nome: c.contactName,
        botao: botaoDoClique(clique.mensagem.body) as string,
        campanha: clique.envioAnterior ? campanhaDoEnvio(clique.envioAnterior) : null,
        quandoMs: Date.parse(clique.mensagem.dateAdded),
        pares,
        etapa: negocio?.pipelineStageId ? etapa.get(negocio.pipelineStageId) ?? null : null,
        vendedor,
        respostaDaCami: clique.respostaDaCami,
        link: linkDoContato(c.contactId),
      }),
    };
  });

  const cliques = achados.filter((a): a is Clique => a != null && "aviso" in a);
  if (dryRun) {
    const { data: jaAvisados } = await supabase
      .from(ENVIADOS)
      .select("message_id")
      .in("message_id", cliques.map((c) => c.messageId));
    const avisados = new Set((jaAvisados ?? []).map((r) => r.message_id as string));
    const pendentes = cliques.filter((c) => !avisados.has(c.messageId));
    return {
      dryRun: true,
      desde: new Date(desde).toISOString(),
      conversas: conversas.length,
      cliques: cliques.length,
      jaAvisados: cliques.length - pendentes.length,
      aviso: pendentes.length ? juntarAvisos(pendentes.map((p) => p.aviso)) : null,
    };
  }
  // Só avisa o que ainda não avisou: o insert é a trava (message_id é a chave).
  const novos: Clique[] = [];
  for (const clique of cliques) {
    const { data, error } = await supabase
      .from(ENVIADOS)
      .upsert(
        { message_id: clique.messageId, contact_id: clique.contactId, status: "avisado" },
        { onConflict: "message_id", ignoreDuplicates: true },
      )
      .select("message_id");
    if (error) throw new Error(`${ENVIADOS}: ${error.message}`);
    if (data?.length) novos.push(clique);
  }

  const resultado = novos.length ? await avisarTime(juntarAvisos(novos.map((n) => n.aviso))) : [];
  await supabase.from(ESTADO).upsert({ id: 1, ultima_execucao: new Date(agoraMs).toISOString() });
  return {
    rodou: true,
    desde: new Date(desde).toISOString(),
    conversas: conversas.length,
    cliques: cliques.length,
    jaAtendidos: achados.filter((a) => a != null && "atendido" in a).length,
    avisados: novos.length,
    envio: resultado,
  };
}
