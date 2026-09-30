// app/api/sellers-v2/unread/route.ts
// Fila de não lidas de WhatsApp da aba Atendimentos Reais (arena de vendedores).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadUnreadInbox } from "@/lib/ghl/unread-inbox/load";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    return NextResponse.json({ items: await loadUnreadInbox(supabase) });
  } catch (error) {
    console.error("sellers-v2 unread GET error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
