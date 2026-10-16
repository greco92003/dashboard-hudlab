import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { requireCamiAdmin } from "@/lib/ghl/ai-seller/admin-access";
import { isCamiAdmin } from "@/lib/ghl/ai-seller/admin-shape";
import { loadSellerSettings } from "@/lib/ghl/ai-seller/settings";
import { validateSettingsInput } from "@/lib/ghl/ai-seller/settings-shape";
import { createSupabaseServerForSync } from "@/lib/supabase/server";

// Controle da Cami. Todo o time vê; só quem administra a Cami muda.
export async function GET() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  return NextResponse.json(
    { settings: await loadSellerSettings(), podeEditar: isCamiAdmin(access.profile?.role, access.user.email) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  const access = await requireCamiAdmin();
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
