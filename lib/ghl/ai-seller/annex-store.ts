import "server-only";

import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { activeTexts, type AnnexItem } from "./annex-shape";

export interface Annex {
  id: string;
  status: "rascunho" | "publicado" | "descartado" | "substituido";
  origem: "semanal" | "urgente" | "manual" | "inicial";
  itens: AnnexItem[];
  paraOManual: string[];
  resumo: string | null;
  feedbackIds: string[];
  createdAt: string;
  publishedAt: string | null;
  decidedAt: string | null;
}

export type Supabase = Awaited<ReturnType<typeof createSupabaseServerForSync>>;

export const toAnnex = (r: Record<string, unknown>): Annex => ({
  id: r.id as string,
  status: r.status as Annex["status"],
  origem: r.origem as Annex["origem"],
  itens: (r.itens as AnnexItem[]) ?? [],
  paraOManual: (r.para_o_manual as string[]) ?? [],
  resumo: (r.resumo as string) ?? null,
  feedbackIds: (r.feedback_ids as string[]) ?? [],
  createdAt: r.created_at as string,
  publishedAt: (r.published_at as string) ?? null,
  decidedAt: (r.decided_at as string) ?? null,
});

/** O anexo em vigor: o último publicado. */
export async function currentAnnex(supabase: Supabase): Promise<Annex | null> {
  const { data, error } = await supabase
    .from("ai_seller_annex")
    .select("*")
    .eq("status", "publicado")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`ai_seller_annex: ${error.message}`);
  return data ? toAnnex(data) : null;
}

/** Itens do anexo em vigor, para as instruções da Cami. Nunca lança: sem banco, ela segue só com a base. */
export async function loadActiveAnnex(): Promise<string[]> {
  try {
    const annex = await currentAnnex(await createSupabaseServerForSync());
    return annex ? activeTexts(annex.itens) : [];
  } catch (err) {
    console.error("IA vendedora: anexo não lido; seguindo só com a base", err);
    return [];
  }
}
