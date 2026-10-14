import test from "node:test";
import assert from "node:assert/strict";

process.env.GHL_PRIVATE_INTEGRATION_TOKEN ||= "token-de-teste";
process.env.GHL_LOCATION_ID ||= "location-de-teste";
const { fetchGhlPipelines } = await import("../lib/ghl/api.ts");

const fetchOriginal = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

test("toda leitura do GHL leva limite de espera", async () => {
  let signal;
  globalThis.fetch = async (_url, init) => {
    signal = init.signal;
    return Response.json({ pipelines: [] });
  };
  await fetchGhlPipelines();
  assert.ok(signal instanceof AbortSignal);
});

test("leitura sem resposta é repetida em vez de derrubar o sync", async () => {
  let chamadas = 0;
  globalThis.fetch = async () => {
    chamadas++;
    if (chamadas === 1) {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }
    return Response.json({ pipelines: [{ id: "p1", name: "Atendimento" }] });
  };
  const pipelines = await fetchGhlPipelines();
  assert.equal(chamadas, 2);
  assert.equal(pipelines[0].id, "p1");
});
