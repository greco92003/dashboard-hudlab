// app/api/sellers-v2/negotiation-insight/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, createSupabaseServerForSync } from "@/lib/supabase/server";
import { fetchOpportunityById } from "@/lib/ghl/api";
import {
  getNegotiationTranscript,
  getVendedorForOpportunity,
  getQtyParesForOpportunity,
  computeResponseGapStats,
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

    // ghl_opportunities is only refreshed once a day (sync-ghl-daily cron),
    // so stage/value/custom fields there can be stale by the time a seller
    // clicks "Gerar Insight" — fetch the opportunity live from GHL here so
    // the context handed to the LLM matches the current CRM state, not
    // yesterday's snapshot. Falls back to the cached row if the live call
    // fails (e.g. transient GHL error) rather than blocking the insight.
    const [liveOpportunity, transcript] = await Promise.all([
      fetchOpportunityById(opportunity.id).catch((err) => {
        console.error(
          "Failed to fetch live opportunity, falling back to cached data:",
          err,
        );
        return null;
      }),
      getNegotiationTranscript(opportunity.contact_id),
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

    const fieldsSource = liveOpportunity ?? opportunity.raw;
    const [vendedor, qtyPares] = await Promise.all([
      getVendedorForOpportunity(fieldsSource),
      getQtyParesForOpportunity(fieldsSource),
    ]);

    let etapaCrm = opportunity.stage_name;
    let valorNegociacao = opportunity.monetary_value;
    if (liveOpportunity) {
      valorNegociacao = liveOpportunity.monetaryValue ?? valorNegociacao;
      if (liveOpportunity.pipelineStageId) {
        const { data: stageRow } = await supabase
          .from("dim_pipeline_stages")
          .select("stage_name")
          .eq("stage_id", liveOpportunity.pipelineStageId)
          .maybeSingle();
        if (stageRow?.stage_name) etapaCrm = stageRow.stage_name;
      }
    }

    const report = await runCopiloto(
      transcript.messages,
      computeResponseGapStats(transcript.messages),
      {
        vendedor,
        etapaCrm,
        valorNegociacao,
        qtyPares,
      },
    );

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
