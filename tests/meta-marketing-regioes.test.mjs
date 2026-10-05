import assert from "node:assert/strict";
import test from "node:test";
import { somarPorUf, sazonalidade, valorMetrica } from "../app/meta-marketing/regioes-dados.ts";

const rows = [
  { uf: "SP", region_group: "Sudeste", mes: "2026-08-01", estacao: "inverno", spend: "100", leads_meta: 0, leads_ghl: 3, mockups: 2, vendas: 1, faturamento: "400" },
  { uf: "SP", region_group: "Sudeste", mes: "2026-09-01", estacao: "inverno", spend: 100, leads_meta: 0, leads_ghl: 1, mockups: 0, vendas: 1, faturamento: 200 },
  { uf: "RS", region_group: "Sul", mes: "2026-09-01", estacao: "inverno", spend: 0, leads_meta: 0, leads_ghl: 0, mockups: 0, vendas: 2, faturamento: 300 },
  { uf: "XX", region_group: null, mes: "2026-09-01", estacao: "inverno", spend: 50, leads_meta: 0, leads_ghl: 0, mockups: 0, vendas: 0, faturamento: 0 },
];

test("soma por UF e calcula ROAS e custo por mockup", () => {
  const sp = somarPorUf(rows).find((t) => t.uf === "SP");
  assert.deepEqual(sp, { uf: "SP", region_group: "Sudeste", spend: 200, mockups: 2, vendas: 2, faturamento: 600, roas: 3, custo_mockup: 100 });
  const rs = somarPorUf(rows).find((t) => t.uf === "RS");
  assert.equal(rs.roas, null);
  assert.equal(valorMetrica(rs, "roas"), null);
  assert.equal(valorMetrica(rs, "faturamento"), 300);
});

test("sazonalidade igual à view: ignora UF sem região", () => {
  assert.deepEqual(sazonalidade(rows).sort((a, b) => a.region_group.localeCompare(b.region_group)), [
    { region_group: "Sudeste", estacao: "inverno", spend: 200, vendas: 2, faturamento: 600, roas: 3, cpa: 100 },
    { region_group: "Sul", estacao: "inverno", spend: 0, vendas: 2, faturamento: 300, roas: null, cpa: 0 },
  ]);
});
