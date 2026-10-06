import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { requireAdmin } from "@/lib/security/route-guards";
import {
  INTEGRATION_HEALTH_LABELS,
  type IntegrationHealthKey,
} from "@/lib/ghl/integration-health";

export const runtime = "nodejs";

type HealthRow = {
  key: IntegrationHealthKey;
  status: "ok" | "atencao";
  mensagem: string | null;
  verificado_em: string;
};

/** Um sync que parou de rodar não registra falha: o silêncio é o problema. */
const MAX_SILENCE_MS: Partial<Record<IntegrationHealthKey, number>> = {
  ghl_sync_ganhos: 60 * 60 * 1_000,
  ghl_sync_completo: 26 * 60 * 60 * 1_000,
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export async function GET() {
  const access = await requireAdmin();
  if (!access.ok) return access.response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
  const { data, error } = await createClient(url, getSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
    .from("integration_health")
    .select("key, status, mensagem, verificado_em");
  if (error) {
    console.error("Integration health read failed", error);
    return NextResponse.json({ error: "Não foi possível ler a saúde das integrações." }, { status: 502 });
  }

  const now = Date.now();
  const problems = ((data ?? []) as HealthRow[]).flatMap((row) => {
    const label = INTEGRATION_HEALTH_LABELS[row.key] ?? row.key;
    const messages: string[] = [];
    if (row.status === "atencao" && row.mensagem) messages.push(row.mensagem);
    const maxSilence = MAX_SILENCE_MS[row.key];
    if (maxSilence && now - Date.parse(row.verificado_em) > maxSilence) {
      messages.push(`Não roda desde ${formatDateTime(row.verificado_em)}.`);
    }
    return messages.length
      ? [{ key: row.key, label, message: messages.join(" "), checkedAt: row.verificado_em }]
      : [];
  });

  return NextResponse.json({ problems }, { headers: { "Cache-Control": "no-store" } });
}
