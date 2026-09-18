import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { periodoParaDatas, ultimosDias } from "../lib/periodo.ts";

// "Últimos N dias" precisa ser UMA definição só em todo o dashboard: Meta
// Marketing, /funil e /dashboard. Quando cada tela contava do seu jeito, o
// faturamento do mesmo período divergia em dezenas de milhares de reais.

function comRelogio(isoUtc, fn) {
  mock.timers.enable({ apis: ["Date"], now: new Date(isoUtc) });
  try {
    fn();
  } finally {
    mock.timers.reset();
  }
}

test("30 dias em 18/09/2026 vão de 19/08 a 18/09 (hoje - 30 até hoje)", () => {
  comRelogio("2026-09-18T18:00:00Z", () => {
    assert.deepEqual(ultimosDias(30), { inicio: "2026-08-19", fim: "2026-09-18" });
  });
});

test("Meta Marketing (periodoParaDatas) e o dashboard (ultimosDias) dão a mesma janela", () => {
  comRelogio("2026-09-18T18:00:00Z", () => {
    assert.deepEqual(periodoParaDatas("7d"), ultimosDias(7));
    assert.deepEqual(periodoParaDatas("30d"), ultimosDias(30));
    assert.deepEqual(periodoParaDatas("90d"), ultimosDias(90));
    // O botão de 60 dias do dashboard não existe no Meta, mas usa a mesma regra.
    assert.deepEqual(ultimosDias(60), { inicio: "2026-07-20", fim: "2026-09-18" });
  });
});

test("não vira 31-32 dias por causa do tamanho do mês (o bug do 'último mês')", () => {
  // Em 14/09, "1 mês atrás no mesmo dia" dava 14/08 (32 dias); a regra certa dá 15/08.
  comRelogio("2026-09-14T18:00:00Z", () => {
    assert.deepEqual(ultimosDias(30), { inicio: "2026-08-15", fim: "2026-09-14" });
  });
});

test("à noite em São Paulo ainda é o dia de São Paulo, não o dia UTC", () => {
  // 22h30 de 18/09 em Brasília já é 01h30 de 19/09 em UTC.
  comRelogio("2026-09-19T01:30:00Z", () => {
    assert.equal(ultimosDias(30).fim, "2026-09-18");
  });
});

test("'ano' vai de 1º de janeiro até hoje e 'custom' passa direto", () => {
  comRelogio("2026-09-18T18:00:00Z", () => {
    assert.deepEqual(periodoParaDatas("ano"), { inicio: "2026-01-01", fim: "2026-09-18" });
    const custom = { inicio: "2026-08-01", fim: "2026-08-15" };
    assert.deepEqual(periodoParaDatas("custom", custom), custom);
  });
});
