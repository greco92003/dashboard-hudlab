// Linha da tabela fechamento_cards e como ela vira o estado das regras. Módulo puro.
import type { EstadoDoCard } from "./regras";

export interface LinhaDoCard {
  opportunity_id: string;
  contact_id: string;
  contact_name: string | null;
  stage_name: string;
  monetary_value: number | null;
  qty_pares: number | null;
  assigned_to: string | null;
  na_etapa_desde: string | null;
  conversation_id: string | null;
  conversa_atualizada_em: string | null;
  ultima_cliente_em: string | null;
  ultima_cliente_id: string | null;
  ultima_cliente_texto: string | null;
  ultima_nossa_em: string | null;
  cliente_esperando: boolean;
  cami_atendendo: boolean;
  combinado: string | null;
  data_combinada: string | null;
  pendencia: string | null;
  sinal: "quente" | "neutro" | "esfriando" | "perdendo" | null;
  cami_lido_id: string | null;
  cami_erro: string | null;
  adiado_ate: string | null;
  contato_manual_em: string | null;
  ghl_task_id: string | null;
  ghl_task_prazo: string | null;
  ativo: boolean;
  atualizado_em: string;
}

const ms = (iso: string | null) => (iso ? Date.parse(iso) : null);

export function estadoDaLinha(l: LinhaDoCard): EstadoDoCard {
  return {
    ultimaClienteEm: ms(l.ultima_cliente_em),
    ultimaNossaEm: ms(l.ultima_nossa_em),
    clienteEsperando: l.cliente_esperando,
    contatoManualEm: ms(l.contato_manual_em),
    adiadoAte: ms(l.adiado_ate),
    dataCombinada: ms(l.data_combinada),
    camiAtendendo: l.cami_atendendo,
    naEtapaDesde: ms(l.na_etapa_desde),
  };
}

/** "2026-11-16" (data dita pelo cliente) → meia-noite de Brasília, ISO. Data inválida vira null. */
export function dataDeBrasilia(aaaaMmDd: string | null | undefined): string | null {
  if (!aaaaMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(aaaaMmDd)) return null;
  const t = Date.parse(`${aaaaMmDd}T00:00:00-03:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
