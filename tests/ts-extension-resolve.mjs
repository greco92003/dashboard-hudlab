import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/**
 * Ponte entre o jeito que o repo importa e o que o resolver ESM do Node
 * aceita, para rodar os testes com `node --experimental-strip-types --test`:
 *
 *   - módulos .ts sem extensão (exigência do tsc com moduleResolution
 *     "bundler", que o resolver do Node não aceita);
 *   - o alias `@/`, que aponta para a raiz do projeto (tsconfig paths).
 *
 * Uso: node --experimental-strip-types --import ./tests/ts-extension-resolve.mjs --test <arquivo>
 */
const raizDoProjeto = path.resolve(fileURLToPath(import.meta.url), "..", "..");

function resolverArquivo(base) {
  for (const caminho of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`]) {
    if (existsSync(caminho)) return caminho;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const alvo = resolverArquivo(path.join(raizDoProjeto, specifier.slice(2)));
      if (alvo) return { url: pathToFileURL(alvo).href, shortCircuit: true };
    }

    if (specifier.startsWith(".") && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});
