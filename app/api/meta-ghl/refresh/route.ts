import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";

// Dispara sync-meta e sync-ghl sob demanda (botão "Atualizar" do módulo
// Meta Marketing GHL) -- as duas normalmente só rodam 1x/dia via pg_cron
// (09:00/09:10 UTC), então negócios fechados depois disso só apareciam
// no dia seguinte. Ambas funções já são idempotentes (upsert por id) e
// aceitam ser chamadas a qualquer momento sem efeito colateral.
//
// sync-ghl processa em fases encadeadas (opportunities -> contacts ->
// snapshot) via EdgeRuntime.waitUntil -- essa chamada só confirma que a
// primeira fase iniciou, o restante continua em segundo plano.
const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;

async function chamarFuncao(nome: string) {
  try {
    const res = await fetch(`${FUNCTIONS_URL}/${nome}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function POST() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseSecretKey(),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: claimed, error: claimError } = await supabase.rpc(
    "try_claim_marketing_refresh",
  );
  if (claimError) {
    console.error("Marketing refresh gate failed", claimError);
    return NextResponse.json(
      { ok: false, error: "Não foi possível iniciar a sincronização." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!claimed) {
    return NextResponse.json(
      { ok: true, alreadyRunning: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const [meta, ghl] = await Promise.all([
    chamarFuncao("sync-meta"),
    chamarFuncao("sync-ghl"),
  ]);

  const ok = meta.ok && ghl.ok;
  if (!ok) {
    const { error: releaseError } = await supabase.rpc("release_marketing_refresh");
    if (releaseError) console.error("Marketing refresh gate release failed", releaseError);
  }
  return NextResponse.json(
    { ok, meta, ghl },
    { status: ok ? 200 : 502, headers: { "Cache-Control": "no-store" } },
  );
}
