import "server-only";

import { fetchGhlPipelines } from "@/lib/ghl/api";
import { loadSellerSettings } from "@/lib/ghl/ai-seller/settings";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { adicionarNota, inscreverNoWorkflow, marcarPerdida, moverEtapa, workflowPublicado } from "./ghl";
import { dataDeBrasilia, estadoDaLinha, type LinhaDoCard } from "./linha";
import { MOTIVOS_DE_PERDA, primeiroMomentoDeTurno, situacaoDoCard } from "./regras";
import { PIPELINE_DO_PAINEL } from "./refresh";
import { encerrarTarefa, sincronizarTarefa } from "./tarefa";

const TABELA = "fechamento_cards";
/** Para onde vai o card no "Fechou": daqui em diante é pagamento e pós-venda. */
export const ETAPA_DO_FECHOU = "Pagamento Confirmado/Completar Dados";

export type Acao = "contato" | "adiar" | "modelo" | "perdido" | "fechou";

export class ErroDeAcao extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * Workflow "Fechamento | Follow-up por modelo" (sem gatilho, reentrada ligada,
 * publicado em 13/11/2026): manda o modelo aprovado follow_negociacao_black_m1.
 * A inscrição é pela API. Depois da Black, trocar o modelo no próprio GHL.
 */
const WORKFLOW_DO_MODELO = "d0d7b5c9-23c9-4e50-b119-f2ffaf7e325e";
function workflowDoModelo(): string {
  return process.env.FECHAMENTO_MODELO_WORKFLOW_ID || WORKFLOW_DO_MODELO;
}

export async function executarAcao(
  oportunidadeId: string,
  acao: Acao,
  opcoes: { motivo?: string; ate?: string; userId: string },
): Promise<{ ok: true; saiuDoPainel: boolean }> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase.from(TABELA).select("*").eq("opportunity_id", oportunidadeId).maybeSingle();
  if (error) throw new Error(`${TABELA}: ${error.message}`);
  if (!data || !data.ativo) throw new ErroDeAcao("Card não está no painel (já saiu da etapa?)", 404);
  const linha = data as LinhaDoCard;
  const agora = Date.now();
  const { shifts } = await loadSellerSettings();
  let motivo: string | null = null;
  let detalhe: Record<string, unknown> | null = null;
  let saiuDoPainel = false;

  switch (acao) {
    case "contato":
      linha.contato_manual_em = new Date(agora).toISOString();
      break;
    case "adiar": {
      const dia = dataDeBrasilia(opcoes.ate);
      if (!dia) throw new ErroDeAcao("Escolha a data para retomar o contato.");
      const ate = primeiroMomentoDeTurno(Date.parse(dia), shifts);
      if (ate <= agora) throw new ErroDeAcao("A data precisa ser depois de hoje.");
      linha.adiado_ate = new Date(ate).toISOString();
      detalhe = { ate: linha.adiado_ate };
      break;
    }
    case "modelo": {
      const s = situacaoDoCard(estadoDaLinha(linha), agora, shifts);
      if (s.janelaAberta) throw new ErroDeAcao("A janela de 24h está aberta: dá para escrever livre, sem custo de modelo.");
      const workflowId = workflowDoModelo();
      if (!(await workflowPublicado(workflowId))) throw new ErroDeAcao("O fluxo do modelo de follow-up não está publicado.", 503);
      await inscreverNoWorkflow(linha.contact_id, workflowId);
      linha.contato_manual_em = new Date(agora).toISOString();
      break;
    }
    case "perdido": {
      if (!opcoes.motivo || !(MOTIVOS_DE_PERDA as readonly string[]).includes(opcoes.motivo)) {
        throw new ErroDeAcao("Escolha o motivo da perda.");
      }
      motivo = opcoes.motivo;
      await marcarPerdida(oportunidadeId);
      await adicionarNota(linha.contact_id, `Perdido no painel de fechamento: ${motivo}.`).catch((err) =>
        console.error("Painel de fechamento: nota da perda não gravada", err),
      );
      saiuDoPainel = true;
      break;
    }
    case "fechou": {
      const pipeline = (await fetchGhlPipelines()).find((p) => p.name === PIPELINE_DO_PAINEL);
      const etapa = pipeline?.stages?.find((s) => s.name.trim() === ETAPA_DO_FECHOU);
      if (!pipeline || !etapa) throw new Error(`etapa ${ETAPA_DO_FECHOU} não encontrada no GHL`);
      await moverEtapa(oportunidadeId, pipeline.id, etapa.id);
      saiuDoPainel = true;
      break;
    }
  }

  if (saiuDoPainel) {
    await encerrarTarefa(linha).catch((err) => console.error("Painel de fechamento: tarefa não concluída", err));
    linha.ativo = false;
    linha.ghl_task_id = null;
    linha.ghl_task_prazo = null;
  } else {
    await sincronizarTarefa(linha, situacaoDoCard(estadoDaLinha(linha), agora, shifts), agora).catch((err) =>
      console.error("Painel de fechamento: tarefa do GHL não sincronizada", err),
    );
  }
  linha.atualizado_em = new Date(agora).toISOString();

  const { error: erroGravar } = await supabase.from(TABELA).upsert(linha, { onConflict: "opportunity_id" });
  if (erroGravar) throw new Error(`${TABELA}: ${erroGravar.message}`);
  const { error: erroEvento } = await supabase.from("fechamento_eventos").insert({
    opportunity_id: oportunidadeId,
    contact_id: linha.contact_id,
    tipo: acao,
    motivo,
    detalhe,
    user_id: opcoes.userId,
  });
  if (erroEvento) console.error("Painel de fechamento: evento não gravado", erroEvento);
  return { ok: true, saiuDoPainel };
}
