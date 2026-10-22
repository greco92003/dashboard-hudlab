import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { janelaLeadsMaduros } from "../app/meta-marketing/lib.ts";

// Conversão por criativo só olha leads que já completaram 35 dias (lead time
// do produto). Hoje fixo em 22/10/2026: último dia maduro é 17/09.

function em(isoUtc, fn) {
  mock.timers.enable({ apis: ["Date"], now: new Date(isoUtc) });
  try {
    return fn();
  } finally {
    mock.timers.reset();
  }
}

const HOJE = "2026-10-22T15:00:00Z"; // 12h em São Paulo

test("últimos 30 dias recua para os 30 dias que terminam há 35 dias", () => {
  em(HOJE, () => {
    assert.deepEqual(janelaLeadsMaduros("2026-09-22", "2026-10-22"), {
      inicio: "2026-08-18",
      fim: "2026-09-17",
    });
  });
});

test("período longo é cortado no início da coleta do Meta", () => {
  em(HOJE, () => {
    assert.deepEqual(janelaLeadsMaduros("2026-07-24", "2026-10-22"), {
      inicio: "2026-07-01",
      fim: "2026-09-17",
    });
  });
});

test("período que já terminou há mais de 35 dias vale como está", () => {
  em(HOJE, () => {
    assert.deepEqual(janelaLeadsMaduros("2026-08-01", "2026-08-31"), {
      inicio: "2026-08-01",
      fim: "2026-08-31",
    });
  });
});

test("sem nenhum dia maduro depois do início da coleta, não há janela", () => {
  em("2026-08-01T15:00:00Z", () => {
    assert.equal(janelaLeadsMaduros("2026-07-02", "2026-08-01"), null);
  });
});
