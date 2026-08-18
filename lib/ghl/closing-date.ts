/**
 * For won deals, the provider status transition is the canonical sale date.
 * A manually maintained custom field may be stale from a previous CRM or an
 * earlier negotiation and must not hide a newly won sale from dashboards.
 */
export function resolveGhlClosingDate(input: {
  normalizedStatus: string | null;
  statusChangeDate: string | null;
  customFieldDate: string | null;
}): string | null {
  if (input.normalizedStatus === "won") {
    return input.statusChangeDate || input.customFieldDate;
  }
  return input.customFieldDate;
}
