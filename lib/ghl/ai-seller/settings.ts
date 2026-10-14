import "server-only";

import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { DEFAULT_SETTINGS, normalizeSettings, type SellerSettings } from "./settings-shape";

export type { SellerSettings } from "./settings-shape";

/**
 * Configuração atual da Cami. Nunca lança: com o banco fora, a Cami segue com
 * os valores do código (atender é melhor que parar por falha de leitura).
 */
export async function loadSellerSettings(): Promise<SellerSettings> {
  try {
    const supabase = await createSupabaseServerForSync();
    const { data, error } = await supabase
      .from("ai_seller_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return normalizeSettings(data);
  } catch (err) {
    console.error("IA vendedora: configuração não lida; usando a do código", err);
    return DEFAULT_SETTINGS;
  }
}
