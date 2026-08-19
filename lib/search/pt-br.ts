export function normalizePtBrSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9@.+\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function includesPtBrSearch(candidate: string, query: string) {
  const normalizedQuery = normalizePtBrSearch(query);
  return Boolean(
    normalizedQuery && normalizePtBrSearch(candidate).includes(normalizedQuery),
  );
}

/**
 * The GHL legacy contact endpoint is accent-sensitive. These narrower probes
 * retrieve a small candidate set; final matching is always done locally with
 * Unicode normalization, so a probe can never become a false-positive result.
 */
export function buildContactSearchProbes(query: string) {
  const trimmed = query.trim();
  if (!/\p{L}/u.test(trimmed) || /@|\d{5,}/.test(trimmed)) return [trimmed];

  const words = trimmed.split(/\s+/).filter((word) => word.length >= 2);
  const probes = [trimmed, ...words];
  const accents: Record<string, string[]> = {
    a: ["á", "à", "â", "ã"],
    e: ["é", "ê"],
    i: ["í"],
    o: ["ó", "ô", "õ"],
    u: ["ú"],
    c: ["ç"],
  };
  for (const word of words) {
    const normalized = normalizePtBrSearch(word);
    probes.push(normalized);
    for (let index = 0; index < normalized.length; index += 1) {
      for (const accented of accents[normalized[index]] ?? []) {
        probes.push(
          `${normalized.slice(0, index)}${accented}${normalized.slice(index + 1)}`,
        );
      }
    }
    if (normalized.length >= 4) {
      probes.push(normalized.slice(0, 3), normalized.slice(-3));
    }
  }
  return Array.from(new Set(probes.filter(Boolean))).slice(0, 24);
}
