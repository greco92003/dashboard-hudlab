// app/api/sellers-v2/negotiation-insight/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, createSupabaseServerForSync } from "@/lib/supabase/server";
import {
  getNegotiationTranscript,
  getVendedorForOpportunity,
  formatTranscriptForPrompt,
  NEGOTIATION_TRACKING_START_ISO,
} from "@/lib/ghl/negotiation-conversations";
import { runCopiloto } from "@/lib/ghl/sales-agent/agent";
import { MANUAL_VERSION } from "@/lib/ghl/sales-agent/manual";

const MIN_MESSAGES_TO_EVALUATE = 2;

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
      .select("id, contact_id, stage_name, status, monetary_value, qty_pares, raw")
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

    const [vendedor, transcript] = await Promise.all([
      getVendedorForOpportunity(opportunity.raw),
      getNegotiationTranscript(opportunity.contact_id, negotiationEvent.received_at),
    ]);

    if (transcript.messages.length < MIN_MESSAGES_TO_EVALUATE) {
      return NextResponse.json(
        {
          error:
            "Conversa muito curta para gerar um insight ainda. Aguarde mais mensagens trocadas.",
        },
        { status: 422 },
      );
    }

    const report = await runCopiloto(formatTranscriptForPrompt(transcript.messages), {
      vendedor,
      etapaCrm: opportunity.stage_name,
      valorNegociacao: opportunity.monetary_value,
      qtyPares: opportunity.qty_pares,
    });

    const serviceClient = await createSupabaseServerForSync();
    const { error: insertError } = await serviceClient
      .from("ghl_negotiation_insights")
      .insert({
        opportunity_id: opportunity.id,
        contact_id: opportunity.contact_id,
        vendedor,
        report,
        manual_version: MANUAL_VERSION,
        message_count: transcript.messages.length,
        requested_by: user.id,
      });

    if (insertError) {
      console.error("Failed to save negotiation insight:", insertError);
      // Still return the insight to the user even if persistence failed —
      // don't block the coaching value on a logging failure.
    }

    return NextResponse.json({
      success: true,
      insight: report,
      messageCount: transcript.messages.length,
    });
  } catch (error) {
    console.error("negotiation-insight API error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
