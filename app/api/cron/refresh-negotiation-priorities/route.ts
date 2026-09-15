// app/api/cron/refresh-negotiation-priorities/route.ts
//
// Keeps every opportunity currently in "Em Negociação" (open, tagged
// emnegociacao) carrying a Copiloto insight that reflects the conversation
// as of a few minutes ago, so sellers open /sellers_v2 with the list
// already prioritized instead of a flat wall of names — the on-demand
// "Gerar Insight" button still exists for a fresher read mid-day.
//
// Originally scoped as a single ~7h BRT run ("vendedor chega com tudo
// atualizado pro dia"), but the real volume (289 open negotiations at the
// time this was built) doesn't fit a single call: at ~15-30s per Copiloto
// call, refreshing all of them sequentially would run well past Vercel's
// maxDuration even with concurrency. Runs every 15 min all day instead —
// same shape as evaluate-negotiations — which reaches the same outcome
// (fresh before sellers start their day) without a single run needing to
// carry the whole list, and self-heals if any run partially fails.
//
// Skips the (expensive) LLM call for negotiations with no new WhatsApp
// activity since their last stored insight — comparing message counts is a
// cheap GHL fetch, not a Copiloto call, so "no movement" negotiations cost
// almost nothing here and just keep showing their last real read.
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { requireCronSecret } from "@/lib/security/route-guards";
import {
  getNegotiationTranscript,
  NEGOTIATION_TRACKING_START_ISO,
} from "@/lib/ghl/negotiation-conversations";
import { generateCopilotoInsight } from "@/lib/ghl/sales-agent/copiloto-runner";

const MIN_MESSAGES_TO_EVALUATE = 2;
// 5 waves of 4 at a worst-case ~35s/call (medium reasoning effort, agent.ts)
// stays comfortably under the 300s Vercel maxDuration below.
const CONCURRENCY = 4;
const MAX_OPPORTUNITIES_PER_RUN = 20;

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const supabase = await createSupabaseServerForSync();

  // Same scope as /api/sellers-v2/negotiations "active": open opportunities
  // currently tagged emnegociacao.
  const { data: negotiationEvents, error: eventsError } = await supabase
    .from("ghl_funnel_events")
    .select("contact_id, received_at")
    .eq("stage_slug", "emnegociacao")
    .gte("received_at", NEGOTIATION_TRACKING_START_ISO)
    .order("received_at", { ascending: true });
  if (eventsError) {
    console.error("refresh-negotiation-priorities: failed to load funnel events", eventsError);
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const contactIds = Array.from(
    new Set((negotiationEvents || []).map((e) => e.contact_id)),
  );
  if (contactIds.length === 0) {
    return NextResponse.json({ success: true, refreshed: 0, skipped: 0, errors: 0 });
  }

  const { data: allOpenOpportunities, error: oppError } = await supabase
    .from("ghl_opportunities")
    .select("id, contact_id, stage_name, monetary_value, raw")
    .in("contact_id", contactIds)
    .eq("status", "open");
  if (oppError) {
    console.error("refresh-negotiation-priorities: failed to load opportunities", oppError);
    return NextResponse.json({ error: oppError.message }, { status: 500 });
  }

  const allOpen = allOpenOpportunities || [];
  if (allOpen.length === 0) {
    return NextResponse.json({ success: true, refreshed: 0, skipped: 0, errors: 0 });
  }

  const { data: latestInsights, error: insightsError } = await supabase
    .from("ghl_negotiation_insights")
    .select("opportunity_id, message_count, created_at")
    .in("opportunity_id", allOpen.map((o) => o.id))
    .order("created_at", { ascending: false });
  if (insightsError) {
    console.error("refresh-negotiation-priorities: failed to load existing insights", insightsError);
    return NextResponse.json({ error: insightsError.message }, { status: 500 });
  }

  const latestMessageCountByOpportunity = new Map<string, number>();
  const latestInsightCreatedAtByOpportunity = new Map<string, string>();
  for (const insight of latestInsights || []) {
    if (!latestMessageCountByOpportunity.has(insight.opportunity_id)) {
      latestMessageCountByOpportunity.set(insight.opportunity_id, insight.message_count);
      latestInsightCreatedAtByOpportunity.set(insight.opportunity_id, insight.created_at);
    }
  }

  // Process the stalest candidates first (never insighted, then oldest
  // insight) so a fixed .limit() can't starve the same subset run after
  // run — every opportunity eventually rotates to the front once the ones
  // ahead of it get a fresh insight.
  const NEVER_INSIGHTED = "1970-01-01T00:00:00.000Z";
  const pending = [...allOpen]
    .sort((a, b) => {
      const aAt = latestInsightCreatedAtByOpportunity.get(a.id) ?? NEVER_INSIGHTED;
      const bAt = latestInsightCreatedAtByOpportunity.get(b.id) ?? NEVER_INSIGHTED;
      return aAt.localeCompare(bAt);
    })
    .slice(0, MAX_OPPORTUNITIES_PER_RUN);

  type PendingOpportunity = (typeof pending)[number];

  async function refreshOne(opportunity: PendingOpportunity): Promise<"refreshed" | "skipped" | "error"> {
    try {
      const transcript = await getNegotiationTranscript(opportunity.contact_id);

      if (transcript.messages.length < MIN_MESSAGES_TO_EVALUATE) {
        return "skipped";
      }

      const lastKnownCount = latestMessageCountByOpportunity.get(opportunity.id);
      if (lastKnownCount === transcript.messages.length) {
        // No new WhatsApp activity since the last insight — the stored
        // situação/report is still accurate, and "days without movement" is
        // derived from last_message_at at read time, so there's nothing to
        // regenerate.
        return "skipped";
      }

      await generateCopilotoInsight(
        {
          id: opportunity.id,
          contactId: opportunity.contact_id,
          stageName: opportunity.stage_name,
          monetaryValue: opportunity.monetary_value,
          raw: opportunity.raw,
        },
        transcript,
        null,
      );
      return "refreshed";
    } catch (err) {
      console.error(`refresh-negotiation-priorities: failed for ${opportunity.id}`, err);
      return "error";
    }
  }

  let refreshed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const chunk = pending.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(refreshOne));
    for (const result of results) {
      if (result === "refreshed") refreshed++;
      else if (result === "skipped") skipped++;
      else errors++;
    }
  }

  return NextResponse.json({ success: true, refreshed, skipped, errors });
}
