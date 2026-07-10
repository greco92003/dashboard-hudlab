import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/freight/server";

interface IncomingCoverage {
  city: string;
  uf?: string | null;
  cep_prefix?: string | null;
  filial?: string | null;
  km?: number | null;
  frequency?: string | null;
  prazo_min?: number | null;
  prazo_max?: number | null;
  tda_value?: number | null;
}

// GET /api/freight/coverage?carrier_id=... → list served cities
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    if (!(await requireUser(supabase)))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const carrierId = new URL(request.url).searchParams.get("carrier_id");
    let query = supabase
      .from("freight_coverage")
      .select("*")
      .order("city", { ascending: true });
    if (carrierId) query = query.eq("carrier_id", carrierId);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET freight_coverage error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/freight/coverage → bulk import served cities for a carrier
// Body: { carrier_id, rows: IncomingCoverage[], replace?: boolean }
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    if (!(await requireUser(supabase)))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { carrier_id, rows, replace = true } = (await request.json()) as {
      carrier_id: string;
      rows: IncomingCoverage[];
      replace?: boolean;
    };

    if (!carrier_id)
      return NextResponse.json({ error: "carrier_id é obrigatório" }, { status: 400 });
    if (!Array.isArray(rows) || rows.length === 0)
      return NextResponse.json({ error: "Nenhuma praça para importar" }, { status: 400 });

    // dedupe by (city, uf)
    const byKey = new Map<string, IncomingCoverage>();
    for (const r of rows) {
      const city = String(r.city ?? "").trim();
      if (!city) continue;
      byKey.set(`${city}|${r.uf ?? ""}`, { ...r, city });
    }
    const clean = [...byKey.values()];
    if (clean.length === 0)
      return NextResponse.json({ error: "Nenhuma praça válida" }, { status: 400 });

    if (replace) {
      const { error: delErr } = await supabase
        .from("freight_coverage")
        .delete()
        .eq("carrier_id", carrier_id);
      if (delErr) throw delErr;
    }

    const covRows = clean.map((r) => ({
      carrier_id,
      city: r.city,
      uf: r.uf ?? null,
      cep_prefix: r.cep_prefix ?? null,
      filial: r.filial ?? null,
      km: r.km ?? null,
      frequency: r.frequency ?? null,
      prazo_min: r.prazo_min ?? null,
      prazo_max: r.prazo_max ?? null,
      tda_value: r.tda_value ?? null,
    }));

    const { error } = await supabase
      .from("freight_coverage")
      .upsert(covRows, { onConflict: "carrier_id,city,uf" });
    if (error) throw error;

    return NextResponse.json({ ok: true, coverage_imported: clean.length });
  } catch (error) {
    console.error("POST freight_coverage import error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
