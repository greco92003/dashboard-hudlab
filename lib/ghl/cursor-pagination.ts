export interface GhlCursor {
  startAfter: string;
  startAfterId: string;
}

export interface GhlPage<T> {
  items: T[];
  total: number;
  nextPageUrl: string | null;
}

export interface GhlCompleteSnapshot<T> {
  items: T[];
  expectedTotal: number;
  pages: number;
  duplicates: number;
  complete: true;
}

function readCursor(nextPageUrl: string | null): GhlCursor | null {
  if (!nextPageUrl) return null;
  const url = new URL(nextPageUrl);
  const startAfter = url.searchParams.get("startAfter");
  const startAfterId = url.searchParams.get("startAfterId");
  if (!startAfter || !startAfterId) {
    throw new Error("GHL pagination metadata is missing its cursor");
  }
  return { startAfter, startAfterId };
}

/**
 * Collect a stable GHL snapshot using the opaque cursor returned by every
 * page. Numeric page offsets are not safe while opportunities are changing.
 * The exact unique count must match GHL's final total before callers may use
 * this snapshot for destructive reconciliation.
 */
export async function collectGhlCursorSnapshot<T extends { id: string }>(input: {
  fetchPage: (cursor: GhlCursor | null) => Promise<GhlPage<T>>;
  maxPages?: number;
}): Promise<GhlCompleteSnapshot<T>> {
  const maxPages = input.maxPages ?? 2_000;
  const itemsById = new Map<string, T>();
  const seenCursors = new Set<string>();
  let cursor: GhlCursor | null = null;
  let expectedTotal: number | null = null;
  let duplicates = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await input.fetchPage(cursor);
    if (!Number.isSafeInteger(result.total) || result.total < 0) {
      throw new Error("GHL pagination returned an invalid total");
    }
    expectedTotal = result.total;

    for (const item of result.items) {
      if (!item?.id) throw new Error("GHL pagination returned an item without id");
      if (itemsById.has(item.id)) duplicates += 1;
      itemsById.set(item.id, item);
    }

    const nextCursor = readCursor(result.nextPageUrl);
    if (!nextCursor) {
      if (itemsById.size !== expectedTotal) {
        throw new Error(
          `Incomplete GHL snapshot: received ${itemsById.size} unique opportunities, expected ${expectedTotal}`,
        );
      }
      return {
        items: Array.from(itemsById.values()),
        expectedTotal,
        pages: page,
        duplicates,
        complete: true,
      };
    }

    const cursorKey = `${nextCursor.startAfter}:${nextCursor.startAfterId}`;
    if (seenCursors.has(cursorKey)) {
      throw new Error("GHL pagination returned a repeated cursor");
    }
    seenCursors.add(cursorKey);
    cursor = nextCursor;
  }

  throw new Error(`GHL pagination exceeded the ${maxPages}-page safety limit`);
}
