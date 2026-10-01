import assert from "node:assert/strict";
import test from "node:test";
import { summarizeTopCampaigns } from "../app/meta-marketing/top-campaigns.ts";

test("Top 5 soma anúncios e bio antes de recalcular o ROAS da campanha", () => {
  const rows = [
    { campaign_name: "Campanha A", spend_total: 100, faturamento: 200, vendas: 1 },
    { campaign_name: "Campanha A", spend_total: 50, faturamento: 100, vendas: 1 },
    { campaign_name: "Campanha A", spend_total: 0, faturamento: 150, vendas: 1 },
    { campaign_name: "Campanha B", spend_total: 100, faturamento: 100, vendas: 1 },
  ];
  assert.deepEqual(summarizeTopCampaigns(rows), [
    { campaign_name: "Campanha A", spend: 150, faturamento: 450, vendas: 3, roas: 3 },
    { campaign_name: "Campanha B", spend: 100, faturamento: 100, vendas: 1, roas: 1 },
  ]);
});
