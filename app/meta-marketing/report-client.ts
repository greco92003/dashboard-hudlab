import type { MarketingReport } from "./report-catalog";

export type { MarketingReport };

export interface MarketingReportResult<T> {
  data: T;
  updatedAt: string | null;
  stale: boolean;
}

export function fetchMarketingReport<T>(
  report: MarketingReport,
  inicio: string,
  fim: string,
  signal?: AbortSignal,
): Promise<MarketingReportResult<T>> {
  return fetchReport<T>(report, new URLSearchParams({ report, inicio, fim }), signal);
}

/** Relatórios sem período (retrato do momento, cache de 30 min). */
export function fetchMarketingSnapshot<T>(
  report: MarketingReport,
  signal?: AbortSignal,
): Promise<MarketingReportResult<T>> {
  return fetchReport<T>(report, new URLSearchParams({ report }), signal);
}

async function fetchReport<T>(
  report: MarketingReport,
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<MarketingReportResult<T>> {
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
