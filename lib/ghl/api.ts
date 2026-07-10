/**
 * GoHighLevel (GHL) API client for the provisional /dashboard-ghl page.
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
  "utm-source": string | null;
  "utm-medium": string | null;
  [key: string]: string | number | null | undefined;
}

interface GhlCustomFieldDef {
  id: string;
  name: string;
  fieldKey: string;
  model: string;
  dataType: string;
}

interface GhlOpportunity {
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
  customFields?: Array<Record<string, unknown> & { id: string }>;
  contact?: { id: string; name: string | null };
}

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

  // Single retry on rate limit (PIT burst limit: 100 requests / 10s)
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_API_VERSION,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (response.status === 429 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
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
function extractOpportunityFieldValue(
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

async function fetchCustomFieldDefs(
  model: "opportunity" | "contact",
): Promise<GhlCustomFieldDef[]> {
  const { locationId } = requireEnv();
  const data = await ghlFetch<{ customFields: GhlCustomFieldDef[] }>(
    `/locations/${locationId}/customFields`,
    { model },
  );
  return data.customFields || [];
}

async function fetchAllOpportunities(): Promise<GhlOpportunity[]> {
  const { locationId } = requireEnv();
  const all: GhlOpportunity[] = [];
  const limit = 100;
  const maxPages = 50;

  for (let page = 1; page <= maxPages; page++) {
    const data = await ghlFetch<{
      opportunities: GhlOpportunity[];
      meta?: { total?: number; nextPageUrl?: string | null };
    }>("/opportunities/search", {
      location_id: locationId,
      limit: String(limit),
      page: String(page),
    });

    const batch = data.opportunities || [];
    all.push(...batch);

    if (batch.length < limit) break;
  }

  return all;
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
  quantidade_de_pares: "quantidade-de-pares", // AC field 39
  vendedor: "vendedor", // AC field 45
  designer_responsvel: "designer", // AC field 47
  segmento_do_negcio: "segmento_de_negocio",
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

function mapOpportunity(
  opp: GhlOpportunity,
  oppFieldDefsById: Map<string, GhlCustomFieldDef>,
): GhlMappedDeal {
  const deal: GhlMappedDeal = {
    deal_id: opp.id,
    title: opp.name || "",
    // Frontend divides by 100 (AC stores cents), so multiply here
    value: Math.round((opp.monetaryValue || 0) * 100),
    currency: "BRL",
    status: opp.status || null,
    stage_id: opp.pipelineStageId || null,
    pipeline_id: opp.pipelineId || null,
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
      deal[mappedKey] = value;
    }
  }

  // Closing date precedence: "Data de Fechamento" custom field, then the
  // date the opportunity was marked won (lastStatusChangeAt)
  const closingFromField = normalizeGhlDateString(
    deal.custom_field_value as string | null,
  );
  const closingFromStatus =
    opp.status === "won" && opp.lastStatusChangeAt
      ? toBrazilDateString(opp.lastStatusChangeAt)
      : null;

  deal.closing_date = closingFromField || closingFromStatus;
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
}

let dealsCache: { result: GhlDealsResult; timestamp: number } | null = null;
let inflightFetch: Promise<GhlDealsResult> | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchAndMapAllDeals(): Promise<GhlDealsResult> {
  const [oppDefs, contactDefs, opportunities] = await Promise.all([
    fetchCustomFieldDefs("opportunity"),
    fetchCustomFieldDefs("contact"),
    fetchAllOpportunities(),
  ]);

  const oppDefsById = new Map(oppDefs.map((d) => [d.id, d]));
  const contactDefsById = new Map(contactDefs.map((d) => [d.id, d]));

  const deals = opportunities.map((opp) => mapOpportunity(opp, oppDefsById));

  await enrichWithContactFields(deals, contactDefsById);

  return {
    deals,
    fetchedAt: new Date().toISOString(),
    totalOpportunities: opportunities.length,
  };
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
