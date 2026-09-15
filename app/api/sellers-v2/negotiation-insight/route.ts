// app/api/sellers-v2/negotiation-insight/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getNegotiationTranscript,
  NEGOTIATION_TRACKING_START_ISO,
} from "@/lib/ghl/negotiation-conversations";
import { generateCopilotoInsight } from "@/lib/ghl/sales-agent/copiloto-runner";

const MIN_MESSAGES_TO_EVALUATE = 2;

// maxDuration for this route is set in vercel.json (functions block), same
// convention as the other cron/agent routes in this project.

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

    const body = await request.json();
    const opportunityId = body?.opportunityId;
    if (!opportunityId || typeof opportunityId !== "string") {
      return NextResponse.json(
        { error: "opportunityId é obrigatório" },
        { status: 400 },
      );
    }

    const { data: opportunity, error: oppError } = await supabase
      .from("ghl_opportunities")
      .select("id, contact_id, stage_name, status, monetary_value, raw")
      .eq("id", opportunityId)
      .single();

    if (oppError || !opportunity) {
      return NextResponse.json(
        { error: "Oportunidade não encontrada" },
        { status: 404 },
      );
    }

    const { data: negotiationEvent, error: eventError } = await supabase
      .from("ghl_funnel_events")
      .select("received_at")
      .eq("contact_id", opportunity.contact_id)
      .eq("stage_slug", "emnegociacao")
      .gte("received_at", NEGOTIATION_TRACKING_START_ISO)
      .order("received_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (eventError || !negotiationEvent) {
      return NextResponse.json(
        {
          error:
            "Esta oportunidade ainda não entrou em negociação (ou entrou antes do lançamento deste recurso)",
        },
        { status: 404 },
      );
    }

    const transcript = await getNegotiationTranscript(opportunity.contact_id);

    if (transcript.messages.length < MIN_MESSAGES_TO_EVALUATE) {
      return NextResponse.json(
        {
          error:
            "Conversa muito curta para gerar um insight ainda. Aguarde mais mensagens trocadas.",
        },
        { status: 422 },
      );
    }

    const { report, messageCount } = await generateCopilotoInsight(
      {
        id: opportunity.id,
        contactId: opportunity.contact_id,
        stageName: opportunity.stage_name,
        monetaryValue: opportunity.monetary_value,
        raw: opportunity.raw,
      },
      transcript,
      user.id,
    );

    return NextResponse.json({
      success: true,
      insight: report,
      messageCount,
    });
  } catch (error) {
    console.error("negotiation-insight API error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
