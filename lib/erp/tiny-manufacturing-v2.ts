import { getTinyV2Token } from "../tiny/auth";
import { tinyV3Request } from "../tiny/v3-client";
import {
  buildTinyV2ManufacturedProduct,
  type TinyManufacturingPair,
} from "./tiny-manufacturing-payload";

const BASE_URL = process.env.TINY_BASE_URL ?? "https://api.tiny.com.br/api2";
const REQUEST_TIMEOUT_MS = 45_000;
const BLOCK_RETRIES = 5;
const BLOCK_RETRY_MS = 65_000;
const BATCH_WINDOW_MS = 60_000;
const MAX_BATCH_CALLS_PER_WINDOW = 5;
const MAX_PRODUCTS_PER_BATCH = 20;

type TinyV2Error = { erro?: string };
type TinyV2Record = {
  sequencia?: number | string;
  status?: string;
  id?: number | string;
  erros?: TinyV2Error[];
};
type TinyV2Response = {
  retorno?: {
    status?: string;
    codigo_erro?: number | string;
    erros?: TinyV2Error[];
    conta?: { cnpj_cpf?: string | null };
    registros?: Array<{ registro?: TinyV2Record }> | { registro?: TinyV2Record };
  };
};

let batchQueue: Promise<void> = Promise.resolve();
let batchHistory: number[] = [];
let accountCheck: Promise<void> | null = null;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function messages(data: TinyV2Response) {
  return (data.retorno?.erros ?? [])
    .map((item) => item.erro?.trim())
    .filter((item): item is string => Boolean(item));
}

function isApiBlocked(response: Response, data: TinyV2Response) {
  return response.status === 429
    || messages(data).some((message) => /api bloqueada|excedido o n[uú]mero de acessos/i.test(message));
}

async function tinyV2Post(path: string, params: Record<string, string>) {
  for (let attempt = 0; attempt < BLOCK_RETRIES; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({
        token: getTinyV2Token(),
        formato: "JSON",
        ...params,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    let data: TinyV2Response;
    try {
      data = JSON.parse(text) as TinyV2Response;
    } catch {
      throw new Error(`Tiny API v2 respondeu HTTP ${response.status} com conteúdo inválido.`);
    }

    if (!isApiBlocked(response, data) || attempt === BLOCK_RETRIES - 1) {
      return { response, data };
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    await wait(Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1_000
      : BLOCK_RETRY_MS);
  }

  throw new Error("O Tiny manteve a API bloqueada após as tentativas automáticas.");
}

async function scheduledBatch<T>(request: () => Promise<T>) {
  const previous = batchQueue.catch(() => undefined);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  batchQueue = previous.then(() => gate);
  await previous;

  while (true) {
    const now = Date.now();
    batchHistory = batchHistory.filter((timestamp) => now - timestamp < BATCH_WINDOW_MS);
    if (batchHistory.length < MAX_BATCH_CALLS_PER_WINDOW) break;
    await wait(Math.max(1_000, batchHistory[0] + BATCH_WINDOW_MS - now + 1_000));
  }

  try {
    return await request();
  } finally {
    batchHistory.push(Date.now());
    release();
  }
}

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

async function assertSameTinyAccount() {
  if (!accountCheck) {
    accountCheck = (async () => {
      const [v3, v2Result] = await Promise.all([
        tinyV3Request<{ cpfCnpj?: string | null }>("/info"),
        tinyV2Post("/info.php", {}),
      ]);
      const v2 = v2Result.data;
      if (!v2Result.response.ok || v2.retorno?.status !== "OK") {
        throw new Error(messages(v2).join("; ") || "Não foi possível validar a conta da API v2 do Tiny.");
      }
      const v3Document = digits(v3.cpfCnpj);
      const v2Document = digits(v2.retorno.conta?.cnpj_cpf);
      if (!v3Document || !v2Document || v3Document !== v2Document) {
        throw new Error("As credenciais das APIs v2 e v3 apontam para contas diferentes do Tiny.");
      }
    })().catch((error) => {
      accountCheck = null;
      throw error;
    });
  }
  return accountCheck;
}

function responseRecords(data: TinyV2Response) {
  const raw = data.retorno?.registros;
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return items.flatMap((item) => item.registro ? [item.registro] : []);
}

export async function setTinyVariationsAsManufactured(
  pairs: TinyManufacturingPair[],
) {
  if (pairs.length === 0) return;

  await assertSameTinyAccount();
  for (let offset = 0; offset < pairs.length; offset += MAX_PRODUCTS_PER_BATCH) {
    const chunk = pairs.slice(offset, offset + MAX_PRODUCTS_PER_BATCH);
    const products = chunk.map((pair, index) =>
      buildTinyV2ManufacturedProduct(pair, index + 1));
    const { response, data } = await scheduledBatch(() => tinyV2Post(
      "/produto.alterar.php",
      { produto: JSON.stringify({ produtos: products }) },
    ));
    const records = responseRecords(data);
    const failedRecords = records.filter((record) => record.status && record.status !== "OK");

    if (!response.ok || data.retorno?.status !== "OK" || failedRecords.length > 0) {
      const recordErrors = failedRecords.flatMap((record) =>
        (record.erros ?? []).flatMap((item) => item.erro ? [item.erro] : []));
      throw new Error(
        [...messages(data), ...recordErrors].join("; ")
          || `Tiny API v2 respondeu HTTP ${response.status} ao cadastrar as variações como Fabricadas.`,
      );
    }
  }
}
