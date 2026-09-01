/**
 * GoHighLevel (GHL) API client for the canonical deals cache.
 *
 * Fetches opportunities from the GHL API 2.0 (services.leadconnectorhq.com)
 * and maps them to the same flat "Deal" shape served by /api/deals-cache
 * (ActiveCampaign), so the dashboard components can be reused as-is and the
 * two dashboards can be compared side by side during the migration.
 *
 * Auth: Private Integration Token (PIT) + Location ID from env.
 * Required PIT scopes: opportunities.readonly, contacts.readonly,
 * locations/customFields.readonly.
 */

import {
  buildContactSearchProbes,
  includesPtBrSearch,
} from "@/lib/search/pt-br";
import { normalizeGhlDealStatus } from "@/lib/ghl/pipelines";
import {
  collectGhlCursorSnapshot,
  type GhlCompleteSnapshot,
} from "@/lib/ghl/cursor-pagination";
import { resolveGhlClosingDate } from "@/lib/ghl/closing-date";

const GHL_BASE_URL =
  process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
const GHL_API_VERSION = process.env.GHL_API_VERSION || "2021-07-28";
const GHL_TOKEN = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;

// Same flat shape returned by /api/deals-cache (deals_cache table) so the
// dashboard charts work without changes. `value` is stored multiplied by 100
// because the frontend divides by 100 (ActiveCampaign stores cents).
export interface GhlMappedDeal {
  deal_id: string;
  title: string;
  value: number;
  currency: string;
  status: string | null;
  stage_id: string | null;
  pipeline_id: string | null;
  stage_title: string | null;
  closing_date: string | null;
  created_date: string | null;
  custom_field_value: string | null;
  custom_field_id: string | null;
  estado: string | null;
  "quantidade-de-pares": string | null;
  vendedor: string | null;
  designer: string | null;
  contact_id: string | null;
  organization_id: string | null;
  api_updated_at: string | null;
  segmento_de_negocio: string | null;
  intencao_de_compra: string | null;
  data_embarque: string | null;
  /** Campo "Tipo do Pedido" do GHL: Evento | Amostra | Pedido | Reposição. */
  tipo_pedido: string | null;
  assigned_to: string | null;
  "utm-source": string | null;
  "utm-medium": string | null;
  [key: string]: string | number | null | undefined;
}

export interface GhlCustomFieldDef {
  id: string;
  name: string;
  fieldKey: string;
  model: string;
  dataType: string;
  picklistOptions?: Array<
    | string
    | {
        id: string;
        label: string;
        prefillValue?: string;
      }
  >;
  isMultiFileAllowed?: boolean;
  maxFileLimit?: number;
}

export interface GhlContactSummary {
  id: string;
  contactName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  dateAdded?: string | null;
  dateUpdated?: string | null;
}

export interface GhlContactDetail extends GhlContactSummary {
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  customFields?: Array<{ id: string; value: unknown }>;
}

export interface GhlOpportunity {
  id: string;
  name: string;
  monetaryValue: number | null;
  pipelineId: string | null;
  pipelineStageId: string | null;
  status: string | null;
  source: string | null;
  lastStatusChangeAt: string | null;
  lastStageChangeAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  contactId: string | null;
  assignedTo?: string | null;
  customFields?: Array<Record<string, unknown> & { id: string }>;
  contact?: {
    id: string;
    name: string | null;
    companyName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}

export interface GhlPipeline {
  id: string;
  name: string;
  stages?: Array<{ id: string; name: string; position?: number }>;
}

export type GhlOpportunityUpdate = {
  monetaryValue?: number;
  /** Avança o negócio de etapa. Usado pelo botão Concluir da /producao. */
  pipelineStageId?: string;
  pipelineId?: string;
  customFields?: Array<{
    id: string;
    fieldValue: unknown;
  }>;
};

export type GhlUploadedFile = {
  deleted: false;
  url: string;
  meta: {
    fieldname?: string;
    originalname?: string;
    name?: string;
    encoding?: string;
    mimetype: string;
    size: number;
    url: string;
  };
};
function requireEnv(): { token: string; locationId: string } {
  if (!GHL_TOKEN || !GHL_LOCATION_ID) {
    throw new Error(
      "GHL credentials missing: set GHL_PRIVATE_INTEGRATION_TOKEN and GHL_LOCATION_ID in the environment",
    );
  }
  return { token: GHL_TOKEN, locationId: GHL_LOCATION_ID };
}

async function ghlFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const { token } = requireEnv();
  const url = new URL(path, GHL_BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  // Honor the provider's backoff signal and retry transient failures. All
  // mutations happen after the complete snapshot, so a final error is safe.
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_API_VERSION,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(1_000, retryAfterSeconds * 1_000)
        : 1_000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `GHL API error ${response.status} on ${url.pathname}: ${body.slice(0, 300)}`,
      );
    }

    return (await response.json()) as T;
  }

  throw new Error(`GHL API rate limited on ${url.pathname}`);
}

async function ghlV3JsonRequest<T>(
  path: string,
  method: "PUT" | "POST",
  body: unknown,
): Promise<T> {
  const { token } = requireEnv();
  const url = new URL(path, GHL_BASE_URL);
  const maximumAttempts = method === "PUT" ? 3 : 1;

  for (let attempt = 0; attempt < maximumAttempts; attempt++) {
    const response = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "v3",
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (
      (response.status === 429 || response.status >= 500) &&
      attempt < maximumAttempts - 1
    ) {
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(1_000, retryAfterSeconds * 1_000)
        : 1_000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`GHL API error ${response.status} on ${url.pathname}: ${responseBody.slice(0, 500)}`);
    }

    return (await response.json()) as T;
  }

  throw new Error(`GHL API request failed on ${url.pathname}`);
}

export async function fetchGhlPipelines(): Promise<GhlPipeline[]> {
  const { locationId } = requireEnv();
  const data = await ghlFetch<{ pipelines?: GhlPipeline[] }>(
    "/opportunities/pipelines",
    { locationId },
  );
  return data.pipelines ?? [];
}

export async function searchGhlOpportunitiesByStage(
  pipelineId: string,
  pipelineStageId: string,
  status: "open" | "won" = "open",
): Promise<GhlOpportunity[]> {
  const { locationId } = requireEnv();
  const data = await ghlFetch<{
    opportunities?: GhlOpportunity[];
    meta?: { total?: number };
  }>("/opportunities/search", {
    location_id: locationId,
    pipeline_id: pipelineId,
    pipeline_stage_id: pipelineStageId,
    status,
    limit: "100",
  });

  const opportunities = data.opportunities ?? [];
  if ((data.meta?.total ?? opportunities.length) > opportunities.length) {
    throw new Error(
      "GHL returned more than 100 opportunities for the order registration stage",
    );
  }
  return opportunities;
}

/**
 * Id da etapa `stageName` dentro de `pipelineId`. Resolvido no ar em vez de
 * fixado no código porque as etapas são criadas e reordenadas no CRM — o board
 * inteiro já se orienta por título de etapa pelo mesmo motivo.
 */
export async function findStageIdByName(
  pipelineId: string,
  stageName: string,
): Promise<string | null> {
  const alvo = stageName.trim().toLowerCase();
  const pipelines = await fetchGhlPipelines();
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  if (!pipeline) return null;
  const stage = (pipeline.stages || []).find(
    (s) => s.name.trim().toLowerCase() === alvo,
  );
  return stage?.id ?? null;
}

export async function updateGhlOpportunity(
  opportunityId: string,
  update: GhlOpportunityUpdate,
): Promise<GhlOpportunity> {
  const data = await ghlV3JsonRequest<{ opportunity: GhlOpportunity }>(
    `/opportunities/${opportunityId}`,
    "PUT",
    update,
  );
  return data.opportunity;
}

export async function uploadGhlCustomFieldFiles(
  customFieldId: string,
  files: File[],
): Promise<GhlUploadedFile[]> {
  if (files.length === 0) return [];

  const { token, locationId } = requireEnv();
  const formData = new FormData();
  formData.set("id", customFieldId);
  formData.set("maxFiles", String(files.length));
  for (const file of files) formData.append("file", file, file.name);

  const url = new URL(
    `/locations/${locationId}/customFields/upload`,
    GHL_BASE_URL,
  );
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "v3",
      Accept: "application/json",
    },
    body: formData,
    cache: "no-store",
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`GHL API error ${response.status} on ${url.pathname}: ${responseBody.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    uploadedFiles?: Record<string, string>;
    meta?: Array<{
      fieldname?: string;
      originalname?: string;
      encoding?: string;
      mimetype?: string;
      size?: number;
      url?: string;
    }>;
  };
  const metadata = data.meta ?? [];
  const uploadedEntries = Object.entries(data.uploadedFiles ?? {});
  const resultCount = Math.max(metadata.length, uploadedEntries.length);

  return Array.from({ length: resultCount }, (_, index) => {
    const item = metadata[index] ?? {};
    const uploadedEntry = uploadedEntries[index];
    const urlValue = item.url || uploadedEntry?.[1];
    if (!urlValue) {
      throw new Error("GHL file upload did not return a URL");
    }
    const originalname =
      item.originalname || uploadedEntry?.[0] || files[index]?.name;
    return {
      deleted: false,
      url: urlValue,
      meta: {
        fieldname: item.fieldname,
        originalname,
        name: originalname,
        encoding: item.encoding,
        mimetype:
          item.mimetype || files[index]?.type || "application/octet-stream",
        size: item.size ?? files[index]?.size ?? 0,
        url: urlValue,
      },
    };
  });
}
/** Convert a UTC ISO timestamp to a YYYY-MM-DD date string in Brazil (UTC-3). */
function toBrazilDateString(isoTimestamp: string): string | null {
  const time = Date.parse(isoTimestamp);
  if (isNaN(time)) return null;
  return new Date(time - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Normalize a date value coming from a GHL TEXT custom field to YYYY-MM-DD.
 * Accepts ISO (with or without time), DD/MM/YYYY and epoch timestamps.
 */
export function normalizeGhlDateString(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const brFormat = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brFormat) {
    const [, day, month, year] = brFormat;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  if (/^\d{10}$/.test(value)) {
    return new Date(parseInt(value) * 1000).toISOString().slice(0, 10);
  }
  if (/^\d{13}$/.test(value)) {
    return new Date(parseInt(value)).toISOString().slice(0, 10);
  }

  const parsed = Date.parse(value);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  return null;
}

/** Extract the value of an opportunity customFields entry (fieldValueString, fieldValueNumber, ...). */
export function extractOpportunityFieldValue(
  entry: Record<string, unknown>,
): string | null {
  for (const [key, value] of Object.entries(entry)) {
    if (!key.startsWith("fieldValue")) continue;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }
  return null;
}

export async function fetchCustomFieldDefs(
  model: "opportunity" | "contact",
): Promise<GhlCustomFieldDef[]> {
  const { locationId } = requireEnv();
  const data = await ghlFetch<{ customFields: GhlCustomFieldDef[] }>(
    `/locations/${locationId}/customFields`,
    { model },
  );
  return data.customFields || [];
}

/**
 * Live single-opportunity lookup (as opposed to the daily-synced
 * `ghl_opportunities` table) — used where a request needs the current
 * stage/value/custom fields at click-time rather than up to a day stale.
 */
export async function fetchOpportunityById(
  opportunityId: string,
): Promise<GhlOpportunity> {
  const data = await ghlFetch<{ opportunity: GhlOpportunity }>(
    `/opportunities/${opportunityId}`,
  );
  return data.opportunity;
}

export async function fetchGhlContactById(
  contactId: string,
): Promise<GhlContactDetail> {
  const data = await ghlFetch<{ contact: GhlContactDetail }>(
    `/contacts/${contactId}`,
  );
  return data.contact;
}

export async function searchGhlContacts(
  query: string,
  limit = 20,
): Promise<GhlContactSummary[]> {
  const { locationId } = requireEnv();
  const maximum = Math.min(Math.max(limit, 1), 100);
  const probes = buildContactSearchProbes(query);
  const searchProbe = (probe: string, probeLimit: number) =>
    ghlFetch<{ contacts?: GhlContactSummary[] }>("/contacts/", {
        locationId,
        query: probe,
        limit: String(probeLimit),
      });

  const direct = await searchProbe(probes[0], maximum);

  const matchesQuery = (contact: GhlContactSummary) => {
    const searchable = [
      contact.contactName,
      contact.firstName,
      contact.lastName,
      contact.companyName,
      contact.email,
      contact.phone,
    ]
      .filter(Boolean)
      .join(" ");
    return includesPtBrSearch(searchable, query);
  };

  // Always run every normalized/accented probe. The GHL endpoint is accent-
  // sensitive in both directions: "jose" and "josé" return different sets.
  const fallbackResponses = await Promise.all(
    probes.slice(1).map((probe) => searchProbe(probe, 100)),
  );
  const responses = [direct, ...fallbackResponses];

  const unique = new Map<string, GhlContactSummary>();
  for (const contact of responses.flatMap((response) => response.contacts ?? [])) {
    if (matchesQuery(contact)) unique.set(contact.id, contact);
  }

  return Array.from(unique.values())
    .sort((a, b) => {
      const aName = a.contactName || `${a.firstName ?? ""} ${a.lastName ?? ""}`;
      const bName = b.contactName || `${b.firstName ?? ""} ${b.lastName ?? ""}`;
      return aName.localeCompare(bName, "pt-BR", { sensitivity: "base" });
    })
    .slice(0, maximum);
}

export async function searchGhlOpportunitiesByName(
  query: string,
  limit = 20,
): Promise<GhlOpportunity[]> {
  const { locationId } = requireEnv();
  const maximum = Math.min(Math.max(limit, 1), 100);
  const probes = buildContactSearchProbes(query);
  const responses = await Promise.all(
    probes.map((probe) =>
      ghlFetch<{ opportunities?: GhlOpportunity[] }>("/opportunities/search", {
        location_id: locationId,
        q: probe,
        status: "all",
        limit: "100",
      }),
    ),
  );

  const unique = new Map<string, GhlOpportunity>();
  for (const opportunity of responses.flatMap(
    (response) => response.opportunities ?? [],
  )) {
    if (includesPtBrSearch(opportunity.name ?? "", query)) {
      unique.set(opportunity.id, opportunity);
    }
  }

  return Array.from(unique.values())
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, maximum);
}

export async function searchGhlOpportunitiesByContact(
  contactId: string,
): Promise<GhlOpportunity[]> {
  const { locationId } = requireEnv();
  const data = await ghlFetch<{ opportunities?: GhlOpportunity[] }>(
    "/opportunities/search",
    {
      location_id: locationId,
      contact_id: contactId,
      limit: "100",
    },
  );
  return data.opportunities ?? [];
}

async function fetchStageTitles(): Promise<Map<string, string>> {
  const { locationId } = requireEnv();
  const result = await ghlFetch<{
    pipelines?: Array<{
      id: string;
      stages?: Array<{ id: string; name: string }>;
    }>;
  }>("/opportunities/pipelines", { locationId });
  const titles = new Map<string, string>();
  for (const pipeline of result.pipelines || []) {
    for (const stage of pipeline.stages || []) titles.set(stage.id, stage.name);
  }
  return titles;
}

async function fetchOpportunities(
  status: "all" | "won",
): Promise<GhlCompleteSnapshot<GhlOpportunity>> {
  const { locationId } = requireEnv();
  const limit = 100;
  return collectGhlCursorSnapshot({
    fetchPage: async (cursor) => {
      const data = await ghlFetch<{
        opportunities?: GhlOpportunity[];
        meta?: { total?: number; nextPageUrl?: string | null };
      }>("/opportunities/search", {
        location_id: locationId,
        limit: String(limit),
        status,
        ...(cursor || { page: "1" }),
      });
      return {
        items: data.opportunities || [],
        total: data.meta?.total ?? -1,
        nextPageUrl: data.meta?.nextPageUrl ?? null,
      };
    },
  });
}

async function fetchContactCustomFields(
  contactId: string,
): Promise<Array<{ id: string; value: unknown }>> {
  const data = await ghlFetch<{
    contact: { customFields?: Array<{ id: string; value: unknown }> };
  }>(`/contacts/${contactId}`);
  return data.contact?.customFields || [];
}

/**
 * Field keys (suffix of fieldKey, without the "opportunity."/"contact." prefix)
 * mapped to the flat Deal columns used by the dashboard. These fields were
 * created in GHL to mirror the ActiveCampaign custom fields.
 */
const OPPORTUNITY_FIELD_MAP: Record<string, keyof GhlMappedDeal> = {
  data_de_fechamento: "custom_field_value", // AC field 5 "Data Fechamento"
  estado: "estado", // AC field 25
  nmero_quantidade_de_pares: "quantidade-de-pares", // AC field 39
  quantidade_de_pares: "quantidade-de-pares",
  vendedor: "vendedor", // AC field 45
  designer_responsvel: "designer", // AC field 47
  segmento_do_negcio: "segmento_de_negocio",
  inteno_de_compra_negcio: "intencao_de_compra",
  data_de_embarque: "data_embarque",
  tipo_do_pedido: "tipo_pedido",
  utm_source_negcio: "utm-source",
  utm_medium_negcio: "utm-medium",
};

const CONTACT_FIELD_MAP: Record<string, keyof GhlMappedDeal> = {
  inteno_de_compra: "intencao_de_compra",
  utm_source: "utm-source",
  utm_medium: "utm-medium",
  segmento_de_negcio: "segmento_de_negocio",
  estado: "estado",
};

function stripModelPrefix(fieldKey: string): string {
  const dotIndex = fieldKey.indexOf(".");
  return dotIndex >= 0 ? fieldKey.slice(dotIndex + 1) : fieldKey;
}

export function mapOpportunity(
  opp: GhlOpportunity,
  oppFieldDefsById: Map<string, GhlCustomFieldDef>,
  stageTitlesById: Map<string, string> = new Map(),
): GhlMappedDeal {
  const deal: GhlMappedDeal = {
    deal_id: opp.id,
    title: opp.name || "",
    // Frontend divides by 100 (AC stores cents), so multiply here
    value: Math.round((opp.monetaryValue || 0) * 100),
    currency: "BRL",
    status: normalizeGhlDealStatus(
      opp.pipelineId,
      opp.pipelineStageId,
      opp.status,
      opp.monetaryValue,
    ),
    stage_id: opp.pipelineStageId || null,
    pipeline_id: opp.pipelineId || null,
    stage_title: opp.pipelineStageId
      ? stageTitlesById.get(opp.pipelineStageId) || null
      : null,
    closing_date: null,
    created_date: opp.createdAt || null,
    custom_field_value: null,
    custom_field_id: null,
    estado: null,
    "quantidade-de-pares": null,
    vendedor: null,
    designer: null,
    contact_id: opp.contactId || null,
    organization_id: null,
    api_updated_at: opp.updatedAt || null,
    segmento_de_negocio: null,
    intencao_de_compra: null,
    data_embarque: null,
    tipo_pedido: null,
    assigned_to: opp.assignedTo || null,
    "utm-source": null,
    "utm-medium": null,
    ghl_source: opp.source || null,
    ghl_last_status_change_at: opp.lastStatusChangeAt || null,
  };

  for (const entry of opp.customFields || []) {
    const def = oppFieldDefsById.get(entry.id);
    if (!def) continue;
    const value = extractOpportunityFieldValue(entry);
    if (value === null) continue;

    const keySuffix = stripModelPrefix(def.fieldKey);
    // Expose every GHL field flat on the deal (prefixed to avoid collisions)
    deal[`ghl_${keySuffix}`] = value;

    const mappedKey = OPPORTUNITY_FIELD_MAP[keySuffix];
    if (mappedKey) {
      // Campos do CRM são digitados à mão; espaço nas pontas vira grupo
      // duplicado no board (" 17/08/2026" != "17/08/2026").
      deal[mappedKey] = typeof value === "string" ? value.trim() : value;
    }
  }

  // For won deals, the actual GHL status transition is canonical. The custom
  // field is retained below for audit/display but can contain stale CRM dates.
  const closingFromField = normalizeGhlDateString(
    deal.custom_field_value as string | null,
  );
  const normalizedStatus = normalizeGhlDealStatus(
    opp.pipelineId,
    opp.pipelineStageId,
    opp.status,
    opp.monetaryValue,
  );
  const closingFromStatus =
    normalizedStatus === "won" && opp.lastStatusChangeAt
      ? toBrazilDateString(opp.lastStatusChangeAt)
      : null;

  deal.closing_date = resolveGhlClosingDate({
    normalizedStatus,
    statusChangeDate: closingFromStatus,
    customFieldDate: closingFromField,
  });
  deal.custom_field_value = closingFromField;

  return deal;
}

async function enrichWithContactFields(
  deals: GhlMappedDeal[],
  contactFieldDefsById: Map<string, GhlCustomFieldDef>,
): Promise<void> {
  // Only enrich won deals (the dashboard only uses won) to keep API usage low
  const contactIds = Array.from(
    new Set(
      deals
        .filter((d) => d.status === "won" && d.contact_id)
        .map((d) => d.contact_id as string),
    ),
  ).slice(0, 500);

  const contactFieldsById = new Map<string, Map<string, string>>();

  // Batches of 8 to stay under the PIT burst limit (100 req / 10s)
  const batchSize = 8;
  for (let i = 0; i < contactIds.length; i += batchSize) {
    const batch = contactIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (contactId) => {
        const fields = await fetchContactCustomFields(contactId);
        const byKey = new Map<string, string>();
        for (const field of fields) {
          const def = contactFieldDefsById.get(field.id);
          if (!def || field.value === null || field.value === undefined)
            continue;
          byKey.set(stripModelPrefix(def.fieldKey), String(field.value));
        }
        contactFieldsById.set(contactId, byKey);
      }),
    );
    results
      .filter((r) => r.status === "rejected")
      .forEach((r) =>
        console.error(
          "GHL: contact fetch failed:",
          (r as PromiseRejectedResult).reason,
        ),
      );
    if (i + batchSize < contactIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  for (const deal of deals) {
    if (!deal.contact_id) continue;
    const contactFields = contactFieldsById.get(deal.contact_id);
    if (!contactFields) continue;

    for (const [keySuffix, mappedKey] of Object.entries(CONTACT_FIELD_MAP)) {
      const value = contactFields.get(keySuffix);
      // Contact fields only fill gaps; opportunity fields take precedence
      if (value && !deal[mappedKey]) {
        deal[mappedKey] = value;
      }
    }
  }
}

export interface GhlDealsResult {
  deals: GhlMappedDeal[];
  fetchedAt: string;
  totalOpportunities: number;
  pages: number;
  duplicates: number;
  snapshotComplete: true;
}

let dealsCache: { result: GhlDealsResult; timestamp: number } | null = null;
let inflightFetch: Promise<GhlDealsResult> | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchAndMapAllDeals(): Promise<GhlDealsResult> {
  const [oppDefs, snapshot, stageTitlesById] = await Promise.all([
    fetchCustomFieldDefs("opportunity"),
    fetchOpportunities("all"),
    fetchStageTitles(),
  ]);

  const oppDefsById = new Map(oppDefs.map((d) => [d.id, d]));

  const deals = snapshot.items.map((opp) =>
    mapOpportunity(opp, oppDefsById, stageTitlesById),
  );

  return {
    deals,
    fetchedAt: new Date().toISOString(),
    totalOpportunities: snapshot.expectedTotal,
    pages: snapshot.pages,
    duplicates: snapshot.duplicates,
    snapshotComplete: snapshot.complete,
  };
}

async function fetchAndMapWonDeals(): Promise<GhlDealsResult> {
  const [oppDefs, snapshot, stageTitlesById] = await Promise.all([
    fetchCustomFieldDefs("opportunity"),
    fetchOpportunities("won"),
    fetchStageTitles(),
  ]);
  const oppDefsById = new Map(oppDefs.map((definition) => [definition.id, definition]));
  return {
    deals: snapshot.items.map((opportunity) =>
      mapOpportunity(opportunity, oppDefsById, stageTitlesById),
    ),
    fetchedAt: new Date().toISOString(),
    totalOpportunities: snapshot.expectedTotal,
    pages: snapshot.pages,
    duplicates: snapshot.duplicates,
    snapshotComplete: snapshot.complete,
  };
}

export async function getGhlDeal(dealId: string): Promise<GhlMappedDeal> {
  const [result, definitions, stageTitles] = await Promise.all([
    ghlFetch<{ opportunity?: GhlOpportunity }>(`/opportunities/${dealId}`),
    fetchCustomFieldDefs("opportunity"),
    fetchStageTitles(),
  ]);
  if (!result.opportunity) throw new Error(`GHL opportunity ${dealId} not found`);
  return mapOpportunity(
    result.opportunity,
    new Map(definitions.map((definition) => [definition.id, definition])),
    stageTitles,
  );
}

/**
 * Get all GHL opportunities mapped to the dashboard Deal shape, with a
 * 5-minute in-memory cache shared across API routes. Pass refresh=true to
 * bypass the cache.
 */
export async function getGhlDeals(refresh = false): Promise<GhlDealsResult> {
  const now = Date.now();
  if (!refresh && dealsCache && now - dealsCache.timestamp < CACHE_TTL_MS) {
    return dealsCache.result;
  }

  if (!inflightFetch) {
    inflightFetch = fetchAndMapAllDeals()
      .then((result) => {
        dealsCache = { result, timestamp: Date.now() };
        return result;
      })
      .finally(() => {
        inflightFetch = null;
      });
  }

  return inflightFetch;
}

/** Lightweight reconciliation for newly won opportunities. */
export function getGhlWonDeals(): Promise<GhlDealsResult> {
  return fetchAndMapWonDeals();
}

/** Filter deals whose closing_date (YYYY-MM-DD) falls within [start, end]. */
export function filterDealsByClosingDate(
  deals: GhlMappedDeal[],
  startDate: string,
  endDate: string,
): GhlMappedDeal[] {
  return deals.filter(
    (deal) =>
      deal.closing_date &&
      deal.closing_date >= startDate &&
      deal.closing_date <= endDate,
  );
}
