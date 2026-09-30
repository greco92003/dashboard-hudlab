import test from "node:test";
import assert from "node:assert/strict";
import {
  cutTranscript,
  isPostSale,
  isWindowOpen,
  sortTriage,
  FALLBACK_RECENT_MESSAGES,
  MAX_CUT_MESSAGES,
} from "../lib/ghl/unread-inbox/triage.ts";

const msg = (id, direction, body = "", attachments = []) => ({
  id,
  direction,
  body,
  dateAdded: "2026-09-30T12:00:00.000Z",
  userId: null,
  attachments,
  isAutomated: direction === "outbound",
});

test("corta na última entrega de amostra digital", () => {
  const messages = [
    msg("c1", "inbound", "quero chinelos"),
    msg("r1", "outbound", "Agora, para o designer criar sua Amostra Digital, bora?"),
    msg("r2", "outbound", "Oi Willian! Suas amostras digitais ficaram prontas!"),
    msg("c2", "inbound", "gostei da opção 1"),
  ];
  const cut = cutTranscript(messages);
  assert.equal(cut.from, "amostra_digital");
  assert.deepEqual(cut.messages.map((m) => m.id), ["r2", "c2"]);
});

test("entrega com anexo conta mesmo sem 'pronta' no texto", () => {
  const messages = [
    msg("c1", "inbound", "oi"),
    msg("r1", "outbound", "Segue sua Amostra Digital", ["https://x/mock.png"]),
    msg("c2", "inbound", "top"),
  ];
  assert.deepEqual(cutTranscript(messages).messages.map((m) => m.id), ["r1", "c2"]);
});

test("sem amostra entregue fica com as últimas mensagens", () => {
  const messages = Array.from({ length: 30 }, (_, i) => msg(`m${i}`, "inbound", "oi"));
  const cut = cutTranscript(messages);
  assert.equal(cut.from, "recentes");
  assert.equal(cut.messages.length, FALLBACK_RECENT_MESSAGES);
  assert.equal(cut.messages.at(-1).id, "m29");
});

test("conversa longa depois da amostra respeita o teto", () => {
  const messages = [
    msg("r0", "outbound", "Suas amostras digitais ficaram prontas!"),
    ...Array.from({ length: 60 }, (_, i) => msg(`m${i}`, "inbound", "oi")),
  ];
  const cut = cutTranscript(messages);
  assert.equal(cut.messages.length, MAX_CUT_MESSAGES);
  assert.equal(cut.messages.at(-1).id, "m59");
});

test("janela do WhatsApp fecha em 24h", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  assert.equal(isWindowOpen(now - 23 * 3600e3, now), true);
  assert.equal(isWindowOpen(now - 25 * 3600e3, now), false);
});

const STAGES = [
  "Cadastro Inicial",
  "Amostra Digital Enviada",
  "Atendimento",
  "Negociação",
  "Prioridade de Fechamento",
  "Finalizando Venda",
  "Pagamento Confirmado/Completar Dados",
  "Impressão de Fotolitos",
  "Recebido Pedido",
];

test("pós-venda: pagamento confirmado em diante, venda ganha ou representante", () => {
  const base = { won: false, pipelineName: "Atendimento", atendimentoStages: STAGES };
  assert.equal(isPostSale({ ...base, stageName: "Negociação" }), false);
  assert.equal(isPostSale({ ...base, stageName: "Finalizando Venda" }), false);
  assert.equal(isPostSale({ ...base, stageName: "Pagamento Confirmado/Completar Dados" }), true);
  assert.equal(isPostSale({ ...base, stageName: "Impressão de Fotolitos" }), true);
  assert.equal(isPostSale({ ...base, stageName: null, won: true }), true);
  assert.equal(isPostSale({ ...base, pipelineName: "Representantes", stageName: "Produção" }), true);
  assert.equal(isPostSale({ ...base, pipelineName: "Fábrica de Mockups", stageName: "Criar Mockup" }), false);
  assert.equal(isPostSale({ ...base, stageName: "Etapa renomeada" }), false);
});

test("fila: quente, morno, frio, pós; dentro da categoria quem espera há mais tempo", () => {
  const items = [
    { id: "pos", category: "pos_venda", lastInboundAt: "2026-09-30T08:00:00Z" },
    { id: "frio", category: "frio", lastInboundAt: "2026-09-30T09:00:00Z" },
    { id: "quente-novo", category: "quente", lastInboundAt: "2026-09-30T11:00:00Z" },
    { id: "quente-antigo", category: "quente", lastInboundAt: "2026-09-30T07:00:00Z" },
    { id: "sem", category: null, lastInboundAt: "2026-09-30T06:00:00Z" },
    { id: "morno", category: "morno", lastInboundAt: "2026-09-30T10:00:00Z" },
  ];
  assert.deepEqual(
    sortTriage(items).map((i) => i.id),
    ["quente-antigo", "quente-novo", "morno", "frio", "pos", "sem"],
  );
});
