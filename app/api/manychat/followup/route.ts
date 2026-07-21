import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { createClient } from "@supabase/supabase-js";

export interface FollowUpLead {
  subscriber_id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  quantidade_pares: number | null;
  stage_slug: string;
  stage_name: string;
  stage_order: number;
  occurred_at: string;
}

export interface FollowUpData {
  listaA: FollowUpLead[];
  listaB: FollowUpLead[];
  listaC: FollowUpLead[];
  archived: FollowUpLead[];
}

const STAGE_ORDER: Record<string, number> = {
  lead: 1,
  emailcoletado: 2,
  viumockupautomatico: 3,
  conheceumodeloseprecos: 4,
  solicitouorcamento: 5,
  informouquantidade: 6,
  informouestado: 7,
  orcamentogerado: 8,
  solicitoumockupoficial: 9,
  negociofechado: 10,
};

export async function GET() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = getSupabaseSecretKey();

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ listaA: [], listaB: [], listaC: [], archived: [] });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all tag events
    const { data: events, error } = await supabase
      .from("manychat_tag_events")
      .select("subscriber_id, nome, telefone, email, quantidade_pares, stage_slug, stage_name, occurred_at")
      .order("occurred_at", { ascending: false });

    if (error) throw error;

    // Get archived leads
    const { data: archivedRows } = await supabase
      .from("manychat_archived_leads")
      .select("subscriber_id, lista_origem");

    const archivedSet = new Set((archivedRows ?? []).map((r) => r.subscriber_id));

    // Build map: subscriber_id -> highest stage event
    const leadMap = new Map<string, FollowUpLead>();
    for (const ev of events ?? []) {
      const order = STAGE_ORDER[ev.stage_slug] ?? 0;
      const existing = leadMap.get(ev.subscriber_id);
      if (!existing || order > (STAGE_ORDER[existing.stage_slug] ?? 0)) {
        leadMap.set(ev.subscriber_id, {
          subscriber_id: ev.subscriber_id,
          nome: ev.nome,
          telefone: ev.telefone,
          email: ev.email,
          quantidade_pares: ev.quantidade_pares,
          stage_slug: ev.stage_slug,
          stage_name: ev.stage_name,
          stage_order: order,
          occurred_at: ev.occurred_at,
        });
      }
      // Merge contact fields from earlier events if missing in latest
      const lead = leadMap.get(ev.subscriber_id)!;
      if (!lead.nome && ev.nome) lead.nome = ev.nome;
      if (!lead.telefone && ev.telefone) lead.telefone = ev.telefone;
      if (!lead.email && ev.email) lead.email = ev.email;
      if (lead.quantidade_pares === null && ev.quantidade_pares !== null)
        lead.quantidade_pares = ev.quantidade_pares;
    }

    const allLeads = Array.from(leadMap.values());

    // Active leads (not archived) that haven't reached Solicitou Mockup Oficial (stage 9)
    const activeNotMockup = allLeads.filter(
      (l) => !archivedSet.has(l.subscriber_id) && l.stage_order < 9
    );

    // LISTA A: >= 36 pares, not reached mockup oficial
    const listaA = activeNotMockup.filter(
      (l) => l.quantidade_pares !== null && l.quantidade_pares >= 36
    );

    // LISTA B: < 36 pares, not reached mockup oficial
    const listaB = activeNotMockup.filter(
      (l) => l.quantidade_pares !== null && l.quantidade_pares < 36
    );

    // LISTA C: highest stage is "conheceumodeloseprecos" (stage 4), not archived
    const listaC = allLeads.filter(
      (l) =>
        !archivedSet.has(l.subscriber_id) &&
        l.stage_slug === "conheceumodeloseprecos"
    );

    // Archived leads with full data
    const archivedLeads = allLeads.filter((l) => archivedSet.has(l.subscriber_id));

    // Sort by quantidade_pares descending, then by occurred_at descending
    const sortLeads = (arr: FollowUpLead[]) =>
      arr.sort((a, b) => {
        const pa = a.quantidade_pares ?? -1;
        const pb = b.quantidade_pares ?? -1;
        if (pb !== pa) return pb - pa;
        return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
      });

    return NextResponse.json({
      listaA: sortLeads(listaA),
      listaB: sortLeads(listaB),
      listaC: sortLeads(listaC),
      archived: sortLeads(archivedLeads),
    } satisfies FollowUpData);
  } catch (error) {
    console.error("[FollowUp] Error:", error);
    return NextResponse.json({ error: "Erro ao buscar leads" }, { status: 500 });
  }
}
