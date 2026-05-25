import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Valid stage slugs mapped to display names
const STAGE_SLUGS: Record<string, string> = {
  lead: "Lead",
  emailcoletado: "Email Coletado",
  viumockupautomatico: "Viu Mockup Automático",
  conheceumodeloseprecos: "Conheceu Modelos e Preços",
  solicitouorcamento: "Solicitou Orçamento",
  informouquantidade: "Informou Quantidade",
  informouestado: "Informou Estado",
  orcamentogerado: "Orçamento Gerado",
  solicitoumockupoficial: "Solicitou Mockup Oficial",
  negociofechado: "Negócio Fechado",
};

export async function POST(request: NextRequest) {
  try {
    // Parse body first — ManyChat may send stage inside the body
    let payload: Record<string, unknown> = {};
    try {
      payload = await request.json();
    } catch {
      // ManyChat may send empty body on some webhook types
    }

    // Resolve stage: body field takes priority, then URL param
    const { searchParams } = new URL(request.url);
    const rawStage =
      (payload?.stage as string) ||
      (payload?.tag as string) ||
      searchParams.get("stage") ||
      "";
    const stageParam = rawStage.toLowerCase().replace(/[^a-záéíóúãõç]/g, "");

    if (!stageParam || !STAGE_SLUGS[stageParam]) {
      console.warn(
        "[ManyChat Webhook] Unknown stage:",
        rawStage,
        "| payload keys:",
        Object.keys(payload),
      );
      // Always 200 so ManyChat doesn't retry
      return NextResponse.json({
        received: true,
        warning: "Unknown stage",
        raw: rawStage,
      });
    }

    const stageName = STAGE_SLUGS[stageParam];

    const subscriberId =
      (payload?.id as string) ||
      (payload?.subscriber_id as string) ||
      "unknown";

    console.log(
      `[ManyChat Webhook] Stage="${stageName}" subscriber_id="${subscriberId}"`,
    );

    // Persist to Supabase if configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error } = await supabase.from("manychat_tag_events").insert({
        stage_slug: stageParam,
        stage_name: stageName,
        subscriber_id: subscriberId,
        payload: payload,
        occurred_at: new Date().toISOString(),
      });

      if (error) {
        // Log but don't fail — ManyChat must receive 200
        console.error(
          "[ManyChat Webhook] Supabase insert error:",
          error.message,
        );
      }
    }

    return NextResponse.json({ received: true, stage: stageName });
  } catch (error) {
    console.error("[ManyChat Webhook] Unexpected error:", error);
    // Always 200 to avoid ManyChat retries flooding the server
    return NextResponse.json({ received: true, error: "internal" });
  }
}

// ManyChat may send a GET to verify the endpoint — return 200
export async function GET() {
  return NextResponse.json({ status: "ok", service: "manychat-webhook" });
}
