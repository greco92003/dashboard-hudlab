import test from "node:test";
import assert from "node:assert/strict";
import { chooseBoxes, packVolumes, packVolumesBySku } from "../lib/erp/romaneio-packing.ts";

test("escolhe o menor espaço vazio e depois o menor número de caixas", () => {
  assert.deepEqual(chooseBoxes(3), [3]);
  assert.deepEqual(chooseBoxes(1), [3]);
  assert.deepEqual(chooseBoxes(18), [18]);
  assert.deepEqual(chooseBoxes(20), [18, 3]);
  assert.deepEqual(chooseBoxes(24), [18, 6]);
  assert.deepEqual(chooseBoxes(30), [18, 12]);
  assert.deepEqual(chooseBoxes(100), [18, 18, 18, 18, 18, 12]);
  assert.deepEqual(chooseBoxes(0), []);
  for (let pairs = 1; pairs <= 300; pairs += 1) {
    const boxes = chooseBoxes(pairs);
    const capacity = boxes.reduce((sum, box) => sum + box, 0);
    assert.ok(capacity >= pairs && capacity - pairs <= 2, `sobra inválida para ${pairs}`);
  }
});

test("distribui as linhas nas caixas sem perder pares", () => {
  const lines = [
    { reference: "A", size: "34/35", quantity: 10 },
    { reference: "A", size: "36/37", quantity: 7 },
    { reference: "B", size: "38/39", quantity: 3 },
  ];
  const volumes = packVolumes(lines);
  assert.deepEqual(volumes.map((volume) => [volume.capacity, volume.pairs]), [[18, 18], [3, 2]]);
  assert.deepEqual(volumes[1].lines, [{ reference: "B", size: "38/39", quantity: 2 }]);
  const packed = volumes.flatMap((volume) => volume.lines).reduce((sum, line) => sum + line.quantity, 0);
  assert.equal(packed, 20);
});

test("romaneio por SKU nunca mistura modelos na mesma caixa", () => {
  const lines = [
    { reference: "A", size: "34/35", quantity: 76 },
    { reference: "A", size: "36/37", quantity: 6 },
    { reference: "B", size: "34/35", quantity: 1 },
    { reference: "C", size: "38/39", quantity: 10 },
    { reference: "C", size: "40/41", quantity: 10 },
  ];
  const volumes = packVolumesBySku(lines);
  for (const volume of volumes) {
    assert.equal(new Set(volume.lines.map((line) => line.reference)).size, 1);
  }
  const byModel = (reference) => volumes
    .filter((volume) => volume.lines[0].reference === reference)
    .map((volume) => [volume.capacity, volume.pairs]);
  // 82 pares: quatro caixas de 18 e uma de 12, e a última mistura numerações.
  assert.deepEqual(byModel("A"), [[18, 18], [18, 18], [18, 18], [18, 18], [12, 10]]);
  assert.deepEqual(volumes[4].lines, [{ reference: "A", size: "34/35", quantity: 4 }, { reference: "A", size: "36/37", quantity: 6 }]);
  assert.deepEqual(byModel("B"), [[3, 1]]);
  assert.deepEqual(byModel("C"), [[18, 18], [3, 2]]);
  const packed = volumes.reduce((sum, volume) => sum + volume.pairs, 0);
  assert.equal(packed, 103);
});
