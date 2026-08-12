import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });

const { Client } = pg;
const baseUrl =
  process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
const apiVersion = process.env.GHL_API_VERSION || "2021-07-28";
const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
const locationId = process.env.GHL_LOCATION_ID;

function requireConfiguration() {
  const missing = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!token) missing.push("GHL_PRIVATE_INTEGRATION_TOKEN");
  if (!locationId) missing.push("GHL_LOCATION_ID");
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

async function ghlFetch(path, params = {}) {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Version: apiVersion,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GHL API ${response.status} on ${url.pathname}: ${body.slice(0, 300)}`,
    );
  }
  return response.json();
}

async function fetchAllOpportunities() {
  const opportunities = [];
  const limit = 100;

  let page = 1;
  let startAfter = null;
  let startAfterId = null;

  for (let requestNumber = 1; requestNumber <= 2000; requestNumber += 1) {
    const params = {
      location_id: locationId,
      limit: String(limit),
      ...(startAfter && startAfterId
        ? { startAfter, startAfterId }
        : { page: String(page) }),
    };
    const result = await ghlFetch("/opportunities/search", params);
    const batch = result.opportunities || [];
    opportunities.push(...batch);
    process.stdout.write(
      `\rGHL opportunities fetched: ${opportunities.length}`,
    );
    if (batch.length < limit) break;

    const nextPageUrl = result.meta?.nextPageUrl;
    if (nextPageUrl && opportunities.length >= 10_000) {
      const next = new URL(nextPageUrl);
      startAfter = next.searchParams.get("startAfter");
      startAfterId = next.searchParams.get("startAfterId");
      if (!startAfter || !startAfterId) {
        throw new Error("GHL cursor pagination metadata is incomplete");
      }
    } else {
      page += 1;
    }

    if (requestNumber === 2000) {
      throw new Error("GHL pagination safety limit reached");
    }
  }
  process.stdout.write("\n");
  return opportunities;
}

function normalizedStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "1" || value === "won") return "won";
  if (value === "0" || value === "open") return "open";
  if (value === "2" || value === "lost") return "lost";
  return value || "unknown";
}

function money(value) {
  return Number(value || 0);
}

function titleKey(title) {
  return String(title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function summarize(rows, valueInCents) {
  const summary = {};
  for (const row of rows) {
    const status = normalizedStatus(row.status);
    summary[status] ||= { count: 0, value: 0 };
    summary[status].count += 1;
    summary[status].value += valueInCents
      ? money(row.value) / 100
      : money(row.monetaryValue);
  }
  for (const value of Object.values(summary)) {
    value.value = Math.round(value.value * 100) / 100;
  }
  return summary;
}

function compareWonDeals(cacheDeals, ghlDeals) {
  const cacheWon = cacheDeals.filter((deal) => normalizedStatus(deal.status) === "won");
  const ghlWon = ghlDeals.filter((deal) => normalizedStatus(deal.status) === "won");
  const cacheByTitle = new Map();
  const ghlByTitle = new Map();

  for (const deal of cacheWon) {
    const key = titleKey(deal.title);
    const list = cacheByTitle.get(key) || [];
    list.push(deal);
    cacheByTitle.set(key, list);
  }
  for (const deal of ghlWon) {
    const key = titleKey(deal.name);
    const list = ghlByTitle.get(key) || [];
    list.push(deal);
    ghlByTitle.set(key, list);
  }

  let exactUniqueMatches = 0;
  const valueMismatches = [];
  const missingInGhl = [];
  const missingInCache = [];
  const ambiguousTitles = [];

  for (const [key, cacheMatches] of cacheByTitle) {
    const ghlMatches = ghlByTitle.get(key) || [];
    if (cacheMatches.length === 1 && ghlMatches.length === 1) {
      exactUniqueMatches += 1;
      const cacheValue = money(cacheMatches[0].value) / 100;
      const ghlValue = money(ghlMatches[0].monetaryValue);
      if (Math.abs(cacheValue - ghlValue) > 0.009) {
        valueMismatches.push({
          title: cacheMatches[0].title,
          cacheDealId: cacheMatches[0].deal_id,
          ghlDealId: ghlMatches[0].id,
          cacheValue,
          ghlValue,
          difference: Math.round((ghlValue - cacheValue) * 100) / 100,
        });
      }
    } else if (ghlMatches.length === 0) {
      missingInGhl.push(
        ...cacheMatches.map((deal) => ({
          dealId: deal.deal_id,
          title: deal.title,
          value: money(deal.value) / 100,
        })),
      );
    } else {
      ambiguousTitles.push({
        title: cacheMatches[0]?.title || ghlMatches[0]?.name,
        cacheCount: cacheMatches.length,
        ghlCount: ghlMatches.length,
      });
    }
  }

  for (const [key, ghlMatches] of ghlByTitle) {
    if (!cacheByTitle.has(key)) {
      missingInCache.push(
        ...ghlMatches.map((deal) => ({
          dealId: deal.id,
          title: deal.name,
          value: money(deal.monetaryValue),
        })),
      );
    }
  }

  return {
    exactUniqueMatches,
    valueMismatchCount: valueMismatches.length,
    missingInGhlCount: missingInGhl.length,
    missingInCacheCount: missingInCache.length,
    ambiguousTitleCount: ambiguousTitles.length,
    valueMismatches: valueMismatches.slice(0, 10),
    missingInGhl: missingInGhl.slice(0, 10),
    missingInCache: missingInCache.slice(0, 10),
    ambiguousTitles: ambiguousTitles.slice(0, 10),
  };
}

async function main() {
  requireConfiguration();
  const database = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await database.connect();

  try {
    const [cacheResult, opportunityFields, contactFields, opportunities] =
      await Promise.all([
        database.query(
          `select deal_id, title, value, status, closing_date
             from public.deals_cache
            where sync_status = 'synced'`,
        ),
        ghlFetch(`/locations/${locationId}/customFields`, {
          model: "opportunity",
        }),
        ghlFetch(`/locations/${locationId}/customFields`, { model: "contact" }),
        fetchAllOpportunities(),
      ]);

    const cacheDeals = cacheResult.rows;
    const report = {
      generatedAt: new Date().toISOString(),
      cache: summarize(cacheDeals, true),
      ghl: summarize(opportunities, false),
      wonComparison: compareWonDeals(cacheDeals, opportunities),
      relevantGhlFields: {
        opportunity: (opportunityFields.customFields || []).filter(({ fieldKey }) =>
          /(fechamento|embarque|estado|quantidade|pares|vendedor|designer|segmento|inten|utm)/i.test(fieldKey),
        ).map(
          ({ id, name, fieldKey, dataType }) => ({ id, name, fieldKey, dataType }),
        ),
        contact: (contactFields.customFields || []).filter(({ fieldKey }) =>
          /(fechamento|embarque|estado|quantidade|pares|vendedor|designer|segmento|inten|utm)/i.test(fieldKey),
        ).map(
          ({ id, name, fieldKey, dataType }) => ({ id, name, fieldKey, dataType }),
        ),
      },
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await database.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
