import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security/route-guards";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = getSupabaseSecretKey();
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

// POST /api/manychat/archive — archive a lead
export async function POST(request: NextRequest) {
  const access = await requireAdmin();
  if (!access.ok) return access.response;

  try {
    const { subscriber_id, lista_origem } = await request.json();
    if (!subscriber_id) {
      return NextResponse.json({ error: "subscriber_id required" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const { error } = await supabase.from("manychat_archived_leads").upsert(
      { subscriber_id, lista_origem: lista_origem ?? "unknown", arquivado_em: new Date().toISOString() },
      { onConflict: "subscriber_id" }
    );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Archive POST] Error:", error);
    return NextResponse.json({ error: "Erro ao arquivar lead" }, { status: 500 });
  }
}

// DELETE /api/manychat/archive — unarchive a lead
export async function DELETE(request: NextRequest) {
  const access = await requireAdmin();
  if (!access.ok) return access.response;

  try {
    const { subscriber_id } = await request.json();
    if (!subscriber_id) {
      return NextResponse.json({ error: "subscriber_id required" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const { error } = await supabase
      .from("manychat_archived_leads")
      .delete()
      .eq("subscriber_id", subscriber_id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Archive DELETE] Error:", error);
    return NextResponse.json({ error: "Erro ao desarquivar lead" }, { status: 500 });
  }
}
