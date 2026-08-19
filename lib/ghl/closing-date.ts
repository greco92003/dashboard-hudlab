/** Known bulk-import status timestamp; this is not a runtime cutover. */
export const GHL_AC_IMPORT_ARTIFACT_DATE = "2026-08-03";

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
    const isKnownImportArtifact =
      input.statusChangeDate === GHL_AC_IMPORT_ARTIFACT_DATE &&
      input.customFieldDate !== null &&
      input.customFieldDate !== GHL_AC_IMPORT_ARTIFACT_DATE;

    if (isKnownImportArtifact) return input.customFieldDate;
    return input.statusChangeDate || input.customFieldDate;
  }
  return input.customFieldDate;
}
