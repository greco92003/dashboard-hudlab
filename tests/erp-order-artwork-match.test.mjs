import test from "node:test";
import assert from "node:assert/strict";
import { matchGhlModel } from "../lib/erp/order-artwork-match.ts";

const model = (modelNumber, grades, audience = "adulto") => ({
  modelNumber,
  audience,
  soleColor: null,
  artUrl: `arte-${modelNumber}`,
  grades: grades.map(([size, quantity]) => ({ size, quantity, audience })),
  totalPairs: grades.reduce((sum, [, quantity]) => sum + quantity, 0),
});

// Pedido 1983 (DOG DOOR): produtos criados à mão com numeração diferente da ficha.
const dogDoor = [
  model(1, [["36/37", 1]]),
  model(2, [["40/41", 1]]),
  model(3, [["38/39", 1]]),
];

test("a grade decide o modelo mesmo quando o código do nome aponta outro", () => {
  const branco = { reference: "Chinelo Slide 082603 - DOG DOOR - Branco", sizes: [{ size: "36/37", quantity: 1 }] };
  const preto = { reference: "Chinelo Slide 082601 - DOG DOOR - Preto", sizes: [{ size: "38/39", quantity: 1 }] };
  assert.equal(matchGhlModel(branco, dogDoor)?.modelNumber, 1);
  assert.equal(matchGhlModel(preto, dogDoor)?.modelNumber, 3);
});

test("grades iguais desempatam pelo código do nome", () => {
  const models = [model(1, [["38/39", 10]]), model(2, [["38/39", 10]])];
  const product = { reference: "Chinelo Slide 082602 - X - Preto", sizes: [{ size: "38/39", quantity: 10 }] };
  assert.equal(matchGhlModel(product, models)?.modelNumber, 2);
});

test("sem grade nem código, só aceita um modelo único do mesmo público", () => {
  const product = { reference: "Chinelo Slide Infantil Antigo", sizes: [{ size: "30/31", quantity: 4 }] };
  assert.equal(matchGhlModel(product, [model(1, [["30/31", 2]], "infantil"), model(2, [["40/41", 2]])])?.modelNumber, 1);
  assert.equal(matchGhlModel(product, [model(1, [["30/31", 2]], "infantil"), model(2, [["28/29", 2]], "infantil")]), null);
});
