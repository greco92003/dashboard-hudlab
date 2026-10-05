import assert from "node:assert/strict";
import test from "node:test";
import { parseReportRequest, REPORTS } from "../app/meta-marketing/report-catalog.ts";

const q = (obj) => new URLSearchParams(obj);

test("relatório com período exige datas válidas e em ordem", () => {
  assert.deepEqual(parseReportRequest(q({ report: "summary", inicio: "2026-09-01", fim: "2026-09-30" })), {
    ok: true, report: "summary", rpc: "get_resumo_periodo", inicio: "2026-09-01", fim: "2026-09-30",
  });
  assert.deepEqual(parseReportRequest(q({ report: "summary", inicio: "2026-09-30", fim: "2026-09-01" })), { ok: false });
  assert.deepEqual(parseReportRequest(q({ report: "summary", inicio: "2026-02-30", fim: "2026-03-01" })), { ok: false });
  assert.deepEqual(parseReportRequest(q({ report: "summary" })), { ok: false });
});

test("período acima de 366 dias é recusado", () => {
  assert.deepEqual(parseReportRequest(q({ report: "ads", inicio: "2025-01-01", fim: "2026-09-30" })), { ok: false });
});

test("relatório sem período ignora datas", () => {
  assert.deepEqual(parseReportRequest(q({ report: "health" })), {
    ok: true, report: "health", rpc: "get_atribuicao_saude", inicio: null, fim: null,
  });
  assert.deepEqual(parseReportRequest(q({ report: "pipelines", inicio: "x", fim: "y" })), {
    ok: true, report: "pipelines", rpc: "get_nomes_pipelines", inicio: null, fim: null,
  });
});

test("relatório fora da lista e nomes herdados de Object são recusados", () => {
  for (const report of ["nada", "toString", "__proto__", "constructor", ""]) {
    assert.deepEqual(parseReportRequest(q({ report, inicio: "2026-09-01", fim: "2026-09-30" })), { ok: false });
  }
});

test("catálogo cobre os relatórios que as telas usam", () => {
  assert.deepEqual(Object.keys(REPORTS).sort(), [
    "ads", "funnel", "health", "leads-without-sale", "pipelines", "regions", "regions-history",
    "sales-without-pairs", "series", "sources", "summary", "top-campaigns", "utm-unmatched",
  ]);
});

test("regions usa período e regions-history não", () => {
  assert.deepEqual(parseReportRequest(q({ report: "regions", inicio: "2026-09-01", fim: "2026-09-30" })), {
    ok: true, report: "regions", rpc: "get_desempenho_uf", inicio: "2026-09-01", fim: "2026-09-30",
  });
  assert.deepEqual(parseReportRequest(q({ report: "regions-history" })), {
    ok: true, report: "regions-history", rpc: "get_desempenho_uf", inicio: null, fim: null,
  });
});
