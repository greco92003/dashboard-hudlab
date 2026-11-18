import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { FICHA_AGENT_MODEL, FICHA_PROMPT_VERSION, gerarRascunhoFicha } from "@/lib/ghl/ficha-pedido/agente";
import type { FichaRascunho } from "@/lib/ghl/ficha-pedido/regras";

const TABELA = "ficha_rascunhos";

export interface EstadoRascunhoFicha {
  status: "gerando" | "pronto" | "erro";
  rascunho: FichaRascunho | null;
  erro: string | null;
  geradoEm: string | null;
  atualizadoEm: string;
}

function banco(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is not configured");
  return createClient(url, getSupabaseSecretKey(), { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function lerRascunhoFicha(opportunityId: string): Promise<EstadoRascunhoFicha | null> {
  const { data, error } = await banco()
    .from(TABELA)
    .select("status, rascunho, erro, gerado_em, atualizado_em")
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    status: data.status,
    rascunho: (data.rascunho as FichaRascunho | null) ?? null,
    erro: data.erro ?? null,
    geradoEm: data.gerado_em ?? null,
    atualizadoEm: data.atualizado_em,
  };
}

/**
 * Gera e guarda o rascunho. Sem `forcar`, não refaz um rascunho pronto nem
 * disputa uma geração em andamento (o GHL repete webhooks da mesma mudança).
 * O token garante que uma geração antiga não sobrescreve uma mais nova.
 */
export async function prepararRascunhoFicha(
  opportunityId: string,
  opcoes: { forcar?: boolean } = {},
): Promise<"gerado" | "ocupado" | "erro"> {
  const supabase = banco();
  const token = crypto.randomUUID();
  const reserva = await supabase.rpc("reservar_ficha_rascunho", {
    p_opportunity_id: opportunityId,
    p_token: token,
    p_forcar: opcoes.forcar ?? false,
  });
  if (reserva.error) throw reserva.error;
  if (reserva.data !== true) return "ocupado";

  try {
    const { rascunho, resposta } = await gerarRascunhoFicha(opportunityId);
    const { error } = await supabase
      .from(TABELA)
      .update({
        status: "pronto",
        rascunho,
        resposta,
        erro: null,
        modelo: FICHA_AGENT_MODEL,
        versao_prompt: FICHA_PROMPT_VERSION,
        token: null,
        reservado_ate: null,
        gerado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq("opportunity_id", opportunityId)
      .eq("token", token);
    if (error) throw error;
    return "gerado";
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Falha desconhecida";
    console.error("Rascunho da ficha do pedido falhou", { opportunityId, erro: mensagem });
    await supabase
      .from(TABELA)
      .update({ status: "erro", erro: mensagem.slice(0, 500), token: null, reservado_ate: null, atualizado_em: new Date().toISOString() })
      .eq("opportunity_id", opportunityId)
      .eq("token", token);
    return "erro";
  }
}
