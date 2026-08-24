import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

/**
 * O repo importa módulos .ts sem extensão (exigência do tsc com
 * moduleResolution "bundler"), mas o resolver ESM do Node exige a extensão
 * explícita. Este hook faz a ponte para rodar os testes com
 * `node --experimental-strip-types --test`.
 *
 * Uso: node --experimental-strip-types --import ./tests/ts-extension-resolve.mjs --test <arquivo>
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
