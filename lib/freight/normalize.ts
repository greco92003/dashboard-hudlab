// ─── Normalization helpers for freight import/quotation ─────────────────────

/** Uppercase, strip accents, collapse whitespace, trim. */
export function normalizeText(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a Brazilian-formatted number: "1.362,37" → 1362.37, "41,93" → 41.93,
 * "8,83" → 8.83, "165,38" → 165.38. Returns null for blank/invalid.
 * Also tolerates already-numeric input and plain "1234.56".
 */
export function parseBRNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/r\$/gi, "").replace(/%/g, "").replace(/\s/g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Brazilian: dot = thousands, comma = decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  // else: only dots (or none) → treat as already-decimal
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a percentage into a fraction: "0,4000 %" → 0.004, "0,0020 %" → 0.00002,
 * "12" → 0.12, "12%" → 0.12. Returns null for blank/invalid.
 */
export function parsePercent(v: unknown): number | null {
  const n = parseBRNumber(v);
  if (n === null) return null;
  return n / 100;
}

/** Keep only digits. */
export function cepDigits(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * Normalize a CEP prefix used to key a lane/coverage. Carrier tables sometimes
 * drop the leading zero (e.g. "SAO PAULO-5092" is really CEP region 05092), so
 * we left-pad numeric prefixes to 5 digits. Non-numeric labels (ex "CENTRO")
 * return "". Longer strings are truncated to their first 5 digits.
 */
export function normalizeCepPrefix(v: unknown): string {
  const d = cepDigits(v);
  if (!d) return "";
  if (d.length >= 5) return d.slice(0, 5);
  return d.padStart(5, "0");
}

/**
 * Given a full destination CEP, return the 5-digit key used to match lanes.
 * "14400-000" → "14400", "05092000" → "05092". Short CEPs are left-padded.
 */
export function cepMatchKey(v: unknown): string {
  const d = cepDigits(v);
  if (!d) return "";
  if (d.length >= 5) return d.slice(0, 5);
  return d.padStart(5, "0");
}

const UF_LIST = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export function isValidUF(v: unknown): boolean {
  return UF_LIST.includes(normalizeText(v));
}

export const BR_STATES = UF_LIST;

/** Heuristic: does this look like a CEP (>= 7 digits) rather than a city name? */
export function looksLikeCep(v: unknown): boolean {
  return cepDigits(v).length >= 7;
}
