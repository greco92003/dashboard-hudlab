import assert from "node:assert/strict";
import test from "node:test";
import { quantileBreaks, stepFor, stepIntensity } from "../components/charts/brazil-map-scale.ts";

test("cinco faixas por quantil", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const breaks = quantileBreaks(values, 5);
  assert.deepEqual(breaks, [3, 5, 7, 9]);
  assert.equal(stepFor(1, breaks), 0);
  assert.equal(stepFor(4, breaks), 1);
  assert.equal(stepFor(10, breaks), 4);
  assert.equal(stepFor(null, breaks), null);
});

test("valores repetidos não criam faixas vazias: o menor fica na faixa 0", () => {
  const breaks = quantileBreaks([5, 5, 5, 5, 10], 5);
  assert.deepEqual(breaks, [10]);
  assert.equal(stepFor(5, breaks), 0);
  assert.equal(stepFor(10, breaks), 4);
});

test("muitos zeros (ROAS de estado sem venda) não empurram o resto para uma cor só", () => {
  const values = [...Array(20).fill(0), 1.6, 4.3, 5.6, 8.5, 11.9, 12.8];
  const breaks = quantileBreaks(values, 5);
  assert.deepEqual(breaks, [1.6, 4.3, 8.5, 11.9]);
  assert.equal(stepFor(0, breaks), 0);
  assert.equal(stepFor(1.6, breaks), 1);
  assert.equal(stepFor(5.6, breaks), 2);
  assert.equal(stepFor(8.5, breaks), 3);
  assert.equal(stepFor(12.8, breaks), 4);
});

test("um valor só fica na faixa 0", () => {
  assert.deepEqual(quantileBreaks([7], 5), []);
  assert.equal(stepFor(7, []), 0);
});

test("escala invertida pinta o menor valor mais forte", () => {
  assert.equal(stepIntensity(0, 5, "sequential"), 0.2);
  assert.equal(stepIntensity(4, 5, "sequential"), 1);
  assert.equal(stepIntensity(0, 5, "sequential-inverted"), 1);
  assert.equal(stepIntensity(4, 5, "sequential-inverted"), 0.2);
});
