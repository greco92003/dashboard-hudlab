import { NextRequest, NextResponse } from "next/server";
import { FUNNEL_STAGES } from "@/app/api/manychat/tags/route";

const MANYCHAT_BASE_URL = "https://api.manychat.com";

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

async function fetchTagsFromManyChat(token: string) {
  const response = await fetch(`${MANYCHAT_BASE_URL}/fb/page/getTags`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`ManyChat API error: ${response.status}`);
  const data = await response.json();
  return data.data || [];
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

    // Fetch all tags and map only the defined funnel stages in order
    const allTags: { id: number; name: string }[] =
      await fetchTagsFromManyChat(token);

    const stages: FunnelStage[] = FUNNEL_STAGES.map((stage, i) => {
      const match = allTags.find(
        (t) => t.name.toLowerCase() === stage.manychatName.toLowerCase(),
      );
      return {
        id: match?.id ?? i + 1,
        name: stage.displayName,
        order: i + 1,
        count: 0,
        previousCount: 0,
        conversionFromPrevious: null,
        growthRate: 0,
      };
    });

    return NextResponse.json({
      stages,
      period,
      overallConversionRate: 0,
      isMock: false,
      needsConfiguration: true,
    });
  } catch (error) {
    console.error("Erro ao montar funil ManyChat:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados do funil" },
      { status: 500 },
    );
  }
}
