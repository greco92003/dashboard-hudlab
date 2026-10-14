import { NextResponse } from "next/server";
import { requireApprovedUser, requireRole } from "@/lib/security/route-guards";
import { loadSellerSettings } from "@/lib/ghl/ai-seller/settings";
import { validateSettingsInput } from "@/lib/ghl/ai-seller/settings-shape";
import { createSupabaseServerForSync } from "@/lib/supabase/server";

// Controle da Cami. Todo o time vê; só o owner muda.
export async function GET() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  return NextResponse.json(
    { settings: await loadSellerSettings(), podeEditar: access.profile?.role === "owner" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  const access = await requireRole(["owner"]);
  if (!access.ok) return access.response;

  const validated = validateSettingsInput(await request.json().catch(() => null));
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const supabase = await createSupabaseServerForSync();
  const { error } = await supabase
    .from("ai_seller_settings")
    .update({ ...validated.row, updated_by: access.user.id, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) {
    console.error("cami settings update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ settings: await loadSellerSettings() });
}
