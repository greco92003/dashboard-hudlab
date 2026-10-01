export type MarketingReport =
  | "summary" | "series" | "funnel" | "sources" | "ads" | "top-campaigns";

export interface MarketingReportResult<T> {
  data: T;
  updatedAt: string | null;
  stale: boolean;
}

export async function fetchMarketingReport<T>(
  report: MarketingReport,
  inicio: string,
  fim: string,
  signal?: AbortSignal,
): Promise<MarketingReportResult<T>> {
  const params = new URLSearchParams({ report, inicio, fim });
  const url = `/api/meta-marketing/report?${params.toString()}`;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const response = await fetch(url, { cache: "no-store", signal });
    const body = await response.json().catch(() => null);
    if (response.status === 202) {
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        const onAbort = () => {
          clearTimeout(timer);
          reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, 1_000);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
      continue;
    }
    if (!response.ok || !body || !("data" in body)) {
      throw new Error(body?.error ?? `Falha ao carregar ${report}`);
    }
    return { data: body.data as T, updatedAt: body.updatedAt ?? null, stale: Boolean(body.stale) };
  }
  throw new Error(`Tempo esgotado ao carregar ${report}`);
}
