import test from "node:test";
import assert from "node:assert/strict";

process.env.GHL_PRIVATE_INTEGRATION_TOKEN ||= "token-de-teste";
process.env.GHL_LOCATION_ID ||= "location-de-teste";
const { criarLimitador, esperaParaRepetir } = await import("../lib/ghl/rate-limit.ts");
const { fetchCustomFieldDefs } = await import("../lib/ghl/api.ts");
const { findPhoneConversationId } = await import("../lib/ghl/negotiation-conversations.ts");

const fetchOriginal = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

function relogioFalso() {
  let agora = 0;
  const esperas = [];
  return {
    relogio: () => agora,
    dormir: async (ms) => {
      esperas.push(ms);
      agora += ms;
    },
    avancar: (ms) => {
      agora += ms;
    },
    esperas,
  };
}

test("limitador deixa passar até o máximo da janela sem esperar", async () => {
  const r = relogioFalso();
  const aguardar = criarLimitador(3, 1_000, r.relogio, r.dormir);
  await aguardar();
  await aguardar();
  await aguardar();
  assert.deepEqual(r.esperas, []);
});

test("limitador segura a chamada além do máximo até a mais antiga sair da janela", async () => {
  const r = relogioFalso();
  const aguardar = criarLimitador(3, 1_000, r.relogio, r.dormir);
  await aguardar(); // t=0
  r.avancar(200);
  await aguardar(); // t=200
  await aguardar(); // t=200
  await aguardar(); // espera a de t=0 sair: 800 ms
  assert.deepEqual(r.esperas, [800]);
  assert.equal(r.relogio(), 1_000);
});

test("chamadas simultâneas além do máximo ficam na fila", async () => {
  let agora = 0;
  const esperas = [];
  // O sono devolve o controle antes de o relógio andar, como um timer de verdade.
  const dormir = async (ms) => {
    const inicio = agora;
    esperas.push(ms);
    await Promise.resolve();
    agora = Math.max(agora, inicio + ms);
  };
  const aguardar = criarLimitador(2, 1_000, () => agora, dormir);
  await Promise.all([aguardar(), aguardar(), aguardar(), aguardar()]);
  // As duas primeiras saem na hora; as outras duas esperam a janela abrir.
  assert.deepEqual(esperas, [1_000, 1_000]);
  assert.equal(agora, 1_000);
});

test("espera para repetir: Retry-After em segundos quando vem, senão 1, 2, 4, 8 s", () => {
  const sem = new Response(null, { status: 429 });
  assert.equal(esperaParaRepetir(sem, 0), 1_000);
  assert.equal(esperaParaRepetir(sem, 1), 2_000);
  assert.equal(esperaParaRepetir(sem, 3), 8_000);
  assert.equal(esperaParaRepetir(null, 2), 4_000);
  const com = new Response(null, { status: 429, headers: { "retry-after": "3" } });
  assert.equal(esperaParaRepetir(com, 0), 3_000);
  const zero = new Response(null, { status: 429, headers: { "retry-after": "0" } });
  assert.equal(esperaParaRepetir(zero, 2), 1_000);
  const data = new Response(null, { status: 429, headers: { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" } });
  assert.equal(esperaParaRepetir(data, 1), 2_000);
});

test("definições de campos: uma leitura serve as chamadas seguintes e as simultâneas", async () => {
  let chamadas = 0;
  globalThis.fetch = async () => {
    chamadas++;
    return Response.json({ customFields: [{ id: "c1", name: "Vendedor", fieldKey: "opportunity.vendedor" }] });
  };
  const [a, b] = await Promise.all([fetchCustomFieldDefs("opportunity"), fetchCustomFieldDefs("opportunity")]);
  const c = await fetchCustomFieldDefs("opportunity");
  assert.equal(chamadas, 1);
  assert.equal(a[0].id, "c1");
  assert.equal(b[0].id, "c1");
  assert.equal(c[0].id, "c1");
  // Cada chamada recebe a própria lista: mexer numa não muda o que está guardado.
  c.pop();
  assert.equal((await fetchCustomFieldDefs("opportunity")).length, 1);
});

test("definições de campos: leitura que falhou não fica guardada", async () => {
  let chamadas = 0;
  globalThis.fetch = async () => {
    chamadas++;
    return new Response("erro", { status: 400 });
  };
  await assert.rejects(fetchCustomFieldDefs("contact"));
  globalThis.fetch = async () => {
    chamadas++;
    return Response.json({ customFields: [{ id: "k1", name: "Cidade", fieldKey: "contact.cidade" }] });
  };
  const defs = await fetchCustomFieldDefs("contact");
  assert.equal(defs[0].id, "k1");
  assert.equal(chamadas, 2);
});

test("conversas: 429 seguidos são repetidos em vez de virar erro na tela", async () => {
  let chamadas = 0;
  globalThis.fetch = async () => {
    chamadas++;
    if (chamadas <= 3) {
      return new Response('{"statusCode":429,"message":"Too Many Requests"}', {
        status: 429,
        headers: { "retry-after": "0" },
      });
    }
    return Response.json({ conversations: [{ id: "conv1", type: "TYPE_PHONE", contactId: "ct1" }], total: 1 });
  };
  const id = await findPhoneConversationId("ct1");
  assert.equal(id, "conv1");
  assert.equal(chamadas, 4);
});
