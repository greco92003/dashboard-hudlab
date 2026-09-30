// app/api/sellers-v2/unread/insight/route.ts
// Clique numa não lida: insight + sugestão de resposta (Copiloto com a conversa cortada).
// maxDuration desta rota fica no vercel.json.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateUnreadInsight } from "@/lib/ghl/unread-inbox/refresh";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { conversationId?: unknown } | null;
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
    if (!conversationId) {
      return NextResponse.json({ error: "conversationId é obrigatório" }, { status: 400 });
    }

    const insight = await generateUnreadInsight(conversationId);
    return NextResponse.json({ insight });
  } catch (error) {
    console.error("sellers-v2 unread insight error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
