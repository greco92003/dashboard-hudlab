import test from "node:test";
import assert from "node:assert/strict";
import {
  decidirAviso,
  decidirAvisoQuente,
  primeiroNome,
  textoDoAviso,
  textoDoAvisoQuente,
} from "../lib/ghl/unread-inbox/hot-alert-rules.ts";

const row = (over = {}) => ({
  conversation_id: "conv-1",
  contact_id: "contato-1",
  contact_name: "Maria Teste",
  reason: "Pediu o link de pagamento.",
  last_message_id: "msg-2",
  last_message_body: "Pode mandar o link?",
  contact_tags: ["lead"],
  hot_notified_message_id: null,
  ...over,
});

test("avisa uma vez por mensagem nova", () => {
  const nenhuma = new Set();
  assert.equal(decidirAvisoQuente(row(), nenhuma), "avisar");
  assert.equal(decidirAvisoQuente(row({ hot_notified_message_id: "msg-2" }), nenhuma), "ja_avisado");
  assert.equal(decidirAvisoQuente(row({ hot_notified_message_id: "msg-1" }), nenhuma), "avisar");
  assert.equal(decidirAvisoQuente(row({ last_message_id: null }), nenhuma), "ja_avisado");
});

test("não avisa quem a Cami atende, acabou de passar ou clicou em campanha", () => {
  assert.equal(decidirAvisoQuente(row({ contact_tags: ["ia-atendimento"] }), new Set()), "com_cami");
  assert.equal(decidirAvisoQuente(row(), new Set(["contato-1"])), "passagem_recente");
  assert.equal(decidirAvisoQuente(row({ last_message_body: "Quero aproveitar" }), new Set()), "clique_de_campanha");
  assert.equal(decidirAvisoQuente(row({ contact_tags: null }), new Set()), "avisar");
});

test("primeiro nome sem acento e minúsculo", () => {
  assert.equal(primeiroNome("Schay Hud"), "schay");
  assert.equal(primeiroNome(" schay "), "schay");
  assert.equal(primeiroNome("Júlia Souza"), "julia");
  assert.equal(primeiroNome(null), "");
});

test("texto do aviso: um lead", () => {
  const t = textoDoAvisoQuente([row({ reason: "Quer fechar hoje — pediu o link." })]);
  assert.equal(t.title, "🔥 Lead quente esperando: Maria Teste");
  assert.ok(t.message.includes('Última mensagem: "Pode mandar o link?"'));
  assert.ok(!t.message.includes("—"));
  assert.ok(t.aviso.texto.startsWith("🔔 *Lead quente esperando resposta*"));
  assert.ok(t.aviso.texto.includes("*Maria Teste*"));
  assert.ok(!t.aviso.linha.includes("\n"));
});

test("texto do aviso: vários leads juntos", () => {
  const t = textoDoAvisoQuente([row(), row({ contact_id: "contato-2", contact_name: null, last_message_body: null })]);
  assert.equal(t.title, "🔥 2 leads quentes esperando resposta");
  assert.equal(t.message, "Maria Teste, Cliente sem nome");
  assert.ok(t.aviso.texto.startsWith("🔔 *2 leads quentes esperando resposta*"));
  assert.ok(!t.aviso.linha.includes("\n"));
});

test("pós-venda só avisa a Amanda das conversas dela", () => {
  const nenhuma = new Set();
  assert.equal(decidirAviso(row({ assigned_to: "amanda" }), { passagensRecentes: nenhuma, dono: "amanda" }), "avisar");
  assert.equal(decidirAviso(row({ assigned_to: "schay" }), { passagensRecentes: nenhuma, dono: "amanda" }), "outro_dono");
  assert.equal(decidirAviso(row({ assigned_to: null }), { passagensRecentes: nenhuma, dono: "amanda" }), "outro_dono");
  // Lead quente: qualquer dono.
  assert.equal(decidirAviso(row({ assigned_to: "schay" }), { passagensRecentes: nenhuma }), "avisar");
  // Clique de campanha de cliente entregue vai para o aviso de clique, não para a Amanda.
  assert.equal(
    decidirAviso(row({ assigned_to: "amanda", last_message_body: "Quero aproveitar" }), { passagensRecentes: nenhuma, dono: "amanda" }),
    "clique_de_campanha",
  );
});

test("texto do aviso do pós-venda", () => {
  const um = textoDoAviso([row({ reason: "Pedido no pós-venda: card em Cadastro ERP." })], "pos_venda");
  assert.equal(um.title, "📦 Cliente do pós-venda esperando: Maria Teste");
  assert.ok(um.aviso.texto.startsWith("🔔 *Cliente do pós-venda esperando resposta*"));
  const dois = textoDoAviso([row(), row({ contact_id: "contato-2" })], "pos_venda");
  assert.equal(dois.title, "📦 2 clientes do pós-venda esperando resposta");
});
