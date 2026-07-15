import { NextResponse } from "next/server";
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
  stages: Set<GhlFunnelStageSlug>;
  withMockupAt: number | null;
  withoutMockupAt: number | null;
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

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

function buildJourneys(events: FunnelEventRow[]) {
  const journeys = new Map<string, ContactJourney>();

  for (const event of events) {
    const journey = journeys.get(event.contact_id) ?? {
      stages: new Set<GhlFunnelStageSlug>(),
      withMockupAt: null,
      withoutMockupAt: null,
    };
    journey.stages.add(event.stage_slug);

    const timestamp = Date.parse(event.received_at);
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

    journeys.set(event.contact_id, journey);
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
    (journey) => resolveVariant(journey) === variant,
  );

  return path.map((stage, index) => {
    const requiredStages = path.slice(0, index + 1);
    const value = variantJourneys.reduce(
      (total, journey) =>
        requiredStages.every((required) => journey.stages.has(required))
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

export async function GET() {
  try {
    const events = await fetchAllEvents();
    const journeys = buildJourneys(events);
    const journeyList = Array.from(journeys.values());
    const lastEventAt = events.at(-1)?.received_at ?? null;

    return NextResponse.json(
      {
        funnels: {
          withMockup: {
            id: "with_mockup",
            title: "Com Mockup Automático",
            stages: buildFunnel(journeys, "with_mockup"),
          },
          withoutMockup: {
            id: "without_mockup",
            title: "Sem Mockup Automático",
            stages: buildFunnel(journeys, "without_mockup"),
          },
        },
        meta: {
          totalEvents: events.length,
          totalContacts: journeys.size,
          unassignedContacts: journeyList.filter(
            (journey) => resolveVariant(journey) === null,
          ).length,
          ambiguousContacts: journeyList.filter(
            (journey) =>
              journey.withMockupAt !== null &&
              journey.withoutMockupAt !== null,
          ).length,
          lastEventAt,
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
