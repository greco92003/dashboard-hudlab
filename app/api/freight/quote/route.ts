import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/freight/server";
import { quoteFreight, type VolumeSel } from "@/lib/freight/quote";

// POST /api/freight/quote
// Body: { destino: string, volumes: {volume_id, count}[], valor_nf: number }
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    if (!(await requireUser(supabase)))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const outcome = await quoteFreight(supabase, {
      destino: String(body.destino ?? "").trim(),
      volumes: (body.volumes ?? []) as VolumeSel[],
      valor_nf: Number(body.valor_nf) || 0,
    });
    return outcome.ok
      ? NextResponse.json(outcome.body)
      : NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error("POST freight quote error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
