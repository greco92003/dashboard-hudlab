import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { createClient } from "@supabase/supabase-js";

/**
 * Cascata das réguas de follow-up automatizado do GHL.
 *
 * Toda a lógica mora na RPC `get_followup_regua` (ver migration homônima):
 * atribuição pelo último degrau recebido, avanço medido contra a foto diária
 * de etapas, e faturamento só no bloco de Negociação -- em Atendimento o
 * fechamento está longe demais para ser métrica.
 */
interface ReguaRow {
  bloco: "atendimento" | "negociacao";
  degrau: number;
  versao: number;
  rotulo: string;
  receberam: number;
  destravaram: number;
  vendas: number | null;
  faturamento: string | number | null;
  valor_em_negociacao: string | number | null;
}

export interface FollowUpDegrau {
  rotulo: string;
  degrau: number;
  versao: number;
  receberam: number;
  destravaram: number;
  taxa: number | null;
  vendas: number | null;
  faturamento: number | null;
  valorEmNegociacao: number | null;
}

export interface FollowUpReguaResponse {
  atendimento: FollowUpDegrau[];
  negociacao: FollowUpDegrau[];
  meta: {
    geradoEm: string;
    /** Nenhuma tag foi observada aparecendo ainda: tudo veio da carga inicial. */
    aguardandoPrimeiraObservacao: boolean;
  };
}

function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDegrau(row: ReguaRow): FollowUpDegrau {
  return {
    rotulo: row.rotulo,
    degrau: row.degrau,
    versao: row.versao,
    receberam: row.receberam,
    destravaram: row.destravaram,
    taxa: row.receberam > 0 ? (row.destravaram / row.receberam) * 100 : null,
    vendas: row.vendas,
    faturamento: toNumber(row.faturamento),
    valorEmNegociacao: toNumber(row.valor_em_negociacao),
  };
}

export async function GET() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = getSupabaseSecretKey();
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase service credentials are missing");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [regua, observadas] = await Promise.all([
      supabase.rpc("get_followup_regua"),
      supabase
        .from("ghl_contact_tags")
        .select("contact_id", { count: "exact", head: true })
        .eq("origem_primeiro_visto", "observado"),
    ]);

    if (regua.error) throw new Error(regua.error.message);

    const rows = (regua.data ?? []) as ReguaRow[];

    const body: FollowUpReguaResponse = {
      atendimento: rows
        .filter((row) => row.bloco === "atendimento")
        .map(toDegrau),
      negociacao: rows.filter((row) => row.bloco === "negociacao").map(toDegrau),
      meta: {
        geradoEm: new Date().toISOString(),
        aguardandoPrimeiraObservacao: (observadas.count ?? 0) === 0,
      },
    };

    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store", "X-Data-Source": "ghl-tags" },
    });
  } catch (error) {
    console.error("[GHL Follow-up] Falha ao montar a régua", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o follow-up",
      },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
