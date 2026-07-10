import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/freight/server";

interface IncomingBracket {
  max_weight_kg: number;
  price: number;
}
interface IncomingLane {
  origin_city?: string | null;
  origin_cep_prefix?: string | null;
  dest_city: string;
  dest_cep_prefix?: string | null;
  dest_uf?: string | null;
  brackets: IncomingBracket[];
  excess_per_ton?: number;
  advalorem_pct?: number;
  toll_per_100kg?: number;
  fee_up_to_50?: number;
  fee_above_50?: number;
  gris_pct?: number;
  ta_value?: number;
  min_price?: number | null;
  icms_rate?: number | null;
  notes?: string | null;
}

const num = (v: unknown, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);

/**
 * POST /api/freight/tables/[id]/lanes
 * Body: { lanes: IncomingLane[], replace?: boolean }
 * Bulk-imports lanes + weight brackets. Default replaces the table's lanes.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: tableId } = await params;
    const supabase = await createSupabaseServer();
    if (!(await requireUser(supabase)))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lanes, replace = true } = (await request.json()) as {
      lanes: IncomingLane[];
      replace?: boolean;
    };

    if (!Array.isArray(lanes) || lanes.length === 0)
      return NextResponse.json({ error: "Nenhuma rota para importar" }, { status: 400 });

    // dedupe by destination key; keep valid rows only
    const byKey = new Map<string, IncomingLane>();
    for (const l of lanes) {
      const dest_city = String(l.dest_city ?? "").trim();
      if (!dest_city || !Array.isArray(l.brackets) || l.brackets.length === 0) continue;
      const dest_cep_prefix = String(l.dest_cep_prefix ?? "").trim();
      byKey.set(`${dest_city}|${dest_cep_prefix}`, { ...l, dest_city, dest_cep_prefix });
    }
    const clean = [...byKey.values()];
    if (clean.length === 0)
      return NextResponse.json({ error: "Nenhuma rota válida" }, { status: 400 });

    if (replace) {
      const { error: delErr } = await supabase
        .from("freight_lanes")
        .delete()
        .eq("table_id", tableId);
      if (delErr) throw delErr;
    }

    const laneRows = clean.map((l) => ({
      table_id: tableId,
      origin_city: l.origin_city ?? null,
      origin_cep_prefix: l.origin_cep_prefix ?? null,
      dest_city: l.dest_city,
      dest_cep_prefix: l.dest_cep_prefix ?? "",
      dest_uf: l.dest_uf ?? null,
      excess_per_ton: num(l.excess_per_ton),
      advalorem_pct: num(l.advalorem_pct),
      toll_per_100kg: num(l.toll_per_100kg),
      fee_up_to_50: num(l.fee_up_to_50),
      fee_above_50: num(l.fee_above_50),
      gris_pct: num(l.gris_pct),
      ta_value: num(l.ta_value),
      min_price: l.min_price ?? null,
      icms_rate: l.icms_rate ?? null,
      notes: l.notes ?? null,
    }));

    const { data: inserted, error: insErr } = await supabase
      .from("freight_lanes")
      .upsert(laneRows, { onConflict: "table_id,dest_city,dest_cep_prefix" })
      .select("id, dest_city, dest_cep_prefix");
    if (insErr) throw insErr;

    const idByKey = new Map<string, string>();
    for (const row of inserted ?? [])
      idByKey.set(`${row.dest_city}|${row.dest_cep_prefix ?? ""}`, row.id);

    const bracketRows: { lane_id: string; max_weight_kg: number; price: number }[] = [];
    for (const l of clean) {
      const laneId = idByKey.get(`${l.dest_city}|${l.dest_cep_prefix ?? ""}`);
      if (!laneId) continue;
      for (const b of l.brackets) {
        if (num(b.max_weight_kg) > 0)
          bracketRows.push({
            lane_id: laneId,
            max_weight_kg: num(b.max_weight_kg),
            price: num(b.price),
          });
      }
    }

    if (bracketRows.length > 0) {
      // clear existing brackets for these lanes, then insert fresh
      const laneIds = [...idByKey.values()];
      const { error: delBrErr } = await supabase
        .from("freight_weight_brackets")
        .delete()
        .in("lane_id", laneIds);
      if (delBrErr) throw delBrErr;

      const { error: brErr } = await supabase
        .from("freight_weight_brackets")
        .insert(bracketRows);
      if (brErr) throw brErr;
    }

    return NextResponse.json({
      ok: true,
      lanes_imported: clean.length,
      brackets_imported: bracketRows.length,
    });
  } catch (error) {
    console.error("POST freight lanes import error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
