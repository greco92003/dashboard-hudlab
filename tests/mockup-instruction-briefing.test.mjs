import assert from "node:assert/strict";
import test from "node:test";
import {
  briefingPreview,
  formatGhlBriefing,
  formatBriefing,
  shouldSkipMockupInstruction,
} from "../lib/ghl/mockup-instructions/briefing.ts";

test("mockup inicial só é bloqueado quando a escolha é Não", () => {
  assert.equal(shouldSkipMockupInstruction("initial", "Não"), true);
  assert.equal(shouldSkipMockupInstruction("initial", "nao"), true);
  assert.equal(shouldSkipMockupInstruction("initial", "Sim"), false);
  assert.equal(shouldSkipMockupInstruction("initial", ""), false);
  assert.equal(shouldSkipMockupInstruction("initial", null), false);
  assert.equal(shouldSkipMockupInstruction("alteration", "Não"), false);
});

test("GHL recebe alteração resumida e referências como links clicáveis", () => {
  const appSummary =
    "Texto do briefing.\n\n![Logo enviado](<https://cdn.example.com/logo.png>)";
  const ghlSummary = formatGhlBriefing(appSummary, "Aplicar o novo logo.");

  assert.equal(
    ghlSummary,
    "ALTERAÇÃO RESUMIDA\nAplicar o novo logo.\n\nTexto do briefing.\n\n[Logo enviado]\nhttps://cdn.example.com/logo.png",
  );
  assert.doesNotMatch(ghlSummary, /!\[/);
  assert.doesNotMatch(ghlSummary, /\[https?:\/\//);
});

test("briefing intercala referências reais e descarta IDs inventados", () => {
  const summary = formatBriefing(
    [
      {
        texto: "O cliente quer a arte azul desta referência.",
        referencias: [
          { id: "ref-1", legenda: "Arte azul" },
          { id: "inventada", legenda: "Não deve aparecer" },
        ],
      },
      {
        texto: "O logo deve ser aplicado no centro.",
        referencias: [{ id: "ref-2", legenda: "Logo do cliente" }],
      },
    ],
    [
      { id: "ref-1", url: "https://cdn.example.com/arte(1).png", isImage: true },
      { id: "ref-2", url: "https://drive.example.com/logo", isImage: false },
    ],
  );

  assert.match(summary, /O cliente quer[\s\S]*!\[Arte azul\]/);
  assert.match(summary, /O logo deve[\s\S]*\[Logo do cliente\]/);
  assert.doesNotMatch(summary, /inventada|Não deve aparecer/);
  assert.equal(briefingPreview(summary).includes("https://"), false);
});
