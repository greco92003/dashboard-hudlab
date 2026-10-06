import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";

/**
 * Saúde do webhook e dos syncs do GHL, mostrada ao admin no Live Dashboard.
 *
 * Gravar é best-effort: falhar aqui não pode derrubar o sync que está sendo
 * observado.
 */
export type IntegrationHealthKey =
  | "ghl_webhook"
  | "ghl_sync_ganhos"
  | "ghl_sync_completo";

export const INTEGRATION_HEALTH_LABELS: Record<IntegrationHealthKey, string> = {
  ghl_webhook: "Webhook de negócios do GHL",
  ghl_sync_ganhos: "Sync de ganhos (15 min)",
  ghl_sync_completo: "Sync completo diário",
};

/**
 * O webhook só dá sinal quando um negócio muda; sem mudança, o check do
 * sync não tem como confirmar que ele voltou. Por isso o aviso dele fica
 * 24 h no ar depois do último problema, em vez de sumir na rodada seguinte.
 */
const PROBLEM_HOLD_MS: Record<IntegrationHealthKey, number> = {
  ghl_webhook: 24 * 60 * 60 * 1_000,
  ghl_sync_ganhos: 0,
  ghl_sync_completo: 0,
};

const TABLE = "integration_health";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  return createClient(url, getSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function reportIntegrationProblem(
  key: IntegrationHealthKey,
  mensagem: string,
  detalhe: Record<string, unknown> = {},
) {
  try {
    const now = new Date().toISOString();
    const { error } = await client().from(TABLE).upsert({
      key,
      status: "atencao",
      mensagem,
      detalhe,
      verificado_em: now,
      ultimo_problema_em: now,
    });
    if (error) throw error;
  } catch (error) {
    console.error("Integration health: falha ao registrar problema", key, error);
  }
}

export async function reportIntegrationOk(
  key: IntegrationHealthKey,
  detalhe: Record<string, unknown> = {},
) {
  try {
    const supabase = client();
    const now = new Date();
    const { data, error: readError } = await supabase
      .from(TABLE)
      .select("ultimo_problema_em")
      .eq("key", key)
      .maybeSingle();
    if (readError) throw readError;

    const lastProblem = Date.parse(data?.ultimo_problema_em ?? "");
    const holding = Number.isFinite(lastProblem)
      && now.getTime() - lastProblem < PROBLEM_HOLD_MS[key];
    const { error } = holding
      ? await supabase.from(TABLE).update({ verificado_em: now.toISOString() }).eq("key", key)
      : await supabase.from(TABLE).upsert({
          key,
          status: "ok",
          mensagem: null,
          detalhe,
          verificado_em: now.toISOString(),
          ultimo_ok_em: now.toISOString(),
        });
    if (error) throw error;
  } catch (error) {
    console.error("Integration health: falha ao registrar ok", key, error);
  }
}

/** Recusas reais do webhook de negócios nas últimas 24 h (fora o funil). */
export async function recentOpportunityWebhookRejections() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
  const { data, error } = await client()
    .from("webhook_rejections")
    .select("motivo")
    .eq("provider", "ghl")
    .like("rota", "/api/webhooks/ghl%")
    .neq("rota", "/api/webhooks/ghl/funnel")
    .neq("motivo", "evento_ignorado")
    .gte("received_at", since);
  if (error) throw new Error(`Leitura das recusas do webhook falhou: ${error.message}`);
  const byReason = new Map<string, number>();
  for (const row of data ?? []) {
    byReason.set(row.motivo, (byReason.get(row.motivo) ?? 0) + 1);
  }
  return { total: data?.length ?? 0, byReason: Object.fromEntries(byReason) };
}
