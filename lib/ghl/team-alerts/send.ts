import "server-only";

import { lastInboundWhatsappAt } from "@/lib/ghl/negotiation-conversations";
import { escolherVia } from "./rules";
import type { Aviso } from "./text";

// Avisos do time pelo WhatsApp da Hud Lab, no lugar das notificações que se
// perdem entre tantas outras. Quem recebe: os contatos do GHL com a tag
// `avisos_whatsapp` (hoje a Schay e o owner). Com a janela de 24h aberta, vai
// mensagem livre; fechada, vai o modelo de utilidade `aviso_time_hud` pelo
// workflow "Aviso Time | WhatsApp", que lê o resumo do campo "Aviso time".

const GHL_BASE_URL = process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
export const TAG_AVISOS = "avisos_whatsapp";
/** Campo de contato "Aviso time" (contact.aviso_time), o {{2}} do modelo. */
const CAMPO_AVISO_ID = "DphmUw6ehvmCSnNnFI2P";
/**
 * Workflow "Aviso Time | WhatsApp" (sem gatilho, com reentrada): manda o
 * modelo `aviso_time_hud` com {{1}} = primeiro nome e {{2}} = "Aviso time".
 */
const WORKFLOW_AVISO_ID = "4b727f96-9825-4080-bf06-b2ef38788d96";
const CACHE_DESTINOS_MS = 5 * 60 * 1000;

async function ghl<T>(path: string, method: "GET" | "POST" | "PUT", version: string, body?: unknown): Promise<T> {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  if (!token) throw new Error("GHL_PRIVATE_INTEGRATION_TOKEN não configurado");
  const response = await fetch(new URL(path, GHL_BASE_URL), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: version,
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

export interface Destino {
  contactId: string;
  nome: string;
}

let destinosCache: { em: number; lista: Destino[] } | null = null;

/** Contatos com a tag `avisos_whatsapp`, filtrados na origem (busca do GHL por tag). */
export async function destinosDoAviso(): Promise<Destino[]> {
  if (destinosCache && Date.now() - destinosCache.em < CACHE_DESTINOS_MS) return destinosCache.lista;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!locationId) throw new Error("GHL_LOCATION_ID não configurado");
  const data = await ghl<{ contacts?: Array<{ id: string; firstName?: string; contactName?: string }> }>(
    "/contacts/search",
    "POST",
    "2021-07-28",
    { locationId, pageLimit: 20, filters: [{ field: "tags", operator: "contains", value: TAG_AVISOS }] },
  );
  const lista = (data.contacts ?? []).map((c) => ({ contactId: c.id, nome: c.firstName || c.contactName || "time" }));
  destinosCache = { em: Date.now(), lista };
  return lista;
}

export interface ResultadoDoAviso {
  contactId: string;
  via: ReturnType<typeof escolherVia> | "falhou";
  erro?: string;
}

async function avisarUm(destino: Destino, aviso: Aviso): Promise<ResultadoDoAviso> {
  const { contactId } = destino;
  try {
    const via = escolherVia(await lastInboundWhatsappAt(contactId), Date.now(), Boolean(WORKFLOW_AVISO_ID));
    if (via === "livre") {
      await ghl("/conversations/messages", "POST", "2021-04-15", { type: "WhatsApp", contactId, message: aviso.texto });
    } else if (via === "modelo") {
      await ghl(`/contacts/${contactId}`, "PUT", "2021-07-28", {
        customFields: [{ id: CAMPO_AVISO_ID, field_value: aviso.linha }],
      });
      await ghl(`/contacts/${contactId}/workflow/${WORKFLOW_AVISO_ID}`, "POST", "2021-07-28", {});
    } else {
      console.warn("avisos do time: janela fechada e workflow do modelo não configurado", { contactId });
    }
    return { contactId, via };
  } catch (err) {
    console.error("avisos do time: aviso não enviado", { contactId, err });
    return { contactId, via: "falhou", erro: err instanceof Error ? err.message : String(err) };
  }
}

/** Manda o aviso a todos os destinos, um de cada vez. Nunca lança. */
export async function avisarTime(aviso: Aviso): Promise<ResultadoDoAviso[]> {
  let destinos: Destino[];
  try {
    destinos = await destinosDoAviso();
  } catch (err) {
    console.error("avisos do time: destinos não lidos", err);
    return [];
  }
  const resultados: ResultadoDoAviso[] = [];
  for (const destino of destinos) resultados.push(await avisarUm(destino, aviso));
  return resultados;
}
