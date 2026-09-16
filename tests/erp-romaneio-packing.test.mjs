import test from "node:test";
import assert from "node:assert/strict";
import { chooseBoxes, packVolumes } from "../lib/erp/romaneio-packing.ts";

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
