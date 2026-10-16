import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ANNEX_ITEMS,
  activeTexts,
  annexSection,
  annexStats,
  applyEdits,
  cutReferenceSnapshot,
  exampleCut,
  parseAnnexResponse,
  reconcileWithCurrent,
  simulatedArtChangeStatus,
} from "../lib/ghl/ai-seller/annex-shape.ts";
import { ANNEX_INSTRUCTIONS, buildAnnexInput } from "../lib/ghl/ai-seller/annex-prompt.ts";
import { buildSellerInstructions } from "../lib/ghl/ai-seller/prompt.ts";

const item = (texto, estado = "mantido", over = {}) => ({ texto, estado, antes: null, motivo: null, feedbackIds: [], ...over });

test("anexo nas instruções da Cami: depois do jeito de atender, antes do manual", () => {
  assert.equal(annexSection([]), "");
  const text = buildSellerInstructions({ persona: "Cami", escalationName: "Schay", anexo: ["Responda curto a detalhes."] });
  assert.match(text, /ANEXO DE ATENDIMENTO/);
  assert.match(text, /1\. Responda curto a detalhes\./);
  assert.ok(text.indexOf("Jeito de atender") < text.indexOf("ANEXO DE ATENDIMENTO"));
  assert.ok(text.indexOf("ANEXO DE ATENDIMENTO") < text.indexOf("MANUAL COMERCIAL HUD LAB"));
  assert.doesNotMatch(buildSellerInstructions({ persona: "Cami", escalationName: "Schay" }), /ANEXO DE ATENDIMENTO/);
});

test("resposta da IA: estados válidos, textos limpos, ids só dos feedbacks da revisão", () => {
  const parsed = parseAnnexResponse(
    {
      itens: [
        { texto: "  Responda   curto. ", estado: "novo", antes: "", motivo: "pediu", feedbackIds: ["f1", "inventado"] },
        { texto: "oi", estado: "novo", antes: null, motivo: null, feedbackIds: [] },
        { texto: "Estado estranho aqui", estado: "talvez", antes: null, motivo: null, feedbackIds: [] },
      ],
      paraOManual: ["  Frete para o Norte errado ", ""],
      resumo: " Uma mudança ",
    },
    new Set(["f1"]),
  );
  assert.deepEqual(parsed.itens, [item("Responda curto.", "novo", { motivo: "pediu", feedbackIds: ["f1"] })]);
  assert.deepEqual(parsed.paraOManual, ["Frete para o Norte errado"]);
  assert.equal(parsed.resumo, "Uma mudança");
  assert.deepEqual(parseAnnexResponse(null, new Set()).itens, []);
});

test("item aprovado nunca some: o que a IA esqueceu volta como mantido", () => {
  const current = ["A", "B", "C"];
  const out = reconcileWithCurrent(current, [
    item("A2", "ajustado", { antes: "A" }),
    item("Novo X", "novo"),
    // "mantido" com texto que não estava em vigor é novo
    item("Inventado", "mantido"),
    item("C", "removido", { antes: "C", motivo: "coberto" }),
  ]);
  assert.deepEqual(
    out.map((i) => `${i.estado}:${i.texto}`),
    ["ajustado:A2", "novo:Novo X", "novo:Inventado", "removido:C", "mantido:B"],
  );
  assert.deepEqual(activeTexts(out), ["A2", "Novo X", "Inventado", "B"]);
});

test("no máximo 15 ativos: o excedente de novos sai, nunca um em vigor", () => {
  const current = Array.from({ length: 14 }, (_, i) => `Item ${i}`);
  const novos = Array.from({ length: 4 }, (_, i) => item(`Novo ${i}`, "novo"));
  const out = reconcileWithCurrent(current, [...current.map((t) => item(t)), ...novos]);
  assert.equal(activeTexts(out).length, MAX_ANNEX_ITEMS);
  assert.deepEqual(out.filter((i) => i.estado === "novo").map((i) => i.texto), ["Novo 0"]);
});

test("ajustar texto antes de aprovar: mesma lista, removidos intactos, texto validado", () => {
  const itens = [item("Responda curto.", "novo"), item("Velho", "removido", { antes: "Velho" })];
  assert.deepEqual(applyEdits(itens, undefined), { ok: true, itens });
  const ok = applyEdits(itens, ["  Responda bem curto. ", "ignorado"]);
  assert.equal(ok.itens[0].texto, "Responda bem curto.");
  assert.equal(ok.itens[1].texto, "Velho");
  assert.match(applyEdits(itens, ["oi", "x"]).error, /Item 1/);
  assert.match(applyEdits(itens, ["só um"]).error, /não confere/);
  assert.deepEqual(annexStats(ok.itens), { novo: 1, ajustado: 0, mantido: 0, removido: 1, ativos: 1 });
});

const msg = (id, direction, body) => ({
  id,
  direction,
  body,
  dateAdded: "2026-10-14T22:00:00Z",
  userId: null,
  attachments: [],
  isAutomated: false,
});

test("como teria sido: ponto do cliente antes da resposta marcada (ou da última da Cami)", () => {
  const messages = [
    msg("c1", "inbound", "Nenhuma das artes"),
    msg("k1", "outbound", "Sem problema!"),
    msg("c2", "inbound", "Com o fundo transparente"),
    msg("k2", "outbound", "Perfeito, Hiagu! Ajuste solicitado."),
    msg("k3", "outbound", "O design entrega em 24h."),
    msg("c3", "inbound", "A logo tem que estar grande"),
    msg("k4", "outbound", "Perfeito, Hiagu! Logo maior."),
  ];
  const cami = new Set(["k1", "k2", "k3", "k4"]);
  assert.deepEqual(exampleCut(messages, cami, ["k2"]), {
    clientMessageId: "c2",
    cliente: "Com o fundo transparente",
    antes: ["Perfeito, Hiagu! Ajuste solicitado.", "O design entrega em 24h."],
  });
  assert.equal(exampleCut(messages, cami, []).clientMessageId, "c3");
  assert.equal(exampleCut(messages, new Set(), []), null);

  const snap = cutReferenceSnapshot(messages, cami, "c2");
  assert.deepEqual(snap.map((m) => `${m.id}:${m.own}`), ["c1:false", "k1:true", "c2:false"]);
  assert.equal(cutReferenceSnapshot([msg("k1", "outbound", "oi")], cami), null);
});

test("simulação: cliente em Alteração já tem o ajuste aberto", () => {
  assert.equal(simulatedArtChangeStatus("Alteração"), "ja_em_alteracao");
  assert.equal(simulatedArtChangeStatus(" alteração "), "ja_em_alteracao");
  assert.equal(simulatedArtChangeStatus("Negociação"), "movido");
  assert.equal(simulatedArtChangeStatus(null), "movido");
});

test("pedido à IA: base, anexo em vigor e feedbacks com trecho; política comercial fora", () => {
  assert.match(ANNEX_INSTRUCTIONS, /Não se repita/);
  assert.match(ANNEX_INSTRUCTIONS, /paraOManual/);
  const input = buildAnnexInput(["Responda curto."], [
    { id: "f1", autor: "Schay", atalhos: ["redundante"], texto: "Repetiu Perfeito", urgente: false, trecho: "[14/10 22:12] CAMI: Perfeito" },
  ]);
  assert.match(input, /1\. Responda curto\./);
  assert.match(input, /Feedback f1 \(Schay\)/);
  assert.match(input, /Atalhos: Redundante/);
  assert.match(input, /CAMI: Perfeito/);
  assert.match(buildAnnexInput([], []), /vazio/);
});
