import test from "node:test";
import assert from "node:assert/strict";
import {
  closingDateToFunnelDay,
  instantToFunnelDay,
  mergeSalesIntoFunnelEvents,
} from "../lib/ghl/funnel-sales.ts";

const webhook = (contact_id, stage_slug, received_at) => ({
  contact_id,
  stage_slug,
  received_at,
});

test("closing_date a meia-noite UTC nao volta um dia no calendario", () => {
  assert.equal(closingDateToFunnelDay("2026-08-21T00:00:00+00:00"), "2026-08-21");
  assert.equal(closingDateToFunnelDay("2026-08-21 00:00:00+00"), "2026-08-21");
  for (const value of [null, undefined, "", "nao-e-data", 42]) {
    assert.equal(closingDateToFunnelDay(value), null);
  }
});

test("instante real vale pelo dia de Sao Paulo", () => {
  assert.equal(instantToFunnelDay("2026-08-21T13:05:14.543Z"), "2026-08-21");
  // 02h UTC ainda e o dia anterior no Brasil
  assert.equal(instantToFunnelDay("2026-08-22T02:00:00.000Z"), "2026-08-21");
  assert.equal(instantToFunnelDay("2026-02-30"), null);
});

test("venda migrada do CRM antigo nao vira fechamento do funil", () => {
  const events = mergeSalesIntoFunnelEvents(
    [webhook("c1", "lead", "2026-07-20T10:00:00.000Z")],
    [
      // ciclo comercial anterior, trazido na importacao do AC
      { contact_id: "c1", closing_date: "2025-11-04T00:00:00+00:00", provider_payload: null },
    ],
  );

  assert.deepEqual(events.map((event) => event.source), ["webhook"]);
});

test("com venda antiga e venda nova, vale a que aconteceu dentro do funil", () => {
  const events = mergeSalesIntoFunnelEvents(
    [webhook("c1", "lead", "2026-07-20T10:00:00.000Z")],
    [
      { contact_id: "c1", closing_date: "2025-11-04T00:00:00+00:00", provider_payload: null },
      { contact_id: "c1", closing_date: "2026-08-05T00:00:00+00:00", provider_payload: null },
    ],
  );

  const vendas = events.filter((event) => event.source === "sale");
  assert.equal(vendas.length, 1);
  assert.equal(vendas[0].received_at, "2026-08-05T15:00:00.000Z");
});

test("venda no mesmo dia da entrada conta, mesmo entrando de tarde", () => {
  // entrada as 15h de Sao Paulo; a venda ancora ao meio-dia, antes disso.
  // A comparacao e por dia de calendario justamente para nao perder o caso.
  const events = mergeSalesIntoFunnelEvents(
    [webhook("c1", "lead", "2026-08-19T18:00:00.000Z")],
    [{ contact_id: "c1", closing_date: "2026-08-19T00:00:00+00:00", provider_payload: null }],
  );

  assert.equal(events.filter((event) => event.source === "sale").length, 1);
});

test("a tag negociofechado do GHL nao vira etapa do funil", () => {
  const events = mergeSalesIntoFunnelEvents(
    [
      webhook("c1", "lead", "2026-07-20T10:00:00.000Z"),
      webhook("c1", "negociofechado", "2026-08-03T12:00:00.000Z"),
    ],
    [],
  );

  assert.deepEqual(
    events.map((event) => event.stage_slug),
    ["lead"],
  );
});

test("a venda do cache entra ancorada no dia real do fechamento", () => {
  const events = mergeSalesIntoFunnelEvents(
    [webhook("c1", "lead", "2026-07-20T10:00:00.000Z")],
    [
      {
        contact_id: "c1",
        closing_date: "2026-08-19T00:00:00+00:00",
        provider_payload: { ghl_last_status_change_at: "2026-08-19T19:31:20.765Z" },
      },
    ],
  );

  const venda = events.at(-1);
  assert.equal(venda.stage_slug, "negociofechado");
  assert.equal(venda.source, "sale");
  // meio-dia de Sao Paulo do dia 19, para nao trocar de dia em conversao
  assert.equal(venda.received_at, "2026-08-19T15:00:00.000Z");
});

test("cai no status_change quando o closing_date esta faltando", () => {
  const [, venda] = mergeSalesIntoFunnelEvents(
    [webhook("c1", "lead", "2026-07-20T10:00:00.000Z")],
    [
      {
        contact_id: "c1",
        closing_date: null,
        provider_payload: { ghl_last_status_change_at: "2026-08-19T19:31:20.765Z" },
      },
    ],
  );

  assert.equal(venda.received_at, "2026-08-19T15:00:00.000Z");
});

test("cada contato fecha uma vez, na venda mais antiga", () => {
  const events = mergeSalesIntoFunnelEvents(
    [webhook("c1", "lead", "2026-07-20T10:00:00.000Z")],
    [
      { contact_id: "c1", closing_date: "2026-08-19T00:00:00+00:00", provider_payload: null },
      { contact_id: "c1", closing_date: "2026-07-30T00:00:00+00:00", provider_payload: null },
    ],
  );

  const vendas = events.filter((event) => event.source === "sale");
  assert.equal(vendas.length, 1);
  assert.equal(vendas[0].received_at, "2026-07-30T15:00:00.000Z");
});

test("venda de contato que nunca passou pelo funil fica de fora", () => {
  const events = mergeSalesIntoFunnelEvents(
    [webhook("c1", "lead", "2026-07-20T10:00:00.000Z")],
    [{ contact_id: "c2", closing_date: "2026-08-19T00:00:00+00:00", provider_payload: null }],
  );

  assert.deepEqual(events.map((event) => event.contact_id), ["c1"]);
});

test("linha malformada e ignorada sem derrubar o funil", () => {
  const events = mergeSalesIntoFunnelEvents(
    [
      webhook("c1", "lead", "2026-07-20T10:00:00.000Z"),
      webhook("c1", "solicitouorcamento", "sem data nenhuma"),
    ],
    [
      { contact_id: "c1", closing_date: "2026-02-30", provider_payload: null },
      { contact_id: null, closing_date: "2026-08-19T00:00:00+00:00", provider_payload: null },
    ],
  );

  assert.deepEqual(events.map((event) => event.stage_slug), ["lead"]);
});

test("eventos saem ordenados no tempo e marcados pela origem", () => {
  const events = mergeSalesIntoFunnelEvents(
    [
      webhook("c1", "solicitouorcamento", "2026-07-25T10:00:00.000Z"),
      webhook("c1", "lead", "2026-07-20T10:00:00.000Z"),
    ],
    [{ contact_id: "c1", closing_date: "2026-08-19T00:00:00+00:00", provider_payload: null }],
  );

  assert.deepEqual(
    events.map((event) => [event.stage_slug, event.source]),
    [
      ["lead", "webhook"],
      ["solicitouorcamento", "webhook"],
      ["negociofechado", "sale"],
    ],
  );
});
