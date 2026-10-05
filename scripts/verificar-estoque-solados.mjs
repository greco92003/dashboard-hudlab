/**
 * Verificação de equivalência do estoque de solados — SOMENTE LEITURA.
 *
 * Prova que servir o estoque do banco dá o mesmo resultado que a leitura ao
 * vivo de antes. Não grava nada: só lê GHL, Tiny e Supabase.
 *
 *   1. GHL: cada negócio da varredura completa (o caminho de antes) é refeito
 *      pelo caminho do webhook (leitura por id + `negocioDoContexto`) e os
 *      dois têm de ser idênticos. No sentido inverso, negócios ganhos nas
 *      etapas-alvo segundo o `deals_cache` e ausentes da varredura têm de ser
 *      recusados pelo webhook também.
 *   2. Resumo: `montarResumo` com as entradas ao vivo, na ordem da varredura,
 *      contra as mesmas entradas depois de ida e volta em JSON (o que o jsonb
 *      guarda) e na ordem de `deal_id` (a ordem em que o banco devolve).
 *
 * Uso:
 *   node --env-file=.env.local --experimental-strip-types \
 *     --import ./tests/ts-extension-resolve.mjs scripts/verificar-estoque-solados.mjs
 */
import { registerHooks } from "node:module";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";

// `server-only` só existe dentro do bundler do Next; fora dele vira módulo vazio.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { fetchCustomFieldDefs, fetchGhlPipelines, fetchOpportunityById } =
  await import("../lib/ghl/api.ts");
const { leiturasAoVivo, negocioDoContexto } = await import(
  "../lib/estoque/solados-source.ts"
);
const { montarResumo, SOLADO_PARAMETROS_PADRAO } = await import(
  "../lib/estoque/solados.ts"
);

const falhas = [];
const falhar = (mensagem, detalhe) => {
  falhas.push(mensagem);
  console.error(`✗ ${mensagem}`);
  if (detalhe !== undefined) console.error(JSON.stringify(detalhe, null, 2));
};

async function emLotes(itens, tamanho, fn) {
  const saida = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
  }
  return saida;
}

// ── 1. GHL: varredura × webhook ─────────────────────────────────────────────

console.log("Lendo a varredura completa do GHL (caminho de antes)…");
const varredura = await leiturasAoVivo.lerNegociosGhl();
console.log(`  ${varredura.length} negócios na janela.`);

console.log("Refazendo cada um pelo caminho do webhook…");
// O webhook recebe { opportunity, definitions, pipelines } de fetchGhlDealContext.
// Aqui definições e pipelines são lidos uma vez só, para não estourar o limite
// do GHL; a função sob teste, negocioDoContexto, é a mesma.
const [definitions, pipelines] = await Promise.all([
  fetchCustomFieldDefs("opportunity"),
  fetchGhlPipelines(),
]);
const contextoPorId = async (id) => ({
  opportunity: await fetchOpportunityById(id),
  definitions,
  pipelines,
});
const contextos = await emLotes(
  varredura.map((negocio) => negocio.dealId),
  5,
  contextoPorId,
);
const porWebhook = new Map(
  contextos.map((contexto) => [contexto.opportunity.id, negocioDoContexto(contexto)]),
);
let iguais = 0;
for (const negocio of varredura) {
  const doWebhook = porWebhook.get(negocio.dealId);
  if (isDeepStrictEqual(negocio, doWebhook)) iguais += 1;
  else falhar(`Negócio ${negocio.dealId} difere`, { varredura: negocio, webhook: doWebhook });
}
console.log(`  ${iguais}/${varredura.length} idênticos.`);

console.log("Sentido inverso: candidatos do deals_cache fora da varredura…");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.DASHBOARD_SECRET,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const etapasDaVarredura = [...new Set(contextos.map((c) => c.opportunity.pipelineStageId))];
const { data: candidatos, error } = await supabase
  .from("deals_cache")
  .select("deal_id")
  .eq("source_system", "ghl")
  .eq("status", "won")
  .in("stage_id", etapasDaVarredura);
if (error) throw new Error(error.message);
const naVarredura = new Set(varredura.map((negocio) => negocio.dealId));
const fora = (candidatos ?? []).map((l) => l.deal_id).filter((id) => !naVarredura.has(id));
const foraContextos = await emLotes(fora, 5, contextoPorId);
for (const contexto of foraContextos) {
  const negocio = negocioDoContexto(contexto);
  if (negocio) falhar(`Webhook incluiria ${contexto.opportunity.id}, a varredura não`, negocio);
}
console.log(
  `  ${(candidatos ?? []).length} ganhos nas etapas-alvo no deals_cache; ` +
    `${fora.length} fora da varredura, checados.`,
);

// ── 2. Resumo: ao vivo × guardado ───────────────────────────────────────────

console.log("Lendo o Tiny e o consumo (caminho de antes)…");
const [tiny, consumoMensalMedio] = await Promise.all([
  leiturasAoVivo.lerTiny(),
  leiturasAoVivo.lerConsumoMensalMedio(),
]);
const parametros = { ...SOLADO_PARAMETROS_PADRAO, consumoMensalMedio };

const aoVivo = montarResumo({
  negocios: varredura,
  skus: tiny.skus,
  aCaminho: tiny.aCaminho,
  parametros,
});

const idaEVolta = (valor) => JSON.parse(JSON.stringify(valor));
const guardados = idaEVolta(varredura).sort((a, b) =>
  a.dealId < b.dealId ? -1 : a.dealId > b.dealId ? 1 : 0,
);
const doBanco = montarResumo({
  negocios: guardados,
  skus: idaEVolta(tiny.skus),
  aCaminho: idaEVolta(tiny.aCaminho),
  parametros,
});

// A lista de negócios do resumo só muda de ordem; o resto tem de ser idêntico.
const semOrdem = (resumo) => ({
  ...resumo,
  negocios: [...resumo.negocios].sort((a, b) => (a.dealId < b.dealId ? -1 : 1)),
});
if (isDeepStrictEqual(semOrdem(aoVivo), semOrdem(doBanco))) {
  console.log("  Resumo idêntico, linha a linha.");
} else {
  for (const [i, linha] of aoVivo.linhas.entries()) {
    if (!isDeepStrictEqual(linha, doBanco.linhas[i])) {
      falhar(`Linha ${linha.cor} ${linha.numeracao} difere`, {
        aoVivo: linha,
        doBanco: doBanco.linhas[i],
      });
    }
  }
  falhar("Resumo difere");
}

console.log(
  `\nTotais: necessidade ${aoVivo.totalNecessidade}, a caminho ${aoVivo.totalACaminho}, ` +
    `sugestão de compra ${aoVivo.totalSugestaoCompra}, mínimo ${aoVivo.totalMinimo}.`,
);
console.log(falhas.length === 0 ? "\n✓ Equivalentes." : `\n✗ ${falhas.length} divergência(s).`);
process.exit(falhas.length === 0 ? 0 : 1);
