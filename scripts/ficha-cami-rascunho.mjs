// Gera (sem gravar nada) o rascunho da ficha do pedido pela Cami para uma ou mais oportunidades.
// Uso: node --experimental-strip-types --import ./tests/ts-extension-resolve.mjs scripts/ficha-cami-rascunho.mjs <opportunityId>...
import { registerHooks } from "node:module";
// "server-only" é resolvido pelo Next; fora dele vira um módulo vazio.
registerHooks({ resolve: (s, c, next) => (s === "server-only" ? { url: "data:text/javascript,", shortCircuit: true } : next(s, c)) });
process.loadEnvFile(".env.local");
const { gerarRascunhoFicha } = await import("../lib/ghl/ficha-pedido/agente.ts");
for (const id of process.argv.slice(2)) {
  const inicio = Date.now();
  const { rascunho, estatisticas } = await gerarRascunhoFicha(id);
  console.log(`\n=== ${id} (${((Date.now() - inicio) / 1000).toFixed(0)} s, ${estatisticas.mensagens} msgs, ${estatisticas.imagens} imagens, ${estatisticas.pdfs} PDFs, ${estatisticas.modelo})`);
  console.log(JSON.stringify(rascunho, null, 2));
}
