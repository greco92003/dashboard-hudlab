import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/freight/server";

// GET /api/freight/tables?carrier_id=... → list carrier price tables (+lane count)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    if (!(await requireUser(supabase)))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const carrierId = new URL(request.url).searchParams.get("carrier_id");
    let query = supabase
      .from("freight_carrier_tables")
      .select("*, freight_lanes(count)")
      .order("created_at", { ascending: false });
    if (carrierId) query = query.eq("carrier_id", carrierId);

    const { data, error } = await query;
    if (error) throw error;

    const tables = (data ?? []).map((t: Record<string, unknown>) => {
      const lanes = t.freight_lanes as { count: number }[] | undefined;
      const { freight_lanes, ...rest } = t;
      void freight_lanes;
      return { ...rest, lane_count: lanes?.[0]?.count ?? 0 };
    });
    return NextResponse.json(tables);
  } catch (error) {
    console.error("GET freight_carrier_tables error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/freight/tables → create a carrier price table
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    if (!(await requireUser(supabase)))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const {
      carrier_id,
      name,
      origin_label,
      cubage_kg_per_m3,
      icms_rate,
      valid_from,
      valid_to,
      notes,
    } = body;

    if (!carrier_id || !name)
      return NextResponse.json(
        { error: "carrier_id e name são obrigatórios" },
        { status: 400 },
      );

    const { data, error } = await supabase
      .from("freight_carrier_tables")
      .insert([
        {
          carrier_id,
          name,
          origin_label: origin_label ?? null,
          cubage_kg_per_m3: cubage_kg_per_m3 ?? 300,
          icms_rate: icms_rate ?? 0.12,
          valid_from: valid_from ?? null,
          valid_to: valid_to ?? null,
          notes: notes ?? null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("POST freight_carrier_tables error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
