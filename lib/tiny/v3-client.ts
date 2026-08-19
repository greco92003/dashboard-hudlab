import { tinyV3AuthHeaders } from "./auth";
import { TINY_V3_BASE_URL } from "./endpoints";
import { tinyRateLimitDelay, tinySuccessfulWriteDelay } from "./rate-limit";

type TinyV3RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  params?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

const RATE_LIMIT_RETRIES = 5;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
let writeQueue: Promise<void> = Promise.resolve();
let nextWriteAt = 0;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isWrite(method: TinyV3RequestOptions["method"] | "GET") {
  return method === "POST" || method === "PUT" || method === "DELETE";
}

async function scheduledWrite(request: () => Promise<Response>) {
  const previous = writeQueue.catch(() => undefined);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  writeQueue = previous.then(() => gate);
  await previous;

  const queueDelay = Math.max(0, nextWriteAt - Date.now());
  if (queueDelay > 0) await wait(queueDelay);

  try {
    const response = await request();
    const delay = response.status === 429
      ? tinyRateLimitDelay(response.headers, 0)
      : tinySuccessfulWriteDelay(response.headers);
    nextWriteAt = Date.now() + delay;
    return response;
  } catch (error) {
    nextWriteAt = Date.now() + tinySuccessfulWriteDelay(new Headers());
    throw error;
  } finally {
    release();
  }
}

export async function tinyV3Request<T>(
  path: string,
  options: TinyV3RequestOptions = {},
): Promise<T> {
  const query = new URLSearchParams(options.params ?? {});
  const url = `${TINY_V3_BASE_URL}${path}${query.size ? `?${query}` : ""}`;
  const method = options.method ?? "GET";
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  let response: Response | undefined;

  // Every request may retry an explicit 429 because Tiny rejected it before
  // processing. Network errors and ambiguous write failures are never retried.
  const attempts = RATE_LIMIT_RETRIES;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const execute = async () => fetch(url, {
        method,
        headers: await tinyV3AuthHeaders(),
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      response = isWrite(method)
        ? await scheduledWrite(execute)
        : await execute();
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw new Error(`[Tiny v3] ${method} ${path} excedeu ${Math.round(timeoutMs / 1_000)} segundos.`);
      }
      throw error;
    }

    if (response.status !== 429 || attempt === attempts - 1) break;

    const delay = tinyRateLimitDelay(response.headers, attempt);
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
