import { after, NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { parseReportRequest } from "@/app/meta-marketing/report-catalog";
import { serveReport } from "@/lib/meta-marketing/report-cache";

export const maxDuration = 60;

const HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const parsed = parseReportRequest(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Relatório ou período inválido" }, { status: 400, headers: HEADERS });
  }
  const result = await serveReport(parsed, after);
  return NextResponse.json(result.body, { status: result.status, headers: HEADERS });
}
