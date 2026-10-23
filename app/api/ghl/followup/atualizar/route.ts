import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";

/**
 * Botão "Atualizar" da aba Follow-Up: lê de novo do GHL as tags medidas
 * (follow_*, campanha_*, lista_vip) antes de a página recarregar os números.
 *
 * O sync completo roda 1x/dia e leva ~6 min, quase tudo na fase de
 * oportunidades; a aba só depende das tags, que levam ~1 min. Venda ganha e
 * faturamento já chegam pelo webhook, sem botão.
 *
 * Quem encadeia os hops é esta rota (soTags: a função devolve o cursor em vez
 * de se disparar), para a resposta só voltar quando a leitura terminou.
 *
 * Trava de 10 min em try_claim_followup_tags_refresh (ver a migration: não é
 * só carga no GHL, é a âncora de data das campanhas).
 */
const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
// ~4.900 linhas de tag em 23/10/2026 = 2 hops de 40 s. Folga para a base crescer
// sem passar do maxDuration.
const MAX_HOPS = 6;

interface HopResposta {
  rows?: number;
  continua?: boolean;
  next?: Record<string, unknown>;
  error?: string;
}

export async function POST() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseSecretKey(),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const headers = { "Cache-Control": "no-store" };

  const { data: claimed, error: claimError } = await supabase.rpc(
    "try_claim_followup_tags_refresh",
  );
  if (claimError) {
    console.error("[GHL Follow-up] Falha na trava do Atualizar", claimError);
    return NextResponse.json(
      { ok: false, error: "Não foi possível iniciar a leitura do GHL." },
      { status: 502, headers },
    );
  }
  if (!claimed) {
    return NextResponse.json({ ok: true, recente: true }, { headers });
  }

  const falhar = async (error: string) => {
    const { error: releaseError } = await supabase.rpc("release_followup_tags_refresh");
    if (releaseError) console.error("[GHL Follow-up] Falha ao soltar a trava", releaseError);
    return NextResponse.json({ ok: false, error }, { status: 502, headers });
  };

  let state: Record<string, unknown> = { phase: "tags", soTags: true, hop: 0 };
  let linhas = 0;
  for (let i = 0; i < MAX_HOPS; i++) {
    let body: HopResposta | null;
    try {
      const res = await fetch(`${FUNCTIONS_URL}/sync-ghl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      body = (await res.json().catch(() => null)) as HopResposta | null;
      if (!res.ok || !body || body.error) {
        return falhar(body?.error ?? `sync-ghl respondeu ${res.status}`);
      }
    } catch (err) {
      return falhar(err instanceof Error ? err.message : String(err));
    }

    linhas += body.rows ?? 0;
    if (!body.continua || !body.next) {
      return NextResponse.json({ ok: true, linhas }, { headers });
    }
    state = body.next;
  }
  return falhar("a leitura das tags não terminou a tempo");
}

export const maxDuration = 300;
export const runtime = "nodejs";
