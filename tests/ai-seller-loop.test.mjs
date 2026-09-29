import test from "node:test";
import assert from "node:assert/strict";
import { runAgentLoop } from "../lib/ghl/ai-seller/loop.ts";

const call = (name, args = {}) => ({
  call_id: `c-${name}`,
  name,
  arguments: JSON.stringify(args),
});

function scriptedModel(turns) {
  let index = 0;
  const inputs = [];
  const fn = async (input) => {
    inputs.push(structuredClone(input));
    const turn = turns[index++];
    if (turn instanceof Error) throw turn;
    if (!turn) throw new Error("sem turno roteirizado");
    return {
      outputItems: [{ type: "fake_output", step: index }],
      functionCalls: turn,
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  };
  return { fn, inputs };
}

const terminalSend = async () => ({
  output: '{"ok":true}',
  terminal: true,
  sentMessageIds: ["m1"],
  decision: "respondeu",
});
const nonTerminal = async () => ({ output: '{"subtotal":2396}', terminal: false, sentMessageIds: [] });

function executor(byName) {
  const executed = [];
  const fn = async (c) => {
    executed.push(c.name);
    const handler = byName[c.name];
    if (!handler) throw new Error(`sem handler para ${c.name}`);
    return handler(c);
  };
  return { fn, executed };
}

test("responde em um passo", async () => {
  const model = scriptedModel([[call("enviar_mensagens", { mensagens: ["Oi"] })]]);
  const exec = executor({ enviar_mensagens: terminalSend });
  const result = await runAgentLoop({
    initialInput: [{ role: "user", content: "x" }],
    callModel: model.fn,
    executeTool: exec.fn,
    maxSteps: 5,
  });
  assert.equal(result.decision, "respondeu");
  assert.deepEqual(result.sentMessageIds, ["m1"]);
  assert.deepEqual(result.usage, { input_tokens: 10, output_tokens: 5 });
  assert.equal(result.error, null);
});

test("usa uma ferramenta, devolve o resultado ao modelo e responde", async () => {
  const model = scriptedModel([
    [call("atualizar_orcamento", { pares: 40, cep: null })],
    [call("enviar_mensagens", { mensagens: ["Fica R$ 2.396,00"] })],
  ]);
  const exec = executor({ atualizar_orcamento: nonTerminal, enviar_mensagens: terminalSend });
  const result = await runAgentLoop({
    initialInput: [{ role: "user", content: "x" }],
    callModel: model.fn,
    executeTool: exec.fn,
    maxSteps: 5,
  });
  assert.equal(result.decision, "respondeu");
  assert.deepEqual(exec.executed, ["atualizar_orcamento", "enviar_mensagens"]);
  const secondInput = model.inputs[1];
  assert.deepEqual(secondInput.at(-1), {
    type: "function_call_output",
    call_id: "c-atualizar_orcamento",
    output: '{"subtotal":2396}',
  });
  assert.equal(result.toolCalls.length, 2);
});

test("sem ação final dentro do limite de passos vira erro", async () => {
  const model = scriptedModel([
    [call("mover_etapa", { etapa: "Negociação" })],
    [call("mover_etapa", { etapa: "Negociação" })],
  ]);
  const exec = executor({ mover_etapa: nonTerminal });
  const result = await runAgentLoop({
    initialInput: [],
    callModel: model.fn,
    executeTool: exec.fn,
    maxSteps: 2,
  });
  assert.equal(result.decision, "erro");
  assert.match(result.error, /passos/);
});

test("falha do modelo é tentada mais uma vez", async () => {
  const model = scriptedModel([new Error("timeout"), [call("enviar_mensagens")]]);
  const exec = executor({ enviar_mensagens: terminalSend });
  const result = await runAgentLoop({
    initialInput: [],
    callModel: model.fn,
    executeTool: exec.fn,
    maxSteps: 5,
  });
  assert.equal(result.decision, "respondeu");
});

test("duas falhas seguidas do modelo viram erro", async () => {
  const model = scriptedModel([new Error("timeout"), new Error("timeout")]);
  const exec = executor({});
  const result = await runAgentLoop({
    initialInput: [],
    callModel: model.fn,
    executeTool: exec.fn,
    maxSteps: 5,
  });
  assert.equal(result.decision, "erro");
  assert.match(result.error, /modelo/);
});

test("modelo sem chamar ferramenta vira erro", async () => {
  const model = scriptedModel([[]]);
  const result = await runAgentLoop({
    initialInput: [],
    callModel: model.fn,
    executeTool: executor({}).fn,
    maxSteps: 5,
  });
  assert.equal(result.decision, "erro");
});

test("falha no envio não é repetida (evita mensagem duplicada)", async () => {
  const model = scriptedModel([[call("enviar_mensagens")]]);
  let attempts = 0;
  const exec = executor({
    enviar_mensagens: async () => {
      attempts++;
      throw new Error("GHL 500");
    },
  });
  const result = await runAgentLoop({
    initialInput: [],
    callModel: model.fn,
    executeTool: exec.fn,
    maxSteps: 5,
  });
  assert.equal(attempts, 1);
  assert.equal(result.decision, "erro");
  assert.match(result.error, /enviar_mensagens/);
});

test("falha em ferramenta sem efeito duplicável é tentada mais uma vez", async () => {
  const model = scriptedModel([[call("mover_etapa")], [call("enviar_mensagens")]]);
  let attempts = 0;
  const exec = executor({
    mover_etapa: async () => {
      attempts++;
      if (attempts === 1) throw new Error("GHL 502");
      return { output: '{"status":"movido"}', terminal: false, sentMessageIds: [] };
    },
    enviar_mensagens: terminalSend,
  });
  const result = await runAgentLoop({
    initialInput: [],
    callModel: model.fn,
    executeTool: exec.fn,
    maxSteps: 5,
  });
  assert.equal(attempts, 2);
  assert.equal(result.decision, "respondeu");
});
