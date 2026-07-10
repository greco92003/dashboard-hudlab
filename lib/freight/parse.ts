import {
  normalizeText,
  parseBRNumber,
  parsePercent,
  normalizeCepPrefix,
  isValidUF,
} from "./normalize";

// ─── Parsed shapes ───────────────────────────────────────────────────────────
export interface ParsedLane {
  origin_city: string;
  origin_cep_prefix: string;
  dest_city: string;
  dest_cep_prefix: string;
  dest_uf: string | null;
  brackets: { max_weight_kg: number; price: number }[];
  excess_per_ton: number;
  advalorem_pct: number;
  toll_per_100kg: number;
  fee_up_to_50: number;
  fee_above_50: number;
  gris_pct: number;
  ta_value: number;
  min_price: number | null;
  icms_rate: number | null;
  valid: boolean;
  error?: string;
}

export interface ParsedCoverage {
  city: string;
  uf: string | null;
  cep_prefix: string | null;
  filial: string | null;
  km: number | null;
  frequency: string | null;
  prazo_min: number | null;
  prazo_max: number | null;
  tda_value: number | null;
  valid: boolean;
  error?: string;
}

type Row = (string | number | null)[];

const cell = (row: Row, i: number): string => (i < 0 ? "" : String(row[i] ?? "").trim());
const norm = (v: unknown) => normalizeText(v);
/** Header key: normalized + underscores treated as spaces (so "ate_10kg" ≈ "Ate 10 kg"). */
const headerKey = (v: unknown) => norm(v).replace(/_/g, " ").replace(/\s+/g, " ").trim();
const BRACKET_RE = /^ATE (\d+) ?KG$/;

/** Split "NOVO HAMBURGO-93300" / "FRANCA -14405" / "SAO PAULO-5092" → city + cep prefix. */
export function splitPraca(raw: unknown): { city: string; cep_prefix: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { city: "", cep_prefix: "" };
  const m = s.match(/^(.*?)[\s-]+(\d[\d.-]*)\s*$/);
  if (m) {
    return { city: norm(m[1]), cep_prefix: normalizeCepPrefix(m[2]) };
  }
  return { city: norm(s), cep_prefix: "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICE TABLE (fractional)
// ─────────────────────────────────────────────────────────────────────────────

interface PriceMapping {
  headerRow: number;
  origin: number;
  dest: number;
  uf: number;
  brackets: { col: number; max: number }[];
  ton: number;
  advalorem: number;
  pedagio: number;
  taxaAte50: number;
  taxaAcima50: number;
  gris: number;
  ta: number;
  min: number;
  icms: number;
}

/** Find a column whose header contains any of the terms (substring, normalized). */
const findCol = (header: Row, ...terms: string[]): number =>
  header.findIndex((h) => {
    const n = headerKey(h);
    return n !== "" && terms.some((t) => n.includes(headerKey(t)));
  });
/** Same, but only considering columns at index >= minCol (avoids bracket collisions). */
const findColFrom = (header: Row, minCol: number, ...terms: string[]): number => {
  for (let c = Math.max(0, minCol); c < header.length; c++) {
    const n = headerKey(header[c]);
    if (n !== "" && terms.some((t) => n.includes(headerKey(t)))) return c;
  }
  return -1;
};
/** Exact-match a column by normalized header key. */
const findExact = (header: Row, ...names: string[]): number =>
  header.findIndex((h) => names.some((nm) => headerKey(h) === headerKey(nm)));

/**
 * Detect the header row + column mapping for a fractional price table.
 *
 * Primary/reliable path is the canonical template (unambiguous single-row
 * headers). Raw carrier layouts are handled best-effort: the bracket columns
 * are the first *contiguous* run of "Ate N kg" headers (so a later "Até 50 kg"
 * tax column is not mistaken for a weight bracket), and fee columns are only
 * searched to the right of the brackets.
 */
function detectPriceMapping(rows: Row[]): PriceMapping | null {
  // header = first row with >= 2 bracket cells, or an explicit origin/dest header
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const keys = rows[i].map(headerKey);
    const bracketCount = keys.filter((k) => BRACKET_RE.test(k)).length;
    const hasOD = keys.includes("ORIGEM") || keys.includes("DESTINO") || keys.includes("REGIAO B");
    if (bracketCount >= 2 || (hasOD && bracketCount >= 1)) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return null;
  const header = rows[headerRow];

  // brackets = first contiguous run of "ATE N KG" columns
  const allBr: { col: number; max: number }[] = [];
  header.forEach((h, col) => {
    const m = headerKey(h).match(BRACKET_RE);
    if (m) allBr.push({ col, max: parseInt(m[1], 10) });
  });
  allBr.sort((a, b) => a.col - b.col);
  const brackets: { col: number; max: number }[] = [];
  for (const b of allBr) {
    if (brackets.length === 0 || b.col === brackets[brackets.length - 1].col + 1) brackets.push(b);
    else break;
  }
  brackets.sort((a, b) => a.max - b.max);
  const firstBracketCol = brackets[0]?.col ?? 2;
  const lastBracketCol = brackets.length ? brackets[brackets.length - 1].col : 1;
  const feeMin = lastBracketCol + 1;

  // origin/dest: labeled, else the first two non-empty columns before the brackets
  let origin = findCol(header, "regiao a", "origem", "coleta");
  let dest = findCol(header, "regiao b", "destino", "entrega");
  if (origin === -1 || dest === -1) {
    const textCols: number[] = [];
    for (let c = 0; c < firstBracketCol; c++) if (norm(header[c]) !== "") textCols.push(c);
    if (origin === -1) origin = textCols[0] ?? 0;
    if (dest === -1) dest = textCols[1] ?? 1;
  }

  // fee columns (only to the right of the brackets)
  const ton = findColFrom(header, feeMin, "tonelada");
  let advalorem = findExact(header, "advalorem_pct", "advalorem");
  if (advalorem === -1) advalorem = findColFrom(header, feeMin, "advalorem", "ad valorem", "frete valor");
  let gris = findColFrom(header, feeMin, "gris");
  const pedagio = findColFrom(header, feeMin, "pedagio", "p/cada", "cada 100");
  let taxaAte50 = findExact(header, "taxa_ate_50");
  if (taxaAte50 === -1) taxaAte50 = findColFrom(header, feeMin, "taxa ate 50", "ate 50", "taxas");
  let taxaAcima50 = findExact(header, "taxa_acima_50");
  if (taxaAcima50 === -1) taxaAcima50 = findColFrom(header, feeMin, "acima 50", "+ de 50", "mais de 50");
  let ta = findExact(header, "ta", "ta_valor", "tas");
  if (ta === -1) ta = findColFrom(header, feeMin, "ta valor");
  const min = findExact(header, "min", "minimo", "min_price");
  const icms = findExact(header, "icms", "icms_pct");

  // Two "% s/Valor NF" columns unlabeled → resolve by position (advalorem first, gris last)
  if (advalorem === -1 || gris === -1) {
    const pctCols = header
      .map((h, c) => ({ c, isPct: /%/.test(String(h ?? "")) || /s\/?\s*valor/i.test(String(h ?? "")) }))
      .filter((x) => x.isPct && x.c >= feeMin)
      .map((x) => x.c);
    if (advalorem === -1 && pctCols.length >= 1) advalorem = pctCols[0];
    if (gris === -1 && pctCols.length >= 2) gris = pctCols[pctCols.length - 1];
  }
  if (taxaAcima50 === -1 && taxaAte50 !== -1) taxaAcima50 = taxaAte50 + 1;

  return {
    headerRow,
    origin,
    dest,
    uf: findColFrom(header, 0, "uf", "estado"),
    brackets,
    ton,
    advalorem,
    pedagio,
    taxaAte50,
    taxaAcima50,
    gris,
    ta,
    min,
    icms,
  };
}

/**
 * Parse a fractional price table from raw rows. Because carrier tables list lanes
 * bidirectionally (A→B and B→A), we detect the fixed origin (the most frequent
 * praça) and, for each row, treat the *other* endpoint as the destination.
 */
export function parsePriceTable(rows: Row[]): {
  origin_label: string;
  lanes: ParsedLane[];
  mapping: PriceMapping | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const map = detectPriceMapping(rows);
  if (!map) {
    return {
      origin_label: "",
      lanes: [],
      mapping: null,
      warnings: ["Não foi possível detectar as faixas de peso (colunas 'até N kg')."],
    };
  }

  const dataRows = rows.slice(map.headerRow + 1).filter((r) => {
    const a = cell(r, map.origin);
    const b = cell(r, map.dest);
    return (a || b) && !/filtro vazio|regiao a|regiao b/i.test(a + b);
  });

  // find the fixed origin = most frequent praça across origin+dest columns
  const freq = new Map<string, number>();
  for (const r of dataRows) {
    for (const idx of [map.origin, map.dest]) {
      const p = splitPraca(cell(r, idx));
      const key = `${p.city}-${p.cep_prefix}`;
      if (p.city) freq.set(key, (freq.get(key) ?? 0) + 1);
    }
  }
  let origin_label = "";
  let originKey = "";
  let best = 0;
  for (const [k, n] of freq) {
    if (n > best) {
      best = n;
      originKey = k;
      origin_label = k;
    }
  }

  const lanes: ParsedLane[] = [];
  for (const r of dataRows) {
    const pa = splitPraca(cell(r, map.origin));
    const pb = splitPraca(cell(r, map.dest));
    const aKey = `${pa.city}-${pa.cep_prefix}`;
    // destination = the endpoint that isn't the fixed origin
    const destP = aKey === originKey ? pb : pa;
    const originP = aKey === originKey ? pa : pb;

    const brackets = map.brackets
      .map((b) => ({ max_weight_kg: b.max, price: parseBRNumber(r[b.col]) ?? 0 }))
      .filter((b) => b.price > 0);

    const ufCell = map.uf >= 0 ? norm(r[map.uf]) : "";
    const lane: ParsedLane = {
      origin_city: originP.city,
      origin_cep_prefix: originP.cep_prefix,
      dest_city: destP.city,
      dest_cep_prefix: destP.cep_prefix,
      dest_uf: isValidUF(ufCell) ? ufCell : null,
      brackets,
      excess_per_ton: map.ton >= 0 ? parseBRNumber(r[map.ton]) ?? 0 : 0,
      advalorem_pct: map.advalorem >= 0 ? parsePercent(r[map.advalorem]) ?? 0 : 0,
      toll_per_100kg: map.pedagio >= 0 ? parseBRNumber(r[map.pedagio]) ?? 0 : 0,
      fee_up_to_50: map.taxaAte50 >= 0 ? parseBRNumber(r[map.taxaAte50]) ?? 0 : 0,
      fee_above_50: map.taxaAcima50 >= 0 ? parseBRNumber(r[map.taxaAcima50]) ?? 0 : 0,
      gris_pct: map.gris >= 0 ? parsePercent(r[map.gris]) ?? 0 : 0,
      ta_value: map.ta >= 0 ? parseBRNumber(r[map.ta]) ?? 0 : 0,
      min_price: map.min >= 0 ? parseBRNumber(r[map.min]) : null,
      icms_rate: map.icms >= 0 ? parsePercent(r[map.icms]) : null,
      valid: false,
    };
    lane.valid = !!lane.dest_city && lane.brackets.length > 0;
    if (!lane.valid) lane.error = !lane.dest_city ? "Destino ausente" : "Sem faixas de peso válidas";
    lanes.push(lane);
  }

  // dedupe by destination key, keeping the first valid occurrence
  const seen = new Set<string>();
  const deduped: ParsedLane[] = [];
  for (const l of lanes) {
    const k = `${l.dest_city}-${l.dest_cep_prefix}`;
    if (l.valid && seen.has(k)) continue;
    if (l.valid) seen.add(k);
    deduped.push(l);
  }

  if (!origin_label) warnings.push("Origem não detectada automaticamente.");
  return { origin_label, lanes: deduped, mapping: map, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// COVERAGE (relação de praças)
// ─────────────────────────────────────────────────────────────────────────────

export function parseCoverage(rows: Row[]): {
  rows: ParsedCoverage[];
  warnings: string[];
} {
  const warnings: string[] = [];
  // header = first row containing CIDADE and (FILIAL or UF)
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const set = rows[i].map((c) => norm(c));
    if (set.includes("CIDADE") && (set.includes("FILIAL") || set.includes("UF"))) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) {
    return { rows: [], warnings: ["Cabeçalho não encontrado (esperado colunas CIDADE, UF...)."] };
  }
  const header = rows[headerRow];
  const iCity = findCol(header, "cidade", "municipio");
  const iFilial = findCol(header, "filial");
  const iPerc = findCol(header, "perc", "cep");
  const iKm = findCol(header, "km");
  const iUf = findCol(header, "uf", "estado");
  const iFreq = findCol(header, "frequencia", "frequ");
  const iMin = findCol(header, "min");
  const iMax = findCol(header, "max");

  const out: ParsedCoverage[] = [];
  // Scan ALL rows (this carrier's sheet can have data both above and below the
  // header row). A data row is one with a city AND a valid UF; that filter drops
  // titles ("RELAÇÃO DE PRAÇAS"), region headers ("RIO GRANDE DO SUL") and the
  // header row itself.
  for (let i = 0; i < rows.length; i++) {
    if (i === headerRow) continue;
    const r = rows[i];
    const city = norm(r[iCity]);
    const ufVal = iUf >= 0 ? norm(r[iUf]) : "";
    if (!city || !isValidUF(ufVal)) continue;

    // TDA: find a cell == "T.D.A"/"TDA" and take the next numeric cell
    let tda: number | null = null;
    for (let c = 0; c < r.length; c++) {
      const n = norm(r[c]).replace(/\./g, "");
      if (n === "TDA") {
        tda = parseBRNumber(r[c + 1]);
        break;
      }
    }

    out.push({
      city,
      uf: isValidUF(ufVal) ? ufVal : null,
      cep_prefix: iPerc >= 0 ? normalizeCepPrefix(r[iPerc]) || (cell(r, iPerc) ? norm(r[iPerc]) : null) : null,
      filial: iFilial >= 0 ? norm(r[iFilial]) || null : null,
      km: iKm >= 0 ? parseBRNumber(r[iKm]) : null,
      frequency: iFreq >= 0 ? cell(r, iFreq) || null : null,
      prazo_min: iMin >= 0 ? (parseBRNumber(r[iMin]) ?? null) : null,
      prazo_max: iMax >= 0 ? (parseBRNumber(r[iMax]) ?? null) : null,
      tda_value: tda,
      valid: !!city,
    });
  }

  if (out.length === 0) warnings.push("Nenhuma praça encontrada abaixo do cabeçalho.");
  return { rows: out, warnings };
}
