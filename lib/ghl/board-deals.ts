import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllSupabaseRows } from "@/lib/supabase-pagination";
import { normalizeTipoPedido } from "@/lib/ghl/programacao-stages";
import type { BoardDeal } from "@/lib/programacao/board-types";

export type { BoardDeal };

const BOARD_COLUMNS = `
  deal_id,
  title,
  value,
  currency,
  stage_title,
  data_embarque,
  tipo_pedido,
  "quantidade-de-pares",
  vendedor,
  designer,
  api_updated_at
`;

function toBoardDeal(row: any): BoardDeal {
  return {
    id: row.deal_id,
    title: row.title,
    value: row.value,
    currency: row.currency,
    stageTitle: row.stage_title,
    quantidadePares: row["quantidade-de-pares"],
    vendedor: row.vendedor,
    designer: row.designer,
    dataEmbarque: row.data_embarque,
    tipoPedido: normalizeTipoPedido(row.tipo_pedido),
    atualizadoEm: row.api_updated_at,
  };
}

/** Formata uma lista de títulos para o operador `in` do PostgREST. */
function toPostgrestList(values: string[]): string {
  return `(${values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",")})`;
}

/**
 * Lê os deals ganhos do GHL. `excludeStageTitles` tem precedência sobre
 * `stageTitles` para permitir a leitura "tudo que NÃO é expedição nem
 * concluído" — assim uma etapa nova ou renomeada no CRM aparece na
 * /programacao em vez de sumir das duas telas.
 */
export async function fetchBoardDeals(
  supabase: SupabaseClient,
  options: {
    stageTitles?: string[];
    excludeStageTitles?: string[];
    /** Data ISO (aaaa-mm-dd): descarta embarques anteriores e sem data. */
    embarqueDesde?: string;
  } = {},
): Promise<BoardDeal[]> {
  const rows = await fetchAllSupabaseRows<any>((from, to) => {
    let query = supabase
      .from("deals_cache")
      .select(BOARD_COLUMNS)
      .eq("source_system", "ghl")
      .eq("status", "won")
      .eq("sync_status", "synced");

    if (options.stageTitles?.length) {
      query = query.in("stage_title", options.stageTitles);
    }
    if (options.excludeStageTitles?.length) {
      query = query.not(
        "stage_title",
        "in",
        toPostgrestList(options.excludeStageTitles),
      );
    }
    if (options.embarqueDesde) {
      query = query.gte("data_embarque_date", options.embarqueDesde);
    }

    return query
      .order("data_embarque_date", { ascending: true, nullsFirst: false })
      .order("deal_id", { ascending: true })
      .range(from, to);
  }, "Board deals read failed");

  return rows.map(toBoardDeal);
}
