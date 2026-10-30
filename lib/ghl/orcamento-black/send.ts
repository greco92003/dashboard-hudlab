import "server-only";

import { freteDoCampo, orcamentoBlack, paresDoCampo, type OrcamentoBlack } from "./calc";

// Lê a quantidade e o frete que o Orçamento Automático 03 gravou no contato e
// grava o orçamento Black: os campos "Black …", o texto pronto da mensagem e
// os campos do orçamento normal (valor do par, subtotal e total), que o card e
// o "Preencheu Orçamento > Atualiza Valor do Negócio" já usam.

const GHL_BASE_URL = process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";

/** Campos de contato (IDs do GHL). */
export const CAMPOS = {
  qntdPares: "APXFcsShy3vQ3YX6lvyd",
  frete: "RFntWWslwNzkGGVJExCC",
  valorUnitarioDoPar: "TRBawWiHzT2ABAG3kcam",
  orcamentoSubtotal: "Kt2npElalasCf4ltKFSQ",
  orcamentoTotalComFrete: "b1wqJVGzZSqBv4dITtqn",
  blackParTabela: "PWQkaGGNcg57ZIVE7HPM",
  blackParCartao: "yq9TI3W19TMZ6QNx4NM2",
  blackParPix: "G9Hq7zfOQzdt3VNS0TAG",
  blackPctCartao: "sElZHgJMvYLjaDCI2XqV",
  blackPctPix: "7xbIzGuPeJ9xRxgZnt7P",
  blackSubtotalCheio: "5XPYmnnQsZocloGNqNCv",
  blackSubtotalCartao: "8jie5nVd5bgqG81Fwfv1",
  blackSubtotalPix: "1n3X63D5wd1mI92lCxLz",
  blackTotalCheio: "4Kzqp4595CdYCur2IZYp",
  blackTotalCartao: "2uCQDPAhj15WGiw3gWt0",
  blackTotalPix: "wdsd0Uz3nRylYvHXM2dQ",
  blackBonus: "2cs5zNZNZyfiGlaZUPz7",
  /** Texto longo com o bloco da mensagem (contact.black_oramento_texto). */
  blackOrcamentoTexto: "97pnMfnWEWG1SicFsdDh",
} as const;

async function ghl<T>(path: string, method: "GET" | "PUT", body?: unknown): Promise<T> {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  if (!token) throw new Error("GHL_PRIVATE_INTEGRATION_TOKEN não configurado");
  const response = await fetch(new URL(path, GHL_BASE_URL), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`GHL ${response.status} em ${method} ${path}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Campos que o webhook grava, na forma do PUT /contacts. */
export function camposDoOrcamento(o: OrcamentoBlack, paresGravados: number | null) {
  const campos: Array<{ id: string; field_value: string | number }> = [
    { id: CAMPOS.blackParTabela, field_value: o.parTabela },
    { id: CAMPOS.blackParCartao, field_value: o.parCartao },
    { id: CAMPOS.blackParPix, field_value: o.parPix },
    { id: CAMPOS.blackPctCartao, field_value: o.pctCartao },
    { id: CAMPOS.blackPctPix, field_value: o.pctPix },
    { id: CAMPOS.blackSubtotalCheio, field_value: o.subtotalCheio },
    { id: CAMPOS.blackSubtotalCartao, field_value: o.subtotalCartao },
    { id: CAMPOS.blackSubtotalPix, field_value: o.subtotalPix },
    { id: CAMPOS.blackTotalCheio, field_value: o.totalCheio },
    { id: CAMPOS.blackTotalCartao, field_value: o.totalCartao },
    { id: CAMPOS.blackTotalPix, field_value: o.totalPix },
    { id: CAMPOS.blackBonus, field_value: o.bonus },
    { id: CAMPOS.blackOrcamentoTexto, field_value: o.texto },
    { id: CAMPOS.valorUnitarioDoPar, field_value: o.parCartao },
    { id: CAMPOS.orcamentoSubtotal, field_value: o.subtotalCartao },
    { id: CAMPOS.orcamentoTotalComFrete, field_value: o.totalCartao },
  ];
  // Abaixo de 12 o orçamento sai com 12; o campo acompanha, como no fluxo normal.
  if (paresGravados !== o.pares) campos.push({ id: CAMPOS.qntdPares, field_value: o.pares });
  return campos;
}

export type ResultadoOrcamento =
  | { ok: true; orcamento: OrcamentoBlack; gravado: boolean }
  | { ok: false; motivo: "sem_quantidade"; pares: unknown };

/** Calcula o orçamento Black do contato e, fora do teste, grava no GHL. */
export async function orcamentoBlackDoContato(contactId: string, opts: { dryRun?: boolean } = {}): Promise<ResultadoOrcamento> {
  const { contact } = await ghl<{ contact?: { customFields?: Array<{ id: string; value?: unknown }> } }>(
    `/contacts/${contactId}`,
    "GET",
  );
  const valor = (id: string) => contact?.customFields?.find((f) => f.id === id)?.value;
  const pares = paresDoCampo(valor(CAMPOS.qntdPares));
  const orcamento = orcamentoBlack(pares, freteDoCampo(valor(CAMPOS.frete)));
  if (!orcamento) return { ok: false, motivo: "sem_quantidade", pares: valor(CAMPOS.qntdPares) };
  if (opts.dryRun) return { ok: true, orcamento, gravado: false };
  await ghl(`/contacts/${contactId}`, "PUT", { customFields: camposDoOrcamento(orcamento, pares) });
  return { ok: true, orcamento, gravado: true };
}
