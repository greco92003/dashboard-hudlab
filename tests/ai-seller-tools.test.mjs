import test from "node:test";
import assert from "node:assert/strict";
import { TOOL_DEFINITIONS, executeTool } from "../lib/ghl/ai-seller/tools.ts";

function fakeActions(overrides = {}) {
  const calls = [];
  const actions = {
    async sendMessages(messages) {
      calls.push(["sendMessages", messages]);
      return messages.map((_, i) => `msg-${i}`);
    },
    async escalate(input) {
      calls.push(["escalate", input]);
      return ["esc-1"];
    },
    async quoteFreight(input) {
      calls.push(["quoteFreight", input]);
      return 153;
    },
    async writeBudget(input) {
      calls.push(["writeBudget", input]);
    },
    async requestArtChange(resumo) {
      calls.push(["requestArtChange", resumo]);
      return "movido";
    },
    async moveStage(etapa) {
      calls.push(["moveStage", etapa]);
      return "movido";
    },
    async hasNewClientMessage() {
      calls.push(["hasNewClientMessage"]);
      return false;
    },
    ...overrides,
  };
  return { actions, calls };
}

const call = (name, args) => ({ call_id: "c1", name, arguments: JSON.stringify(args) });

test("as seis ferramentas estão definidas no modo estrito", () => {
  assert.deepEqual(
    TOOL_DEFINITIONS.map((t) => t.name).sort(),
    [
      "atualizar_orcamento",
      "enviar_mensagens",
      "escalar_para_humano",
      "mover_etapa",
      "nao_responder",
      "solicitar_ajuste_arte",
    ],
  );
  for (const tool of TOOL_DEFINITIONS) assert.equal(tool.strict, true);
});

test("enviar_mensagens envia no máximo 3, ignora vazias e encerra a rodada", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(
    call("enviar_mensagens", { mensagens: ["Oi!", "  ", "Tudo bem?", "Três", "Quatro"] }),
    actions,
  );
  assert.deepEqual(calls.at(-1), ["sendMessages", ["Oi!", "Tudo bem?", "Três"]]);
  assert.equal(result.terminal, true);
  assert.equal(result.decision, "respondeu");
  assert.deepEqual(result.sentMessageIds, ["msg-0", "msg-1", "msg-2"]);
});

test("enviar_mensagens sem texto não envia e não encerra", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(call("enviar_mensagens", { mensagens: [" "] }), actions);
  assert.equal(calls.length, 0);
  assert.equal(result.terminal, false);
});

test("atualizar_orcamento com 40 pares: frete grátis, sem cotar", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(call("atualizar_orcamento", { pares: 40, cep: null }), actions);
  assert.equal(calls.some(([name]) => name === "quoteFreight"), false);
  assert.deepEqual(calls[0], [
    "writeBudget",
    { pares: 40, unitario: 59.9, subtotal: 2396, frete: 0 },
  ]);
  const output = JSON.parse(result.output);
  assert.equal(output.total, 2396);
  assert.equal(output.frete_gratis, true);
  assert.equal(result.terminal, false);
});

test("atualizar_orcamento com 12 pares e CEP cota o frete sobre o subtotal", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(
    call("atualizar_orcamento", { pares: 12, cep: "03911-040" }),
    actions,
  );
  assert.deepEqual(calls[0], ["quoteFreight", { cep: "03911-040", pares: 12, valorNf: 814.8 }]);
  assert.deepEqual(calls[1], [
    "writeBudget",
    { pares: 12, unitario: 67.9, subtotal: 814.8, frete: 153 },
  ]);
  assert.equal(JSON.parse(result.output).total, 967.8);
});

test("atualizar_orcamento sem CEP abaixo de 36 pares deixa o frete em aberto", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(call("atualizar_orcamento", { pares: 20, cep: null }), actions);
  assert.deepEqual(calls[0], [
    "writeBudget",
    { pares: 20, unitario: 67.9, subtotal: 1358, frete: null },
  ]);
  assert.equal(JSON.parse(result.output).total, null);
});

test("atualizar_orcamento recusa pedido grande e abaixo do mínimo sem gravar", async () => {
  const grande = fakeActions();
  const r1 = await executeTool(call("atualizar_orcamento", { pares: 600, cep: null }), grande.actions);
  assert.equal(JSON.parse(r1.output).erro, "pedido_grande");
  assert.equal(grande.calls.length, 0);

  const pequeno = fakeActions();
  const r2 = await executeTool(call("atualizar_orcamento", { pares: 8, cep: null }), pequeno.actions);
  assert.equal(JSON.parse(r2.output).erro, "abaixo_do_minimo");
  assert.equal(pequeno.calls.length, 0);
});

test("escalar_para_humano repassa motivo e mensagem e encerra", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(
    call("escalar_para_humano", {
      motivo: "pronto_para_pagar",
      resumo: "Arte aprovada, 40 pares, CEP 03911-040, cartão.",
      mensagem_cliente: "A Schay já te chama pra finalizar!",
    }),
    actions,
  );
  assert.deepEqual(calls[0], [
    "escalate",
    {
      motivo: "pronto_para_pagar",
      resumo: "Arte aprovada, 40 pares, CEP 03911-040, cartão.",
      mensagemCliente: "A Schay já te chama pra finalizar!",
    },
  ]);
  assert.equal(result.terminal, true);
  assert.equal(result.decision, "escalou");
  assert.equal(result.escalationReason, "pronto_para_pagar");
  assert.deepEqual(result.sentMessageIds, ["esc-1"]);
});

test("nao_responder encerra sem enviar", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(call("nao_responder", { motivo: "cliente só agradeceu" }), actions);
  assert.equal(calls.length, 0);
  assert.equal(result.terminal, true);
  assert.equal(result.decision, "nao_respondeu");
});

test("mover_etapa só aceita as etapas liberadas", async () => {
  const ok = fakeActions();
  const r1 = await executeTool(call("mover_etapa", { etapa: "Negociação" }), ok.actions);
  assert.deepEqual(ok.calls[0], ["moveStage", "Negociação"]);
  assert.equal(JSON.parse(r1.output).status, "movido");

  const bloqueada = fakeActions();
  const r2 = await executeTool(call("mover_etapa", { etapa: "Finalizando Venda" }), bloqueada.actions);
  assert.equal(bloqueada.calls.length, 0);
  assert.ok(JSON.parse(r2.output).erro);
});

test("solicitar_ajuste_arte move a demanda e não encerra", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(
    call("solicitar_ajuste_arte", { resumo_ajuste: "Trocar o monograma para branco" }),
    actions,
  );
  assert.deepEqual(calls[0], ["requestArtChange", "Trocar o monograma para branco"]);
  assert.equal(result.terminal, false);
});

test("ferramenta desconhecida ou argumento inválido volta como erro para o modelo", async () => {
  const { actions } = fakeActions();
  const r1 = await executeTool({ call_id: "c1", name: "apagar_tudo", arguments: "{}" }, actions);
  assert.ok(JSON.parse(r1.output).erro);
  const r2 = await executeTool({ call_id: "c1", name: "mover_etapa", arguments: "{quebrado" }, actions);
  assert.ok(JSON.parse(r2.output).erro);
});

test("enviar_mensagens confere mensagem nova do cliente antes de enviar", async () => {
  const { actions, calls } = fakeActions();
  await executeTool(call("enviar_mensagens", { mensagens: ["Oi!"] }), actions);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["hasNewClientMessage", "sendMessages"],
  );
});

test("cliente escreveu de novo durante a rodada: não envia e encerra sem erro", async () => {
  const { actions, calls } = fakeActions({
    async hasNewClientMessage() {
      return true;
    },
  });
  const result = await executeTool(call("enviar_mensagens", { mensagens: ["Oi!"] }), actions);
  assert.equal(calls.some((c) => c[0] === "sendMessages"), false);
  assert.equal(result.terminal, true);
  assert.equal(result.decision, "pulou:mensagem_nova");
  assert.deepEqual(result.sentMessageIds, []);
});
