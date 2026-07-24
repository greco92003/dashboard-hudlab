// app/api/sellers-v2/negotiations/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NEGOTIATION_TRACKING_START_ISO } from "@/lib/ghl/negotiation-conversations";

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

    // No-backfill scope decision: same cutoff as the evaluate-negotiations
    // cron (Task 6) and the on-demand insight route (Task 5).
    const { data: negotiationEvents, error: eventsError } = await supabase
      .from("ghl_funnel_events")
      .select("contact_id, contact_name, received_at")
      .eq("stage_slug", "emnegociacao")
      .gte("received_at", NEGOTIATION_TRACKING_START_ISO)
      .order("received_at", { ascending: true });
    if (eventsError) throw eventsError;

    const startedAtByContact = new Map<string, { name: string | null; startedAt: string }>();
    for (const event of negotiationEvents || []) {
      if (!startedAtByContact.has(event.contact_id)) {
        startedAtByContact.set(event.contact_id, {
          name: event.contact_name,
          startedAt: event.received_at,
        });
      }
    }
    const contactIds = Array.from(startedAtByContact.keys());

    const { data: openOpportunities, error: openError } = contactIds.length
      ? await supabase
          .from("ghl_opportunities")
          .select("id, contact_id, stage_name")
          .in("contact_id", contactIds)
          .eq("status", "open")
      : { data: [], error: null };
    if (openError) throw openError;

    const openOppIds = (openOpportunities || []).map((o) => o.id);
    const { data: latestInsights, error: insightsError } = openOppIds.length
      ? await supabase
          .from("ghl_negotiation_insights")
          .select("opportunity_id, report, created_at")
          .in("opportunity_id", openOppIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
    if (insightsError) throw insightsError;

    const latestInsightByOpportunity = new Map<string, { report: unknown; createdAt: string }>();
    for (const insight of latestInsights || []) {
      if (!latestInsightByOpportunity.has(insight.opportunity_id)) {
        latestInsightByOpportunity.set(insight.opportunity_id, {
          report: insight.report,
          createdAt: insight.created_at,
        });
      }
    }

    const active = (openOpportunities || []).map((opp) => {
      const started = startedAtByContact.get(opp.contact_id);
      const latestInsight = latestInsightByOpportunity.get(opp.id) || null;
      return {
        opportunityId: opp.id,
        contactId: opp.contact_id,
        contactName: started?.name ?? null,
        stageName: opp.stage_name,
        negotiationStartedAt: started?.startedAt ?? null,
        latestInsight,
      };
    });

    const { data: closedRows, error: closedError } = await supabase
      .from("ghl_negotiation_evaluations")
      .select(
        "opportunity_id, contact_id, vendedor, outcome, score, classification, has_critical_error, report, evaluated_at",
      )
      .order("evaluated_at", { ascending: false })
      .limit(100);
    if (closedError) throw closedError;

    const closed = closedRows || [];

    const scoresByVendedor = new Map<string, number[]>();
    for (const row of closed) {
      if (!row.vendedor || row.score == null) continue;
      const list = scoresByVendedor.get(row.vendedor) ?? [];
      list.push(row.score);
      scoresByVendedor.set(row.vendedor, list);
    }
    const rankingByVendedor = Array.from(scoresByVendedor.entries())
      .map(([vendedor, scores]) => ({
        vendedor,
        avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        count: scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    return NextResponse.json({ active, closed, rankingByVendedor });
  } catch (error) {
    console.error("negotiations list API error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
