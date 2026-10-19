import test from "node:test";
import assert from "node:assert/strict";
import { semTravessao } from "../lib/ghl/ai-seller/writing.ts";

test("travessão no meio da frase vira vírgula (mensagens reais da Cami)", () => {
  assert.equal(
    semTravessao("Entendo, Cristiano — e agradeço por nos contar com sinceridade! 😊"),
    "Entendo, Cristiano, e agradeço por nos contar com sinceridade! 😊",
  );
  assert.equal(
    semTravessao("Bom dia, Diogo! Entendi — obrigada por me falar. O que você esperava diferente na arte?"),
    "Bom dia, Diogo! Entendi, obrigada por me falar. O que você esperava diferente na arte?",
  );
  assert.equal(semTravessao("A grade — que é livre — fica com você."), "A grade, que é livre, fica com você.");
  assert.equal(semTravessao("Certo, Carlos—vou ajustar"), "Certo, Carlos, vou ajustar");
});

test("travessão junto de outra pontuação não deixa vírgula sobrando", () => {
  assert.equal(semTravessao("Pode deixar! — vou pedir o ajuste"), "Pode deixar! vou pedir o ajuste");
  assert.equal(semTravessao("Combinado —"), "Combinado");
  assert.equal(semTravessao("Tudo certo — ?"), "Tudo certo?");
  assert.equal(semTravessao("Anotado, — vou incluir"), "Anotado, vou incluir");
});

test("faixa de números e marcador de linha", () => {
  assert.equal(semTravessao("De 12–23 pares fica R$ 59,90 por par."), "De 12 a 23 pares fica R$ 59,90 por par.");
  assert.equal(semTravessao("Opções:\n— PIX\n– cartão"), "Opções:\n- PIX\n- cartão");
});

test("texto sem travessão não muda (hífen, valores e quebras ficam)", () => {
  const texto = "Segunda-feira te mando o e-mail.\n\nTotal: R$ 1.198,00, com 5% no PIX.";
  assert.equal(semTravessao(texto), texto);
});
