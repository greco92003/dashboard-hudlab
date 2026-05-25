import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FUNNEL_STAGES } from "@/app/api/manychat/tags/route";

// Date range helpers
function getPeriodRange(period: "weekly" | "monthly" | "yearly"): {
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const daysMap = { weekly: 7, monthly: 30, yearly: 365 };
  const days = daysMap[period];

  const currentStart = new Date(today);
  currentStart.setDate(today.getDate() - days);
  const currentEnd = new Date(today);
  currentEnd.setHours(23, 59, 59, 999);

  const previousStart = new Date(currentStart);
  previousStart.setDate(currentStart.getDate() - days);
  const previousEnd = new Date(currentStart);
  previousEnd.setHours(23, 59, 59, 999);

  return { currentStart, currentEnd, previousStart, previousEnd };
}

export interface FunnelStage {
  id: number;
  name: string;
  order: number;
  count: number;
  previousCount: number;
  conversionFromPrevious: number | null;
  growthRate: number;
}

export interface FunnelData {
  stages: FunnelStage[];
  period: "weekly" | "monthly" | "yearly";
  overallConversionRate: number;
  isMock: boolean;
  needsConfiguration?: boolean;
}

// Realistic mock counts that naturally taper through the 10 funnel stages
const MOCK_COUNTS: Record<string, { current: number[]; previous: number[] }> = {
  weekly: {
    current: [480, 390, 310, 260, 215, 175, 145, 115, 88, 42],
    previous: [420, 340, 268, 218, 178, 142, 115, 90, 68, 31],
  },
  monthly: {
    current: [2100, 1720, 1360, 1140, 940, 760, 620, 490, 375, 180],
    previous: [1800, 1460, 1140, 940, 760, 600, 480, 370, 275, 125],
  },
  yearly: {
    current: [26000, 21200, 16700, 14000, 11500, 9300, 7600, 6000, 4600, 2200],
    previous: [20000, 16200, 12600, 10400, 8400, 6600, 5200, 4000, 2900, 1300],
  },
};

function buildStages(
  names: string[],
  current: number[],
  previous: number[],
): FunnelStage[] {
  return names.map((name, i) => {
    const count = current[i] ?? 0;
    const previousCount = previous[i] ?? 0;
    const prevCurrent = i > 0 ? current[i - 1] : null;
    const conversionFromPrevious =
      prevCurrent && prevCurrent > 0
        ? Math.round((count / prevCurrent) * 1000) / 10
        : null;
    const growthRate =
      previousCount > 0
        ? Math.round(((count - previousCount) / previousCount) * 1000) / 10
        : 0;
    return {
      id: i + 1,
      name,
      order: i + 1,
      count,
      previousCount,
      conversionFromPrevious,
      growthRate,
    };
  });
}

function getMockFunnelData(
  period: "weekly" | "monthly" | "yearly",
): FunnelData {
  const { current, previous } = MOCK_COUNTS[period];
  const displayNames = FUNNEL_STAGES.map((s) => s.displayName);
  const stages = buildStages(displayNames, current, previous);
  const first = stages[0].count;
  const last = stages[stages.length - 1].count;
  const overallConversionRate =
    first > 0 ? Math.round((last / first) * 1000) / 10 : 0;
  return { stages, period, overallConversionRate, isMock: true };
}

async function querySupabaseCounts(
  period: "weekly" | "monthly" | "yearly",
): Promise<{
  currentCounts: Record<string, number>;
  previousCounts: Record<string, number>;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { currentCounts: {}, previousCounts: {} };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { currentStart, currentEnd, previousStart, previousEnd } =
    getPeriodRange(period);

  const [currentResult, previousResult] = await Promise.all([
    supabase
      .from("manychat_tag_events")
      .select("stage_slug")
      .gte("occurred_at", currentStart.toISOString())
      .lte("occurred_at", currentEnd.toISOString()),
    supabase
      .from("manychat_tag_events")
      .select("stage_slug")
      .gte("occurred_at", previousStart.toISOString())
      .lte("occurred_at", previousEnd.toISOString()),
  ]);

  const toCounts = (rows: { stage_slug: string }[] | null) =>
    (rows ?? []).reduce<Record<string, number>>((acc, row) => {
      acc[row.stage_slug] = (acc[row.stage_slug] ?? 0) + 1;
      return acc;
    }, {});

  return {
    currentCounts: toCounts(currentResult.data),
    previousCounts: toCounts(previousResult.data),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") || "monthly") as
      | "weekly"
      | "monthly"
      | "yearly";

    const token = process.env.MANYCHAT_API_TOKEN;
    const isTokenConfigured = token && token !== "seu_token_manychat_aqui";

    if (!isTokenConfigured) {
      return NextResponse.json(getMockFunnelData(period));
    }

    // Query real counts from Supabase
    const { currentCounts, previousCounts } = await querySupabaseCounts(period);

    const totalCurrentEvents = Object.values(currentCounts).reduce(
      (a, b) => a + b,
      0,
    );

    // If no events recorded yet, fall back to mock with a flag
    if (totalCurrentEvents === 0) {
      const mockData = getMockFunnelData(period);
      return NextResponse.json({ ...mockData, isMock: true, noDataYet: true });
    }

    const displayNames = FUNNEL_STAGES.map((s) => s.displayName);
    const slugs = [
      "lead",
      "emailcoletado",
      "viumockupautomatico",
      "conheceumodeloseprecos",
      "solicitouorcamento",
      "informouquantidade",
      "informouestado",
      "orcamentogerado",
      "solicitoumockupoficial",
      "negociofechado",
    ];

    const current = slugs.map((s) => currentCounts[s] ?? 0);
    const previous = slugs.map((s) => previousCounts[s] ?? 0);

    const stages = buildStages(displayNames, current, previous);
    const first = stages[0].count;
    const last = stages[stages.length - 1].count;
    const overallConversionRate =
      first > 0 ? Math.round((last / first) * 1000) / 10 : 0;

    return NextResponse.json({
      stages,
      period,
      overallConversionRate,
      isMock: false,
    });
  } catch (error) {
    console.error("Erro ao montar funil ManyChat:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados do funil" },
      { status: 500 },
    );
  }
}
