import assert from "node:assert/strict";
import { test } from "node:test";
import {
  limitesDosFechamentos,
  mesDeFechamento,
  mesesRecentes,
  rotuloDoFechamento,
} from "../lib/live-dashboard-period.ts";

test("Vendedores: no dia 01 o fechamento em curso ainda é o do mês anterior", () => {
  // 01/10/2026 às 10h em Brasília
  assert.deepEqual(mesesRecentes(2, new Date("2026-10-01T13:00:00Z")), [
    { month: 9, year: 2026 },
    { month: 8, year: 2026 },
  ]);
  assert.deepEqual(mesesRecentes(1, new Date("2026-10-02T13:00:00Z")), [{ month: 10, year: 2026 }]);
  assert.equal(rotuloDoFechamento({ month: 9, year: 2026 }), "Setembro/2026");
});

// Fechamento mensal: dia 02 até o dia 01 do mês seguinte (vende-se até
// meia-noite do último dia e parte dos cadastros termina no dia 01).

test("venda do dia 01 conta no mês anterior; do dia 02 em diante, no próprio mês", () => {
  assert.deepEqual(mesDeFechamento("2026-10-01"), { month: 9, year: 2026 });
  assert.deepEqual(mesDeFechamento("2026-09-02"), { month: 9, year: 2026 });
  assert.deepEqual(mesDeFechamento("2026-09-30"), { month: 9, year: 2026 });
  assert.deepEqual(mesDeFechamento("2026-01-01"), { month: 12, year: 2025 });
});

test("limites dos fechamentos de agosto a setembro: 02/08 a 01/10", () => {
  assert.deepEqual(
    limitesDosFechamentos({ month: 8, year: 2026 }, { month: 9, year: 2026 }),
    { inicio: "2026-08-02", fim: "2026-10-01" },
  );
  assert.deepEqual(
    limitesDosFechamentos({ month: 1, year: 2026 }, { month: 12, year: 2026 }),
    { inicio: "2026-01-02", fim: "2027-01-01" },
  );
});
