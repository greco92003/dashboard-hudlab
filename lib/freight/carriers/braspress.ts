import { cepDigits } from "../normalize";

// ─── Braspress freight-quotation API adapter ────────────────────────────────
// Docs: POST {BASE}/v1/cotacao/calcular/json  (Basic auth)
// Body: cnpjRemetente, cnpjDestinatario, modal("R"), tipoFrete(1=CIF),
//       cepOrigem, cepDestino, vlrMercadoria, peso, volumes, cubagem[]
// Resp: { id, prazo, totalFrete }

export interface CubagemItem {
  comprimento: number; // metros
  largura: number; // metros
  altura: number; // metros
  volumes: number;
}

export interface BraspressQuoteInput {
  cepOrigem: string;
  cepDestino: string;
  peso: number; // kg
  volumes: number;
  vlrMercadoria: number;
  cubagem: CubagemItem[];
  cnpjDestinatario?: string; // optional override
}

export interface BraspressQuoteResult {
  ok: boolean;
  total?: number;
  prazo?: number;
  id?: number;
  error?: string;
  status?: number;
}

/** Braspress is configured only when user + password are present. */
export function isBraspressEnabled(): boolean {
  return !!(process.env.BRASPRESS_USER && process.env.BRASPRESS_PASSWORD);
}

function basicAuth(): string {
  const user = process.env.BRASPRESS_USER ?? "";
  const pass = process.env.BRASPRESS_PASSWORD ?? "";
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

/**
 * Live freight quote from Braspress. Resilient by design: never throws — returns
 * { ok:false, error } on any failure (timeout, auth, HTTP error) so the caller
 * can simply skip Braspress in the comparison.
 */
export async function quoteBraspress(
  input: BraspressQuoteInput,
): Promise<BraspressQuoteResult> {
  if (!isBraspressEnabled()) return { ok: false, error: "Braspress não configurada" };

  const base = process.env.BRASPRESS_API_URL || "https://api.braspress.com";
  const remetente = Number(cepDigits(process.env.BRASPRESS_CNPJ_REMETENTE ?? ""));
  const destinatario = Number(
    cepDigits(input.cnpjDestinatario || process.env.BRASPRESS_CNPJ_REMETENTE || ""),
  );
  const tipoFrete = process.env.BRASPRESS_TIPO_FRETE || "1";

  const cepOrigem = Number(cepDigits(input.cepOrigem));
  const cepDestino = Number(cepDigits(input.cepDestino));
  if (!cepOrigem || !cepDestino) return { ok: false, error: "CEP de origem/destino inválido" };
  if (!input.cubagem.length) return { ok: false, error: "Sem dimensões (cubagem) para cotar" };

  const payload = {
    cnpjRemetente: remetente,
    cnpjDestinatario: destinatario,
    modal: "R", // sempre rodoviário
    tipoFrete, // 1 = CIF
    cepOrigem,
    cepDestino,
    vlrMercadoria: Number(input.vlrMercadoria.toFixed(2)),
    peso: Number(input.peso.toFixed(3)),
    volumes: input.volumes,
    cubagem: input.cubagem.map((c) => ({
      comprimento: Number(c.comprimento.toFixed(3)),
      largura: Number(c.largura.toFixed(3)),
      altura: Number(c.altura.toFixed(3)),
      volumes: c.volumes,
    })),
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${base}/v1/cotacao/calcular/json`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON body */
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: (json.message as string) || `HTTP ${res.status}`,
      };
    }
    const total = Number(json.totalFrete);
    if (!Number.isFinite(total)) return { ok: false, error: "Resposta sem totalFrete", status: res.status };
    return {
      ok: true,
      total,
      prazo: json.prazo != null ? Number(json.prazo) : undefined,
      id: json.id != null ? Number(json.id) : undefined,
      status: res.status,
    };
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Timeout na Braspress" : "Falha ao consultar Braspress";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(t);
  }
}
