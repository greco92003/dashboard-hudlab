import { normalizeText, cepMatchKey, looksLikeCep } from "./normalize";
import { haversineKm } from "./cep";
import type { FreightLane, FreightCoverage } from "./types";

export interface DestinationResolution {
  matchedBy: "cep" | "city" | "none";
  cepKey: string;
  cityKey: string;
  /** lanes matching the destination (may be >1 when a city has several CEP faixas) */
  laneMatches: FreightLane[];
  ambiguous: boolean;
}

/**
 * Resolve a free-text destination (a CEP or a city name) against a set of lanes.
 * CEP is matched by its 5-digit prefix key; a bare city is matched by name and
 * may resolve to several lanes (different CEP faixas → ambiguous).
 */
export function resolveDestination(
  input: string,
  lanes: FreightLane[],
): DestinationResolution {
  const cepKey = cepMatchKey(input);
  const cityKey = normalizeText(input.replace(/\d/g, "").replace(/[-/]/g, " "));

  if (looksLikeCep(input) && cepKey) {
    const laneMatches = lanes.filter((l) => l.dest_cep_prefix && l.dest_cep_prefix === cepKey);
    if (laneMatches.length > 0) {
      return { matchedBy: "cep", cepKey, cityKey, laneMatches, ambiguous: false };
    }
    // no prefix match → fall through to nothing (city unknown from CEP alone)
    return { matchedBy: "none", cepKey, cityKey, laneMatches: [], ambiguous: false };
  }

  // city-name match
  const laneMatches = lanes.filter((l) => normalizeText(l.dest_city) === cityKey);
  const distinctPrefixes = new Set(laneMatches.map((l) => l.dest_cep_prefix));
  return {
    matchedBy: laneMatches.length > 0 ? "city" : "none",
    cepKey,
    cityKey,
    laneMatches,
    ambiguous: distinctPrefixes.size > 1,
  };
}

/** Lanes matching a resolved city name (from a CEP lookup). */
export function matchLanesByCity(city: string, lanes: FreightLane[]): FreightLane[] {
  const key = normalizeText(city);
  if (!key) return [];
  return lanes.filter((l) => normalizeText(l.dest_city) === key);
}

export interface NearestMatch {
  lane: FreightLane;
  /** km when coordinates were available, else null (fell back to CEP-prefix proximity) */
  km: number | null;
}

/**
 * Nearest served praça for a destination CEP, used only as an *estimate* when no
 * exact/city match exists. Uses real geodistance when coordinates are available
 * (dest coords + praça coords), otherwise falls back to CEP-prefix numeric
 * proximity. Candidates are restricted to the same UF (when known) and the same
 * CEP macro-region (first digit) so we never map, say, a Bahia CEP to an SP praça.
 */
export function matchNearestLane(
  destCep: string,
  uf: string | null,
  destCoords: { lat: number; lng: number } | null,
  lanes: FreightLane[],
  laneCoords?: Map<string, { lat: number; lng: number }>,
): NearestMatch | null {
  const key = cepMatchKey(destCep);
  if (!key) return null;
  const num = parseInt(key, 10);
  const region = key[0];

  let candidates = lanes.filter((l) => l.dest_cep_prefix);
  if (uf) {
    const sameUf = candidates.filter((l) => (l.dest_uf || "").toUpperCase() === uf.toUpperCase());
    if (sameUf.length) candidates = sameUf;
  }
  const sameRegion = candidates.filter((l) => l.dest_cep_prefix[0] === region);
  if (sameRegion.length === 0) return null; // don't guess across macro-regions
  candidates = sameRegion;

  // Prefer real geodistance if we have coordinates for the destination and praças
  if (destCoords && laneCoords) {
    let best: NearestMatch | null = null;
    for (const l of candidates) {
      const c = laneCoords.get(l.dest_cep_prefix);
      if (!c) continue;
      const km = haversineKm(destCoords, c);
      if (best === null || (best.km ?? Infinity) > km) best = { lane: l, km };
    }
    if (best) return best;
  }

  // Fallback: numeric CEP-prefix proximity
  let best: { lane: FreightLane; diff: number } | null = null;
  for (const l of candidates) {
    const diff = Math.abs(parseInt(l.dest_cep_prefix, 10) - num);
    if (best === null || diff < best.diff) best = { lane: l, diff };
  }
  return best ? { lane: best.lane, km: null } : null;
}

/** Best coverage row (prazo/TDA) for a destination, matched by CEP prefix then city. */
export function matchCoverage(
  input: string,
  coverage: FreightCoverage[],
  resolvedCity?: string | null,
): FreightCoverage | null {
  const cepKey = cepMatchKey(input);
  const cityKey = normalizeText(input.replace(/\d/g, "").replace(/[-/]/g, " "));
  if (looksLikeCep(input) && cepKey) {
    const byCep = coverage.find((c) => c.cep_prefix && cepMatchKey(c.cep_prefix) === cepKey);
    if (byCep) return byCep;
  }
  if (resolvedCity) {
    const byResolved = coverage.find((c) => normalizeText(c.city) === normalizeText(resolvedCity));
    if (byResolved) return byResolved;
  }
  return coverage.find((c) => normalizeText(c.city) === cityKey) ?? null;
}
