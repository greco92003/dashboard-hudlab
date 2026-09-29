import test from "node:test";
import assert from "node:assert/strict";
import { packPairsIntoVolumes } from "../lib/freight/packing.ts";

const CAIXAS = [
  { id: "c1", pairs_capacity: 1 },
  { id: "c3", pairs_capacity: 3 },
  { id: "c6", pairs_capacity: 6 },
  { id: "c12", pairs_capacity: 12 },
  { id: "c18", pairs_capacity: 18 },
];

function asMap(selection) {
  return Object.fromEntries(selection.map((s) => [s.volume_id, s.count]));
}

test("quantidade que cabe numa caixa usa a menor caixa que comporta", () => {
  assert.deepEqual(asMap(packPairsIntoVolumes(12, CAIXAS)), { c12: 1 });
  assert.deepEqual(asMap(packPairsIntoVolumes(13, CAIXAS)), { c18: 1 });
});

test("quantidade maior enche caixas grandes e fecha com a menor que comporta o resto", () => {
  assert.deepEqual(asMap(packPairsIntoVolumes(20, CAIXAS)), { c18: 1, c3: 1 });
  assert.deepEqual(asMap(packPairsIntoVolumes(40, CAIXAS)), { c18: 2, c6: 1 });
});

test("sem pares ou sem caixas não seleciona nada", () => {
  assert.deepEqual(packPairsIntoVolumes(0, CAIXAS), []);
  assert.deepEqual(packPairsIntoVolumes(12, []), []);
});
