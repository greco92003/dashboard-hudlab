const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses dates from the GHL cache without ever throwing.
 *
 * `closing_date` is normally a DATE (`YYYY-MM-DD`), which is interpreted at
 * noon in Sao Paulo to avoid changing calendar days. Full ISO timestamps are
 * also accepted because older/provider payloads can contain them.
 */
export function parseGhlFunnelTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (!normalized) return null;

  const candidate = DATE_ONLY_RE.test(normalized)
    ? `${normalized}T12:00:00.000-03:00`
    : normalized;
  const timestamp = Date.parse(candidate);

  if (!Number.isFinite(timestamp)) return null;

  // Date.parse normalizes some impossible calendar dates instead of rejecting
  // them (for example, February 30). Do not let those enter the funnel.
  if (
    DATE_ONLY_RE.test(normalized) &&
    new Date(timestamp).toISOString().slice(0, 10) !== normalized
  ) {
    return null;
  }

  return timestamp;
}

export function toGhlFunnelIso(value: unknown): string | null {
  const timestamp = parseGhlFunnelTimestamp(value);
  return timestamp === null ? null : new Date(timestamp).toISOString();
}
