import { tinyV3AuthHeaders } from "./auth";
import { TINY_V3_BASE_URL } from "./endpoints";

type TinyV3RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  params?: Record<string, string>;
  body?: unknown;
};

const RATE_LIMIT_RETRIES = 3;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function tinyV3Request<T>(
  path: string,
  options: TinyV3RequestOptions = {},
): Promise<T> {
  const query = new URLSearchParams(options.params ?? {});
  const url = `${TINY_V3_BASE_URL}${path}${query.size ? `?${query}` : ""}`;
  const method = options.method ?? "GET";
  let response: Response | undefined;

  // Reads can be retried safely. Writes are never retried because that could
  // duplicate a product or order after an interrupted response.
  const attempts = method === "GET" ? RATE_LIMIT_RETRIES : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await fetch(url, {
      method,
      headers: await tinyV3AuthHeaders(),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });

    if (response.status !== 429 || attempt === attempts - 1) break;

    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1_000
      : 750 * 2 ** attempt;
    await response.body?.cancel();
    await wait(delay);
  }

  if (!response) throw new Error(`[Tiny v3] ${method} ${path} sem resposta.`);

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `[Tiny v3] ${options.method ?? "GET"} ${path} → HTTP ${response.status}: ${responseBody.slice(0, 500)}`,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
