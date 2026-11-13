import "server-only";

import { fetchGhlPipelines, searchGhlOpportunitiesByStage, type GhlOpportunity } from "@/lib/ghl/api";
import { AI_TAG } from "@/lib/ghl/ai-seller/config";
import { loadSellerSettings } from "@/lib/ghl/ai-seller/settings";
import {
  getPhoneConversationOverview,
  getQtyParesForOpportunity,
  getRecentWhatsappMessages,
  type NegotiationMessage,
} from "@/lib/ghl/negotiation-conversations";
import { runControleFechamento } from "@/lib/ghl/sales-agent/agent";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { dataDeBrasilia, estadoDaLinha, type LinhaDoCard } from "./linha";
import { situacaoDoCard } from "./regras";
import { encerrarTarefa, sincronizarTarefa } from "./tarefa";

export const PIPELINE_DO_PAINEL = "Atendimento";
/** Etapas do painel, pelo nome (a ordem no CRM muda quando criam etapa). */
export const ETAPAS_DO_PAINEL = ["Quero aproveitar", "Prioridade de Fechamento", "Finalizando Venda"] as const;
const TABELA = "fechamento_cards";
const CONCORRENCIA = 3;
/** Leituras da Cami por rodada: o resto fica para a próxima (custo e tempo da rota). */
const MAX_LEITURAS_CAMI = 15;

async function emParalelo<T>(itens: T[], limite: number, fn: (item: T) => Promise<void>) {
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, async () => {
      while (proximo < itens.length) await fn(itens[proximo++]);
    }),
  );
}

/** Da conversa: última do cliente, última nossa e se a última de todas é do cliente. */
function resumoDasMensagens(mensagens: NegotiationMessage[]) {
  const ultimaCliente = [...mensagens].reverse().find((m) => m.direction === "inbound") ?? null;
  const ultimaNossa = [...mensagens].reverse().find((m) => m.direction === "outbound") ?? null;
  const ultima = mensagens.at(-1) ?? null;
  return {
    ultima_cliente_em: ultimaCliente?.dateAdded ?? null,
    ultima_cliente_id: ultimaCliente?.id ?? null,
    ultima_cliente_texto: ultimaCliente ? (ultimaCliente.body || (ultimaCliente.attachments.length ? "(anexo)" : "")).slice(0, 300) : null,
    ultima_nossa_em: ultimaNossa?.dateAdded ?? null,
    cliente_esperando: ultima?.direction === "inbound",
  };
}

const ISO = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);

/**
 * Relê no GHL os cards das etapas do painel, guarda o estado de cada um,
 * deixa a tarefa de follow-up do GHL no prazo e tira do painel o que saiu
 * das etapas. Só relê as mensagens de conversa que mudou desde a última vez.
 */
export async function atualizarPainelDeFechamento(): Promise<{
  cards: number;
  leiturasCami: number;
  sairam: number;
  erros: number;
}> {
  const supabase = await createSupabaseServerForSync();
  const agora = Date.now();
  const { shifts } = await loadSellerSettings();

  const pipeline = (await fetchGhlPipelines()).find((p) => p.name === PIPELINE_DO_PAINEL);
  if (!pipeline) throw new Error(`pipeline ${PIPELINE_DO_PAINEL} não encontrado no GHL`);
  const etapas = (pipeline.stages ?? []).filter((s) => (ETAPAS_DO_PAINEL as readonly string[]).includes(s.name.trim()));
  const oportunidades: Array<{ opp: GhlOpportunity; etapa: string }> = [];
  for (const etapa of etapas) {
    for (const opp of await searchGhlOpportunitiesByStage(pipeline.id, etapa.id, "open")) {
      if (opp.contactId) oportunidades.push({ opp, etapa: etapa.name.trim() });
    }
  }

  const { data: existentes, error: erroLeitura } = await supabase.from(TABELA).select("*");
  if (erroLeitura) throw new Error(`${TABELA}: ${erroLeitura.message}`);
  const anteriores = new Map((existentes as LinhaDoCard[]).map((l) => [l.opportunity_id, l]));

  const linhas: LinhaDoCard[] = [];
  let leiturasCami = 0;
  let erros = 0;
  await emParalelo(oportunidades, CONCORRENCIA, async ({ opp, etapa }) => {
    const antes = anteriores.get(opp.id);
    try {
      const contatoId = opp.contactId as string;
      const conversa = await getPhoneConversationOverview(contatoId);
      const conversaMudou = Boolean(conversa) && ISO(conversa?.lastMessageDate) !== (antes?.conversa_atualizada_em ? new Date(antes.conversa_atualizada_em).toISOString() : null);
      let mensagens: NegotiationMessage[] | null = null;
      let resumo = antes
        ? {
            ultima_cliente_em: antes.ultima_cliente_em,
            ultima_cliente_id: antes.ultima_cliente_id,
            ultima_cliente_texto: antes.ultima_cliente_texto,
            ultima_nossa_em: antes.ultima_nossa_em,
            cliente_esperando: antes.cliente_esperando,
          }
        : resumoDasMensagens([]);
      if (conversa && (conversaMudou || !antes)) {
        mensagens = await getRecentWhatsappMessages(conversa.conversationId, 40);
        resumo = resumoDasMensagens(mensagens);
      }

      const linha: LinhaDoCard = {
        opportunity_id: opp.id,
        contact_id: contatoId,
        contact_name: opp.contact?.name || opp.name || null,
        stage_name: etapa,
        monetary_value: opp.monetaryValue ?? null,
        qty_pares: await getQtyParesForOpportunity(opp),
        assigned_to: opp.assignedTo ?? null,
        na_etapa_desde: opp.lastStageChangeAt ?? opp.createdAt ?? null,
        conversation_id: conversa?.conversationId ?? null,
        conversa_atualizada_em: ISO(conversa?.lastMessageDate),
        ...resumo,
        cami_atendendo: Boolean(conversa?.tags.includes(AI_TAG)),
        combinado: antes?.combinado ?? null,
        data_combinada: antes?.data_combinada ?? null,
        pendencia: antes?.pendencia ?? null,
        sinal: antes?.sinal ?? null,
        cami_lido_id: antes?.cami_lido_id ?? null,
        cami_erro: antes?.cami_erro ?? null,
        adiado_ate: antes?.adiado_ate ?? null,
        contato_manual_em: antes?.contato_manual_em ?? null,
        ghl_task_id: antes?.ativo === false ? null : (antes?.ghl_task_id ?? null),
        ghl_task_prazo: antes?.ativo === false ? null : (antes?.ghl_task_prazo ?? null),
        ativo: true,
        atualizado_em: new Date(agora).toISOString(),
      };

      // A Cami lê o combinado só quando chega mensagem nova do cliente.
      if (linha.ultima_cliente_id && linha.ultima_cliente_id !== linha.cami_lido_id && leiturasCami < MAX_LEITURAS_CAMI) {
        leiturasCami++;
        try {
          const lidas = mensagens ?? (conversa ? await getRecentWhatsappMessages(conversa.conversationId, 40) : []);
          const c = await runControleFechamento(lidas.slice(-30), { etapaCrm: etapa, qtyPares: linha.qty_pares });
          linha.combinado = c.combinado;
          linha.data_combinada = dataDeBrasilia(c.data_combinada);
          linha.pendencia = c.pendencia;
          linha.sinal = c.sinal;
          linha.cami_lido_id = linha.ultima_cliente_id;
          linha.cami_erro = null;
        } catch (err) {
          linha.cami_erro = err instanceof Error ? err.message.slice(0, 300) : String(err);
          console.error("Painel de fechamento: leitura da Cami falhou", { oportunidade: opp.id, err });
        }
      }

      try {
        await sincronizarTarefa(linha, situacaoDoCard(estadoDaLinha(linha), agora, shifts), agora);
      } catch (err) {
        console.error("Painel de fechamento: tarefa do GHL não sincronizada", { oportunidade: opp.id, err });
      }
      linhas.push(linha);
    } catch (err) {
      erros++;
      console.error("Painel de fechamento: card não atualizado", { oportunidade: opp.id, err });
      if (antes) linhas.push({ ...antes, ativo: true });
    }
  });

  if (linhas.length) {
    const { error } = await supabase.from(TABELA).upsert(linhas, { onConflict: "opportunity_id" });
    if (error) throw new Error(`${TABELA} upsert: ${error.message}`);
  }

  // O que saiu das etapas (ganho, perdido, outra etapa): fora do painel e tarefa concluída.
  const atuais = new Set(linhas.map((l) => l.opportunity_id));
  const sairam = (existentes as LinhaDoCard[]).filter((l) => l.ativo && !atuais.has(l.opportunity_id));
  for (const l of sairam) {
    try {
      await encerrarTarefa(l);
    } catch (err) {
      console.error("Painel de fechamento: tarefa não concluída", { oportunidade: l.opportunity_id, err });
    }
    const { error } = await supabase
      .from(TABELA)
      .update({ ativo: false, ghl_task_id: null, ghl_task_prazo: null, atualizado_em: new Date(agora).toISOString() })
      .eq("opportunity_id", l.opportunity_id);
    if (error) console.error("Painel de fechamento: card não desativado", { oportunidade: l.opportunity_id, error });
  }

  return { cards: linhas.length, leiturasCami, sairam: sairam.length, erros };
}
