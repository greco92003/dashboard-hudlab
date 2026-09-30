import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { janelaComparacao, INICIO_COLETA_META } from "../app/meta-marketing/lib.ts";

// A variação % do Meta Marketing compara só dias FECHADOS com o período
// anterior de mesma duração -- o total do período continua incluindo hoje
// (para bater com o /dashboard). É a mesma regra de get_resumo_periodo no
// banco; os casos abaixo são os que foram conferidos lá em 30/09/2026.

function em(isoUtc, fn) {
  mock.timers.enable({ apis: ["Date"], now: new Date(isoUtc) });
  try {
    fn();
  } finally {
    mock.timers.reset();
  }
}

const HOJE = "2026-09-30T18:00:00Z"; // 15h em São Paulo

test("30 dias: compara 31/08-29/09 (sem hoje) com 01/08-30/08", () => {
  em(HOJE, () => {
    const j = janelaComparacao("2026-08-31", "2026-09-30");
    assert.equal(j.inicio, "2026-08-31");
    assert.equal(j.fim, "2026-09-30");
    assert.deepEqual(j.atualFechado, { inicio: "2026-08-31", fim: "2026-09-29" });
    assert.deepEqual(j.anterior, { inicio: "2026-08-01", fim: "2026-08-30" });
    assert.equal(j.semComparacao, null);
  });
});

test("7 dias: compara 23/09-29/09 com 16/09-22/09", () => {
  em(HOJE, () => {
    const j = janelaComparacao("2026-09-23", "2026-09-30");
    assert.deepEqual(j.atualFechado, { inicio: "2026-09-23", fim: "2026-09-29" });
    assert.deepEqual(j.anterior, { inicio: "2026-09-16", fim: "2026-09-22" });
  });
});

test("90 dias: o anterior cairia antes da coleta, então não compara", () => {
  em(HOJE, () => {
    const j = janelaComparacao("2026-07-02", "2026-09-30");
    assert.equal(j.semComparacao, "anterior_antes_da_coleta");
    assert.equal(j.atualFechado, null);
    assert.equal(j.anterior, null);
  });
});

test("Ano: começa no início da coleta do Meta e não compara", () => {
  em(HOJE, () => {
    const j = janelaComparacao("2026-01-01", "2026-09-30");
    assert.equal(INICIO_COLETA_META, "2026-07-01");
    assert.equal(j.inicio, "2026-07-01");
    assert.equal(j.recortadoNaColeta, true);
    assert.equal(j.semComparacao, "anterior_antes_da_coleta");
  });
});

test("período já encerrado compara inteiro (agosto x julho)", () => {
  em(HOJE, () => {
    const j = janelaComparacao("2026-08-01", "2026-08-31");
    assert.deepEqual(j.atualFechado, { inicio: "2026-08-01", fim: "2026-08-31" });
    assert.deepEqual(j.anterior, { inicio: "2026-07-01", fim: "2026-07-31" });
    assert.equal(j.recortadoNaColeta, false);
  });
});

test("só hoje: ainda não há dia fechado para comparar", () => {
  em(HOJE, () => {
    const j = janelaComparacao("2026-09-30", "2026-09-30");
    assert.equal(j.semComparacao, "sem_dia_fechado");
  });
});

test("à noite em São Paulo, 'hoje' continua sendo o dia de São Paulo", () => {
  // 22h30 de 30/09 em Brasília já é 01h30 de 01/10 em UTC.
  em("2026-10-01T01:30:00Z", () => {
    const j = janelaComparacao("2026-08-31", "2026-09-30");
    assert.deepEqual(j.atualFechado, { inicio: "2026-08-31", fim: "2026-09-29" });
  });
});
