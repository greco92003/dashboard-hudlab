export interface TopCampaign {
  campaign_name: string;
  spend: number;
  faturamento: number;
  vendas: number;
  roas: number | null;
}

// Preserve the Overview's previous aggregation exactly: sum compatible
// amounts first and calculate ROAS from the campaign totals, including bio.
export function summarizeTopCampaigns(payload: unknown): TopCampaign[] {
  const byCampaign = new Map<string, TopCampaign>();
  for (const row of (payload ?? []) as Array<Record<string, unknown>>) {
    const name = String(row.campaign_name ?? "(sem campanha)");
    const current = byCampaign.get(name) ?? {
      campaign_name: name, spend: 0, faturamento: 0, vendas: 0, roas: null,
    };
    current.spend += Number(row.spend_total) || 0;
    current.faturamento += Number(row.faturamento) || 0;
    current.vendas += Number(row.vendas) || 0;
    byCampaign.set(name, current);
  }
  return [...byCampaign.values()]
    .map((row) => ({ ...row, roas: row.spend > 0 ? row.faturamento / row.spend : null }))
    .sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1))
    .slice(0, 5);
}
