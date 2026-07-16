import { NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/freight/server";
import { isBraspressEnabled } from "@/lib/freight/carriers/braspress";

// GET /api/freight/api-carriers
// Transportadoras integradas via API em tempo real. A config operacional vem do
// env do servidor (apenas dados não-sensíveis são expostos); os dados de contato
// (telefone, e-mail...) vêm da linha correspondente em freight_carriers
// (api_slug = 'braspress'), editável pela UI via PUT /api/freight/carriers/[id].
export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    if (!(await requireUser(supabase)))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: dbRows } = await supabase
      .from("freight_carriers")
      .select("*")
      .eq("api_slug", "braspress")
      .limit(1);
    let db = dbRows?.[0] ?? null;
    if (!db) {
      // self-healing: recria a linha de contato caso tenha sido removida
      const { data: created } = await supabase
        .from("freight_carriers")
        .insert([{ name: "Braspress", api_slug: "braspress", website: "https://www.braspress.com" }])
        .select()
        .single();
      db = created ?? null;
    }

    const tipoFrete = process.env.BRASPRESS_TIPO_FRETE || "1";
    return NextResponse.json([
      {
        id: "braspress",
        name: db?.name || "Braspress",
        enabled: isBraspressEnabled(),
        modal: "Rodoviário",
        tipo_frete: tipoFrete === "1" ? "CIF" : "FOB",
        cnpj_remetente: process.env.BRASPRESS_CNPJ_REMETENTE || null,
        origin_label: "NOVA HARTZ-RS (93890-000)",
        website: db?.website || "https://www.braspress.com",
        db,
      },
    ]);
  } catch (e) {
    console.error("api-carriers error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
