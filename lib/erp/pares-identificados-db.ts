import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { ParIdentificado } from "./pares-identificados";

const TABLE = "erp_pares_identificados";

type ParesDatabase = {
  public: {
    Tables: {
      erp_pares_identificados: {
        Row: {
          deal_id: string;
          numeracao: string;
          nome: string | null;
          filial: string | null;
          setor: string | null;
          ordem: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      erp_pedidos_venda: {
        Row: { deal_id: string; tiny_pedido_id: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
  };
};

/** Tabela ainda não criada no banco: nenhum negócio tem lista. */
function tabelaInexistente(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(error.message ?? "");
}

function client() {
  // Isola a definição da tabela dos tipos legados do restante do schema.
  return createServiceClient() as unknown as SupabaseClient<ParesDatabase>;
}

/**
 * Pares do negócio, um por linha. Lista vazia = negócio comum, sem dono por
 * par. Falha de leitura sobe: tratar como vazia imprimiria etiquetas sem nome.
 */
export async function lerParesIdentificados(dealId: string): Promise<ParIdentificado[]> {
  const pares: ParIdentificado[] = [];
  // O PostgREST devolve no máximo 1.000 linhas por chamada.
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await client()
      .from(TABLE)
      .select("numeracao, nome, filial, setor, ordem")
      .eq("deal_id", dealId)
      .order("ordem", { ascending: true })
      .range(from, from + 999);
    if (error && tabelaInexistente(error)) return [];
    if (error) throw new Error(`Não foi possível ler a lista de pessoas do negócio: ${error.message}`);
    pares.push(...(data ?? []).map((row) => ({
      numeracao: row.numeracao,
      nome: row.nome,
      filial: row.filial,
      setor: row.setor,
    })));
    if ((data?.length ?? 0) < 1_000) return pares;
  }
}

/** Negócio do pedido pelo vínculo gravado na criação (erp_pedidos_venda). */
export async function dealIdDoPedido(orderId: number): Promise<string | null> {
  const { data, error } = await client()
    .from("erp_pedidos_venda")
    .select("deal_id")
    .eq("tiny_pedido_id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível ler o vínculo do pedido: ${error.message}`);
  return data?.deal_id ?? null;
}
