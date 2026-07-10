import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/freight/server";
import { resolveCep } from "@/lib/freight/cep";

// GET /api/freight/cep?cep=18460000 → { cep, city, uf, lat?, lng?, source }
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    if (!(await requireUser(supabase)))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cep = new URL(request.url).searchParams.get("cep") ?? "";
    const result = await resolveCep(cep);
    if (!result) return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET freight cep error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
