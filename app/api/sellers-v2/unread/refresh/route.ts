// app/api/sellers-v2/unread/refresh/route.ts
// Botão "Atualizar não lidas": relê o GHL, classifica o que mudou e devolve a fila.
// maxDuration desta rota fica no vercel.json.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshUnreadInbox } from "@/lib/ghl/unread-inbox/refresh";
import { loadUnreadInbox } from "@/lib/ghl/unread-inbox/load";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const summary = await refreshUnreadInbox();
    return NextResponse.json({ ...summary, items: await loadUnreadInbox(supabase) });
  } catch (error) {
    console.error("sellers-v2 unread refresh error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
