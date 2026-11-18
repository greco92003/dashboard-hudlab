import "server-only";

import { fetchCustomFieldDefs, fetchGhlContactById, fetchOpportunityById, extractOpportunityFieldValue } from "@/lib/ghl/api";
import { packPairsIntoVolumes } from "@/lib/freight/packing";
import { quoteFreight } from "@/lib/freight/quote";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import type { OpcaoDeFrete } from "@/lib/ghl/ficha-pedido/frete";

export interface CotacaoDoPedido {
  /** CEP ou "cidade/UF" usado na cotação; null quando o cadastro ainda não chegou. */
  destino: string | null;
  origemDoDestino: "cep do pedido" | "cep do cadastro" | "cidade do cadastro" | null;
  opcoes: OpcaoDeFrete[];
  avisos: string[];
}

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

function valorDoCampo(entrada: Record<string, unknown> | undefined): unknown {
  if (!entrada) return null;
  if ("value" in entrada && entrada.value != null) return entrada.value;
  for (const [chave, valor] of Object.entries(entrada)) if (chave.startsWith("fieldValue") && valor != null) return valor;
  return null;
}

/**
 * Destino do pedido: o CEP que o cliente preencheu no cadastro completo (vai
 * para a oportunidade e para o contato). Sem CEP, a cidade/UF do contato dá uma
 * cotação aproximada, com aviso.
 */
async function destinoDoPedido(opportunityId: string) {
  const oportunidade = await fetchOpportunityById(opportunityId);
  const defsOp = await fetchCustomFieldDefs("opportunity");
  const cepOp = defsOp.find((d) => d.fieldKey === "opportunity.cep");
  const entradaOp = cepOp ? oportunidade.customFields?.find((c) => c.id === cepOp.id) : undefined;
  const cepDoPedido = soDigitos(entradaOp ? extractOpportunityFieldValue(entradaOp) : null);
  if (cepDoPedido.length === 8) return { destino: cepDoPedido, origem: "cep do pedido" as const };

  if (!oportunidade.contactId) return { destino: null, origem: null };
  const [contato, defsContato] = await Promise.all([
    fetchGhlContactById(oportunidade.contactId),
    fetchCustomFieldDefs("contact"),
  ]);
  const campo = (teste: (chave: string) => boolean) => {
    const def = defsContato.find((d) => teste(d.fieldKey));
    return def ? valorDoCampo(contato.customFields?.find((c) => c.id === def.id) as Record<string, unknown> | undefined) : null;
  };
  const cepDoCadastro = soDigitos(campo((k) => k.startsWith("contact.cep")));
  if (cepDoCadastro.length === 8) return { destino: cepDoCadastro, origem: "cep do cadastro" as const };
  const cidade = String(campo((k) => k === "contact.cidade") ?? "").trim();
  const uf = String(campo((k) => k === "contact.estado") ?? "").trim();
  if (cidade) return { destino: uf ? `${cidade}/${uf.toUpperCase()}` : cidade, origem: "cidade do cadastro" as const };
  return { destino: null, origem: null };
}

/** Cota o frete do pedido com as caixas cadastradas; opções da mais barata para a mais cara. */
export async function cotarFreteDoPedido(opportunityId: string, pares: number, valorNf: number): Promise<CotacaoDoPedido> {
  const { destino, origem } = await destinoDoPedido(opportunityId);
  if (!destino) {
    return { destino: null, origemDoDestino: null, opcoes: [], avisos: ["Sem CEP: o cliente ainda não fez o cadastro completo."] };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is not configured");
  const supabase = createClient(url, getSupabaseSecretKey(), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: volumes, error } = await supabase.from("freight_volumes").select("id, pairs_capacity").eq("active", true);
  if (error) throw new Error(`freight_volumes: ${error.message}`);
  const selecao = packPairsIntoVolumes(pares, (volumes ?? []) as Array<{ id: string; pairs_capacity: number }>);
  if (selecao.length === 0) return { destino, origemDoDestino: origem, opcoes: [], avisos: ["Sem caixas cadastradas para essa quantidade de pares."] };

  const resultado = await quoteFreight(supabase, { destino, volumes: selecao, valor_nf: valorNf });
  if (!resultado.ok) {
    const erro = (resultado.body as { error?: string }).error ?? "falha na cotação";
    return { destino, origemDoDestino: origem, opcoes: [], avisos: [`Não consegui cotar: ${erro}.`] };
  }
  const avisos = [...(resultado.body.warnings ?? [])];
  if (origem === "cidade do cadastro") avisos.unshift("Cotação pela cidade (sem CEP no cadastro): confira o valor.");
  return {
    destino,
    origemDoDestino: origem,
    opcoes: resultado.body.results.map((r) => ({ transportadora: r.carrier.name, total: Math.round(r.quote.total * 100) / 100 })),
    avisos,
  };
}
