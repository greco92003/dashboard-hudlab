import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { createClient } from "@supabase/supabase-js";
import {
  GHL_FUNNEL_PATHS,
  GHL_FUNNEL_STAGES,
  type GhlFunnelStageSlug,
  type GhlFunnelVariant,
} from "@/lib/ghl/funnel";

interface FunnelEventRow {
  contact_id: string;
  stage_slug: GhlFunnelStageSlug;
  received_at: string;
}

interface ContactJourney {
  /** First time each stage was reached, considering events up to the end of the range */
  stageFirstAt: Map<GhlFunnelStageSlug, number>;
  withMockupAt: number | null;
  withoutMockupAt: number | null;
  /** Whether the contact had at least one event inside the selected range */
  hasEventInRange: boolean;
  /** All-time last event, used for funnel activity regardless of the range */
  lastEventAt: number;
}

interface DateRangeMs {
  start: number;
  end: number;
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 100;
// Um funil é considerado desativado após 2 dias seguidos sem receber webhook.
const INACTIVITY_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000;
// São Paulo é UTC-3 fixo (sem horário de verão desde 2019).
const BRAZIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Accepts the same query contract as the dashboard APIs:
 * `?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` or `?period=30|60|90`
 * (30/60/90 => 1/2/3 months back, Brazil time). No params => all time.
 */
function parseRange(searchParams: URLSearchParams): DateRangeMs | null {
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (
    startDate &&
    endDate &&
    DATE_PARAM_RE.test(startDate) &&
    DATE_PARAM_RE.test(endDate)
  ) {
    return {
      start: Date.parse(`${startDate}T00:00:00.000-03:00`),
      end: Date.parse(`${endDate}T23:59:59.999-03:00`),
    };
  }

  const periodParam = searchParams.get("period");
  if (!periodParam) return null;

  const period = Number.parseInt(periodParam, 10);
  if (Number.isNaN(period)) return null;

  let months = 1;
  if (period === 60) months = 2;
  else if (period === 90) months = 3;

  // "Today" on Brazil's wall clock.
  const nowBrazil = new Date(Date.now() - BRAZIL_UTC_OFFSET_MS);
  const year = nowBrazil.getUTCFullYear();
  const month = nowBrazil.getUTCMonth();
  const day = nowBrazil.getUTCDate();

  return {
    start:
      Date.UTC(year, month - months, day, 0, 0, 0, 0) + BRAZIL_UTC_OFFSET_MS,
    end: Date.UTC(year, month, day, 23, 59, 59, 999) + BRAZIL_UTC_OFFSET_MS,
  };
}

async function fetchAllEvents(): Promise<FunnelEventRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service credentials are missing");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const rows: FunnelEventRow[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("ghl_funnel_events")
      .select("contact_id, stage_slug, received_at")
      .order("received_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const batch = (data ?? []) as FunnelEventRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

function buildJourneys(events: FunnelEventRow[], range: DateRangeMs | null) {
  const journeys = new Map<string, ContactJourney>();

  for (const event of events) {
    const timestamp = Date.parse(event.received_at);
    let journey = journeys.get(event.contact_id);
    if (!journey) {
      journey = {
        stageFirstAt: new Map(),
        withMockupAt: null,
        withoutMockupAt: null,
        hasEventInRange: range === null,
        lastEventAt: timestamp,
      };
      journeys.set(event.contact_id, journey);
    }

    if (timestamp > journey.lastEventAt) {
      journey.lastEventAt = timestamp;
    }

    if (range && timestamp >= range.start && timestamp <= range.end) {
      journey.hasEventInRange = true;
    }

    // The A/B variant identity comes from the first event of each arm,
    // regardless of the selected range.
    if (
      event.stage_slug === "commockautomatico" &&
      journey.withMockupAt === null
    ) {
      journey.withMockupAt = timestamp;
    }
    if (
      event.stage_slug === "semmockautomatico" &&
      journey.withoutMockupAt === null
    ) {
      journey.withoutMockupAt = timestamp;
    }

    // Stage counts only consider what happened up to the end of the range.
    if (
      (range === null || timestamp <= range.end) &&
      !journey.stageFirstAt.has(event.stage_slug)
    ) {
      journey.stageFirstAt.set(event.stage_slug, timestamp);
    }
  }

  return journeys;
}

function resolveVariant(journey: ContactJourney): GhlFunnelVariant | null {
  if (journey.withMockupAt === null && journey.withoutMockupAt === null) {
    return null;
  }
  if (journey.withoutMockupAt === null) return "with_mockup";
  if (journey.withMockupAt === null) return "without_mockup";

  return journey.withMockupAt <= journey.withoutMockupAt
    ? "with_mockup"
    : "without_mockup";
}

function buildFunnel(
  journeys: Map<string, ContactJourney>,
  variant: GhlFunnelVariant,
) {
  const path = GHL_FUNNEL_PATHS[variant];
  const variantJourneys = Array.from(journeys.values()).filter(
    (journey) =>
      journey.hasEventInRange && resolveVariant(journey) === variant,
  );

  return path.map((stage, index) => {
    const requiredStages = path.slice(0, index + 1);
    const value = variantJourneys.reduce(
      (total, journey) =>
        requiredStages.every((required) => journey.stageFirstAt.has(required))
          ? total + 1
          : total,
      0,
    );

    return {
      slug: stage,
      label: GHL_FUNNEL_STAGES[stage],
      value,
    };
  });
}

/**
 * A funnel is active "today" (Meta Ads semantics) when any webhook
 * attributable to it arrived within the inactivity threshold — this is
 * independent of the selected range.
 */
function variantActivity(
  journeys: Map<string, ContactJourney>,
  variant: GhlFunnelVariant,
  now: number,
) {
  let lastEventAt: number | null = null;
  for (const journey of journeys.values()) {
    if (resolveVariant(journey) !== variant) continue;
    if (lastEventAt === null || journey.lastEventAt > lastEventAt) {
      lastEventAt = journey.lastEventAt;
    }
  }

  return {
    active:
      lastEventAt !== null && now - lastEventAt <= INACTIVITY_THRESHOLD_MS,
    lastEventAt: lastEventAt === null ? null : new Date(lastEventAt).toISOString(),
  };
}

export async function GET(request: Request) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  try {
    const { searchParams } = new URL(request.url);
    const range = parseRange(searchParams);

    const events = await fetchAllEvents();
    const journeys = buildJourneys(events, range);
    const journeyList = Array.from(journeys.values());
    const inRangeJourneys = journeyList.filter(
      (journey) => journey.hasEventInRange,
    );
    const now = Date.now();

    const eventsInRange = range
      ? events.filter((event) => {
          const timestamp = Date.parse(event.received_at);
          return timestamp >= range.start && timestamp <= range.end;
        }).length
      : events.length;

    const withMockupActivity = variantActivity(journeys, "with_mockup", now);
    const withoutMockupActivity = variantActivity(
      journeys,
      "without_mockup",
      now,
    );

    return NextResponse.json(
      {
        funnels: {
          withMockup: {
            id: "with_mockup",
            title: "Com Mockup Automático",
            stages: buildFunnel(journeys, "with_mockup"),
            active: withMockupActivity.active,
            lastEventAt: withMockupActivity.lastEventAt,
          },
          withoutMockup: {
            id: "without_mockup",
            title: "Sem Mockup Automático",
            stages: buildFunnel(journeys, "without_mockup"),
            active: withoutMockupActivity.active,
            lastEventAt: withoutMockupActivity.lastEventAt,
          },
        },
        meta: {
          totalEvents: eventsInRange,
          totalContacts: inRangeJourneys.length,
          unassignedContacts: inRangeJourneys.filter(
            (journey) => resolveVariant(journey) === null,
          ).length,
          ambiguousContacts: inRangeJourneys.filter(
            (journey) =>
              journey.withMockupAt !== null &&
              journey.withoutMockupAt !== null,
          ).length,
          lastEventAt: events.at(-1)?.received_at ?? null,
          range: range
            ? {
                from: new Date(range.start).toISOString(),
                to: new Date(range.end).toISOString(),
              }
            : null,
          generatedAt: new Date().toISOString(),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Data-Source": "ghl-webhooks",
        },
      },
    );
  } catch (error) {
    console.error("[GHL Funnel] Failed to build funnel", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to build funnel",
      },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
