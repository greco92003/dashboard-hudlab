import { NextRequest, NextResponse } from "next/server";
import { getTimeline } from "@/lib/tiny/service";
import type { FinancialFilters } from "@/lib/tiny/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const granularity = (searchParams.get("granularity") ?? "month") as
      | "day"
      | "week"
      | "month";

    const filters: FinancialFilters = {
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      granularity,
    };

    const data = await getTimeline(filters);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    const status = message.includes("TINY_TOKEN") ? 503 : 500;
    console.error("[API /financial-dashboard/timeline]", message);
    return NextResponse.json({ error: message }, { status });
  }
}
