import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/freight/server";

// GET /api/freight/tables/[id] → table meta + lanes (with brackets)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServer();
    if (!(await requireUser(supabase)))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: table, error: tErr } = await supabase
      .from("freight_carrier_tables")
      .select("*")
      .eq("id", id)
      .single();
    if (tErr) throw tErr;

    const { data: lanes, error: lErr } = await supabase
      .from("freight_lanes")
      .select("*, freight_weight_brackets(*)")
      .eq("table_id", id)
      .order("dest_city", { ascending: true });
    if (lErr) throw lErr;

    return NextResponse.json({ table, lanes: lanes ?? [] });
  } catch (error) {
    console.error("GET freight table detail error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/freight/tables/[id] → update table meta
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServer();
    if (!(await requireUser(supabase)))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const allowed = [
      "name",
      "origin_label",
      "cubage_kg_per_m3",
      "icms_rate",
      "valid_from",
      "valid_to",
      "active",
      "notes",
    ];
    const update: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) update[k] = body[k];

    const { data, error } = await supabase
      .from("freight_carrier_tables")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("PUT freight table error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/freight/tables/[id] → delete table (cascades lanes + brackets)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServer();
    if (!(await requireUser(supabase)))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { error } = await supabase
      .from("freight_carrier_tables")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE freight table error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
