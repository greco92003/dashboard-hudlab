import assert from "node:assert/strict";
import test from "node:test";
import { BRAZIL_STATES, BRAZIL_VIEWBOX } from "../components/charts/brazil-map-geometry.ts";

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

test("27 estados, cada um com caminho e rótulo dentro do mapa", () => {
  assert.deepEqual(BRAZIL_STATES.map((s) => s.uf), UFS);
  for (const s of BRAZIL_STATES) {
    assert.match(s.d, /^M[\d.\- ]/, s.uf);
    assert.ok(s.name.length > 2, s.uf);
    assert.ok(s.label.x > 0 && s.label.x < BRAZIL_VIEWBOX.width, s.uf);
    assert.ok(s.label.y > 0 && s.label.y < BRAZIL_VIEWBOX.height, s.uf);
  }
  assert.equal(BRAZIL_STATES.find((s) => s.uf === "SP").name, "São Paulo");
});
