import { createClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";

export { impressaoDaAutorizacao } from "@/lib/security/webhook-verification";

/**
 * Registro das recusas de webhook.
 *
 * Existe por causa de 02-04/09/2026: o funil passou 42 h sem evento enquanto
 * os workflows do GHL disparavam normalmente -- 103 requisições por dia,
 * 97 delas voltando 401 porque o secret deixou de bater. O código só fazia
 * `console.warn`, então nada disso aparecia no banco. Quem olhasse o Supabase
 * via silêncio e concluía que o GHL tinha parado.
 *
 * Gravar é best-effort: se a escrita falhar, a recusa segue seu caminho
 * normalmente. Observabilidade não pode derrubar o que ela observa.
 */
export type WebhookRejectionReason =
  | "nao_configurado"
  | "autorizacao_invalida"
  | "corpo_vazio"
  | "corpo_grande_demais"
  | "json_invalido"
  | "timestamp_invalido"
  | "timestamp_antigo"
  | "etapa_desconhecida"
  | "sem_contact_id"
  | "persistencia_indisponivel"
  | "falha_ao_gravar"
  | "evento_ignorado"
  | "location_errada";

export interface WebhookRejectionInput {
  provider: string;
  rota: string;
  motivo: WebhookRejectionReason;
  status: number;
  detalhe?: Record<string, unknown>;
}

export async function logWebhookRejection(
  input: WebhookRejectionInput,
): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return;

    const supabase = createClient(supabaseUrl, getSupabaseSecretKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await supabase.from("webhook_rejections").insert({
      provider: input.provider,
      rota: input.rota,
      motivo: input.motivo,
      status: input.status,
      detalhe: input.detalhe ?? {},
    });
  } catch (erro) {
    // Nunca propaga: o webhook já está sendo recusado, e falhar aqui só
    // trocaria uma recusa clara por um 500 confuso.
    console.error("[webhook-rejections] falha ao registrar recusa", erro);
  }
}
