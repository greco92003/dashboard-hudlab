import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

// O marcador do Next não tem comportamento fora do servidor do framework.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export {};", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

process.env.TINY_TOKEN = "token-apenas-para-teste";
const { findTinyContactByDocument, getTinyContactById } = await import("../lib/erp/tiny-contact-v2.ts");

test("armazenamento excedido do Tiny interrompe a consulta sem tratar o cliente como inexistente", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({
    retorno: {
      status: "Erro",
      codigo_erro: "7",
      erros: [{ erro: "O seu espaço de armazenamento foi excedido" }],
    },
  }));

  await assert.rejects(findTinyContactByDocument("529.982.247-25"), /O seu espaço de armazenamento foi excedido/);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.match(String(fetchMock.mock.calls[0].arguments[0]), /\/contatos\.pesquisa\.php$/);
});

test("código 20 é reconhecido como nenhum cadastro encontrado", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    retorno: { status: "Erro", codigo_erro: "20" },
  }));
  assert.equal(await findTinyContactByDocument("529.982.247-25"), null);
});

test("consulta usa somente o documento e mantém um limite de espera", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.signal.aborted, false);
    assert.equal(init.body.get("cpf_cnpj"), "529.982.247-25");
    assert.equal(init.body.has("pesquisa"), false);
    return Response.json({
      retorno: {
        status: "OK",
        contatos: [
          { contato: { id: "10", nome: "Outro cliente", cpf_cnpj: "111.444.777-35" } },
          { contato: { id: "20", nome: "Cliente existente", cpf_cnpj: "52998224725" } },
        ],
      },
    });
  });
  assert.deepEqual(await findTinyContactByDocument("52998224725"), {
    id: 20, name: "Cliente existente", fantasy: "", document: "52998224725",
  });
});

test("obtenção do cadastro também propaga o bloqueio de armazenamento", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({
      retorno: {
        status: "Erro",
        codigo_erro: 7,
        erros: [{ erro: "O seu espaço de armazenamento foi excedido" }],
      },
    });
  });
  await assert.rejects(getTinyContactById(20, "contato-teste"), /armazenamento foi excedido/);
});

test("consulta sem resposta falha sem repetir nem cadastrar um contato", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new DOMException("Tempo de consulta excedido", "TimeoutError");
  });
  await assert.rejects(findTinyContactByDocument("52998224725"), { name: "TimeoutError" });
  assert.equal(fetchMock.mock.callCount(), 1);
});
