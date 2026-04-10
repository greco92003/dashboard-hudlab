import { NextRequest, NextResponse } from "next/server";
import { getReceivables } from "@/lib/tiny/service";
import type { FinancialFilters } from "@/lib/tiny/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const filters: FinancialFilters = {
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    };

    const data = await getReceivables(filters);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    const status = message.includes("TINY_TOKEN") ? 503 : 500;
    console.error("[API /financial-dashboard/receivables]", message);
    return NextResponse.json({ error: message }, { status });
  }
}
