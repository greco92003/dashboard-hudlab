import test from "node:test";
import assert from "node:assert/strict";
import { buildContextText, buildSellerInstructions } from "../lib/ghl/ai-seller/prompt.ts";

// agent.ts cria o cliente OpenAI ao ser importado e o SDK recusa chave vazia;
// o teste não chama a API, então uma chave fictícia basta.
process.env.OPENAI_API_KEY ||= "sk-teste-nao-usada";
const { buildTranscriptParts } = await import("../lib/ghl/sales-agent/agent.ts");

test("instruções levam persona, escalonamento, regras de preço e o manual", () => {
  const text = buildSellerInstructions({ persona: "Lia", escalationName: "Schay" });
  assert.match(text, /Você é Lia/);
  assert.match(text, /500 pares ou mais/);
  assert.match(text, /pendente de decisão/);
  assert.match(text, /pronto_para_pagar/);
  assert.match(text, /Schay/);
  assert.match(text, /MANUAL COMERCIAL HUD LAB/);
  assert.match(text, /último orçamento registrado/);
  assert.doesNotMatch(text, /não atualiza esse valor/);
});

test("contexto traz a data e marca o valor do CRM como último orçamento registrado", () => {
  const text = buildContextText({
    today: "29/09/2026",
    contactName: "Arthur",
    pipelineName: "Atendimento",
    stageName: "Amostra Digital Enviada",
    crmPares: 40,
    crmValor: 2396,
  });
  assert.match(text, /Data de hoje: 29\/09\/2026/);
  assert.match(text, /último orçamento registrado/);
  assert.match(text, /R\$ 2396\.00/);
  assert.doesNotMatch(text, /omitidas/);
});

test("contexto avisa quando o robô de antes da amostra foi omitido", () => {
  const text = buildContextText({
    today: "14/10/2026",
    contactName: null,
    pipelineName: "Atendimento",
    stageName: "Atendimento",
    crmPares: 30,
    crmValor: 1737,
    omittedAutomated: 7,
  });
  assert.match(text, /As 7 mensagens automáticas do robô anteriores à entrega da Amostra Digital foram omitidas/);
});

test("contexto diz a hora e quando quem recebe a passagem volta", () => {
  const ctx = {
    today: "14/10/2026",
    contactName: null,
    pipelineName: "Atendimento",
    stageName: "Atendimento",
    crmPares: 12,
    crmValor: 718.8,
    nowLabel: "19:10",
  };
  const fora = buildContextText({ ...ctx, escalation: { name: "Schay", available: false, returnsAt: "amanhã às 8h30" } });
  assert.match(fora, /14\/10\/2026, 19:10 \(horário de Brasília\)/);
  assert.match(fora, /Schay: fora do horário de atendimento; volta amanhã às 8h30/);
  const dentro = buildContextText({ ...ctx, escalation: { name: "Schay", available: true, returnsAt: null } });
  assert.match(dentro, /Schay: em horário de atendimento agora/);
});

test("instruções cobrem frete estimado pelo robô e desconto da régua", () => {
  const text = buildSellerInstructions({ persona: "Cami", escalationName: "Schay" });
  assert.match(text, /estimativa pelo estado/);
  assert.match(text, /desconto por tempo limitado/);
  assert.match(text, /diga quando ela volta/);
});

test("mensagens da própria IA aparecem como VOCÊ na transcrição", async () => {
  const base = { body: "", userId: null, attachments: [], isAutomated: false };
  const parts = await buildTranscriptParts(
    [
      { ...base, id: "c1", direction: "inbound", body: "Oi", dateAdded: "2026-09-29T12:00:00.000Z" },
      { ...base, id: "a1", direction: "outbound", body: "Olá!", dateAdded: "2026-09-29T12:02:00.000Z" },
      { ...base, id: "h1", direction: "outbound", body: "Sou a Schay", dateAdded: "2026-09-29T12:05:00.000Z" },
    ],
    { ownMessageIds: new Set(["a1"]), ownLabel: "VOCÊ (Lia)" },
  );
  const texts = parts.map((p) => p.text);
  assert.match(texts[0], /CLIENTE: Oi/);
  assert.match(texts[1], /VOCÊ \(Lia\): Olá!/);
  assert.match(texts[2], /VENDEDOR: Sou a Schay/);
});
