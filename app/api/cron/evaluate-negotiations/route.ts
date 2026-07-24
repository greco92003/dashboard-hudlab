// app/api/cron/evaluate-negotiations/route.ts
//
// Modo Auditor (batch): for every opportunity that reached "Em Negociação"
// (ghl_funnel_events, stage_slug='emnegociacao') and has since been
// resolved (ghl_opportunities.status != 'open') and doesn't have an
// evaluation yet, fetch its WhatsApp transcript and score it. Runs after
// sync-ghl-daily so ghl_opportunities.status is fresh.
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { requireCronSecret } from "@/lib/security/route-guards";
import {
  getNegotiationTranscript,
  getVendedorForOpportunity,
  computeResponseGapStats,
  NEGOTIATION_TRACKING_START_ISO,
} from "@/lib/ghl/negotiation-conversations";
import { runAuditor } from "@/lib/ghl/sales-agent/agent";
import { MANUAL_VERSION } from "@/lib/ghl/sales-agent/manual";

const MIN_MESSAGES_TO_EVALUATE = 2;
const MAX_OPPORTUNITIES_PER_RUN = 25; // keep each run well under the Vercel maxDuration

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const supabase = await createSupabaseServerForSync();

  // No-backfill scope decision: only negotiations tagged from
  // NEGOTIATION_TRACKING_START_ISO onward are ever evaluated.
  const { data: negotiationEvents, error: eventsError } = await supabase
    .from("ghl_funnel_events")
    .select("contact_id, received_at")
    .eq("stage_slug", "emnegociacao")
    .gte("received_at", NEGOTIATION_TRACKING_START_ISO)
    .order("received_at", { ascending: true });

  if (eventsError) {
    console.error("evaluate-negotiations: failed to load funnel events", eventsError);
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  // A tag can fire more than once for the same contact — keep the earliest.
  const startedAtByContact = new Map<string, string>();
  for (const event of negotiationEvents || []) {
    if (!startedAtByContact.has(event.contact_id)) {
      startedAtByContact.set(event.contact_id, event.received_at);
    }
  }

  if (startedAtByContact.size === 0) {
    return NextResponse.json({ success: true, evaluated: 0, skipped: 0, errors: 0 });
  }

  const { data: resolvedOpportunities, error: oppError } = await supabase
    .from("ghl_opportunities")
    .select("id, contact_id, stage_name, status, monetary_value, qty_pares, raw, updated_at")
    .in("contact_id", Array.from(startedAtByContact.keys()))
    .neq("status", "open");

  if (oppError) {
    console.error("evaluate-negotiations: failed to load opportunities", oppError);
    return NextResponse.json({ error: oppError.message }, { status: 500 });
  }

  const { data: alreadyEvaluated, error: evalError } = await supabase
    .from("ghl_negotiation_evaluations")
    .select("opportunity_id");

  if (evalError) {
    console.error("evaluate-negotiations: failed to load existing evaluations", evalError);
    return NextResponse.json({ error: evalError.message }, { status: 500 });
  }

  const evaluatedIds = new Set((alreadyEvaluated || []).map((r) => r.opportunity_id));
  const pending = (resolvedOpportunities || [])
    .filter((o) => !evaluatedIds.has(o.id))
    .slice(0, MAX_OPPORTUNITIES_PER_RUN);

  let evaluated = 0;
  let skipped = 0;
  let errors = 0;

  for (const opportunity of pending) {
    try {
      const negotiationStartedAt = startedAtByContact.get(opportunity.contact_id)!;
      const [vendedor, transcript] = await Promise.all([
        getVendedorForOpportunity(opportunity.raw),
        getNegotiationTranscript(opportunity.contact_id),
      ]);

      const outcome: "won" | "lost" = opportunity.status === "won" ? "won" : "lost";

      // The transcript now covers the full WhatsApp history (context for
      // the agent), not just messages after the negotiation tag — so
      // "enough to evaluate" has to be judged on messages from
      // negotiationStartedAt onward specifically, not the whole array
      // (which will almost always be non-trivial once there's any history
      // at all). The opportunity is already resolved (won/lost), so this
      // count will never grow — if it's too short to evaluate now, it
      // never will be. Record it as "não avaliável" once instead of
      // leaving it pending forever.
      const negotiationStartedAtMs = Date.parse(negotiationStartedAt);
      const messagesDuringNegotiation = transcript.messages.filter(
        (m) => Date.parse(m.dateAdded) >= negotiationStartedAtMs,
      );

      let result: {
        score: number | null;
        classification: string | null;
        hasCriticalError: boolean;
        report: unknown;
      };
      if (messagesDuringNegotiation.length < MIN_MESSAGES_TO_EVALUATE) {
        result = {
          score: null,
          classification: null,
          hasCriticalError: false,
          report: {
            naoAvaliavel: true,
            motivoNaoAvaliavel: `Conversa com apenas ${messagesDuringNegotiation.length} mensagem(ns) de WhatsApp após o início da negociação — sem dados suficientes.`,
            resumo: "",
            notasPorCriterio: {
              precisaoInformacoes: 0,
              entendimentoNecessidade: 0,
              construcaoValor: 0,
              conducaoProximoPasso: 0,
              clarezaComunicacao: 0,
            },
            justificativasPorCriterio: {
              precisaoInformacoes: "",
              entendimentoNecessidade: "",
              construcaoValor: "",
              conducaoProximoPasso: "",
              clarezaComunicacao: "",
            },
            evidencias: [],
            acertos: [],
            falhas: [],
            errosCriticos: [],
            exemploRespostaMelhor: "",
          },
        };
      } else {
        result = await runAuditor(
          transcript.messages,
          computeResponseGapStats(transcript.messages),
          {
            vendedor,
            etapaCrm: opportunity.stage_name,
            valorNegociacao: opportunity.monetary_value,
            qtyPares: opportunity.qty_pares,
            outcome,
            negociacaoIniciadaEm: negotiationStartedAt,
          },
        );
      }

      const { error: insertError } = await supabase
        .from("ghl_negotiation_evaluations")
        .insert({
          opportunity_id: opportunity.id,
          contact_id: opportunity.contact_id,
          vendedor,
          outcome,
          score: result.score,
          classification: result.classification,
          has_critical_error: result.hasCriticalError,
          report: result.report,
          manual_version: MANUAL_VERSION,
          message_count: messagesDuringNegotiation.length,
          negotiation_started_at: negotiationStartedAt,
          resolved_at: opportunity.updated_at,
        });

      if (insertError) {
        console.error(
          `evaluate-negotiations: failed to save evaluation for ${opportunity.id}`,
          insertError,
        );
        errors++;
      } else {
        evaluated++;
      }
    } catch (err) {
      console.error(`evaluate-negotiations: failed to evaluate ${opportunity.id}`, err);
      errors++;
    }
  }

  return NextResponse.json({ success: true, evaluated, skipped, errors });
}
