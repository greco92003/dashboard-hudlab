import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const DEFAULT_CUTOFF = "2026-08-11T18:23:56.739Z";
const PAGE_SIZE = 1000;
const STAGES = {
  lead: "Lead",
  commockautomatico: "Com Mockup Automático",
  semmockautomatico: "Sem Mockup Automático",
  solicitouorcamento: "Solicitou Orçamento",
  solicitoumockupoficial: "Solicitou Mockup Oficial",
  emnegociacao: "Em Negociação",
  negociofechado: "Negócio Fechado",
};

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function stageFromTag(tag) {
  const normalized = normalize(tag);
  if (normalized in STAGES) return normalized;
  if (normalized === "solicitoumockoficial") return "solicitoumockupoficial";
  return null;
}

function isTimestampInWindow(value, cutoffMs, endMs) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > cutoffMs && timestamp <= endMs;
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function fetchAll(buildQuery) {
  const rows = [];
  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function bestOpportunity(opportunities, stage, cutoffMs, endMs) {
  const sorted = [...opportunities].sort(
    (a, b) => Date.parse(b.updated_at ?? 0) - Date.parse(a.updated_at ?? 0),
  );

  if (stage === "negociofechado") {
    return sorted.find(
      (opp) =>
        opp.status === "won" &&
        isTimestampInWindow(opp.won_at, cutoffMs, endMs),
    );
  }

  if (stage === "emnegociacao") {
    return sorted.find(
      (opp) =>
        normalize(opp.stage_name).includes("negociacao") &&
        isTimestampInWindow(opp.stage_changed_at, cutoffMs, endMs),
    );
  }

  return sorted[0] ?? null;
}

function inferTimestamp({ contact, opportunities, stage, cutoffMs, endMs }) {
  if (stage === "lead" && isTimestampInWindow(contact.created_at, cutoffMs, endMs)) {
    return {
      occurred_at: new Date(contact.created_at).toISOString(),
      confidence: "exact",
      source: "ghl_contacts.created_at",
      reason: "O contato foi criado durante a interrupção.",
    };
  }

  const opportunity = bestOpportunity(opportunities, stage, cutoffMs, endMs);
  if (
    stage === "negociofechado" &&
    opportunity &&
    isTimestampInWindow(opportunity.won_at, cutoffMs, endMs)
  ) {
    return {
      occurred_at: new Date(opportunity.won_at).toISOString(),
      confidence: "exact",
      source: "ghl_opportunities.won_at",
      reason: "O GHL registrou a mudança de status para won nesse horário.",
    };
  }

  if (
    stage === "emnegociacao" &&
    opportunity &&
    isTimestampInWindow(opportunity.stage_changed_at, cutoffMs, endMs)
  ) {
    return {
      occurred_at: new Date(opportunity.stage_changed_at).toISOString(),
      confidence: "strong",
      source: "ghl_opportunities.stage_changed_at",
      reason: "A oportunidade está em Negociação e a última mudança ocorreu na janela.",
    };
  }

  const contactUpdatedAt = contact.raw?.dateUpdated;
  if (isTimestampInWindow(contactUpdatedAt, cutoffMs, endMs)) {
    return {
      occurred_at: new Date(contactUpdatedAt).toISOString(),
      confidence: "estimated",
      source: "ghl_contacts.raw.dateUpdated",
      reason: "A tag existe e a última atualização do contato ocorreu na janela; não há horário próprio da tag.",
    };
  }

  if (
    opportunity &&
    isTimestampInWindow(opportunity.stage_changed_at, cutoffMs, endMs)
  ) {
    return {
      occurred_at: new Date(opportunity.stage_changed_at).toISOString(),
      confidence: "estimated",
      source: "ghl_opportunities.stage_changed_at",
      reason: "A tag existe e a oportunidade mudou de estágio na janela; o horário da tag não está disponível.",
    };
  }

  return {
    occurred_at: null,
    confidence: "unresolved",
    source: null,
    reason: "O estado atual comprova o marco, mas não há timestamp dentro da janela.",
  };
}

async function main() {
  const applyRequested = process.argv.includes("--apply");
  const cutoff = argValue("cutoff", DEFAULT_CUTOFF);
  const end = argValue("end", new Date().toISOString());
  const cutoffMs = Date.parse(cutoff);
  const endMs = Date.parse(end);
  if (!Number.isFinite(cutoffMs) || !Number.isFinite(endMs) || endMs <= cutoffMs) {
    throw new Error("Janela inválida. Use --cutoff=<ISO> e --end=<ISO>.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.DASHBOARD_SECRET;
  if (!supabaseUrl || !secret) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e DASHBOARD_SECRET são obrigatórios.");
  }

  const db = createClient(supabaseUrl, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [contacts, opportunities, existingEvents, snapshots, importedRows] = await Promise.all([
    fetchAll(() =>
      db
        .from("ghl_contacts")
        .select("id,created_at,qty_pares,raw,synced_at")
        .order("id", { ascending: true }),
    ),
    fetchAll(() =>
      db
        .from("ghl_opportunities")
        .select(
          "id,contact_id,stage_id,stage_name,status,created_at,updated_at,stage_changed_at,won_at,qty_pares",
        )
        .order("id", { ascending: true }),
    ),
    fetchAll(() =>
      db
        .from("ghl_funnel_events")
        .select("contact_id,stage_slug,received_at")
        .order("id", { ascending: true }),
    ),
    fetchAll(() =>
      db
        .from("ghl_stage_snapshots")
        .select("snapshot_date,opportunity_id,stage_id,stage_name,status")
        .gte("snapshot_date", cutoff.slice(0, 10))
        .order("opportunity_id", { ascending: true }),
    ),
    fetchAll(() =>
      db
        .from("v_contatos_importados")
        .select("contact_id")
        .order("contact_id", { ascending: true }),
    ),
  ]);

  const opportunitiesByContact = new Map();
  const affectedContactIds = new Set();
  for (const opportunity of opportunities) {
    if (!opportunity.contact_id) continue;
    const list = opportunitiesByContact.get(opportunity.contact_id) ?? [];
    list.push(opportunity);
    opportunitiesByContact.set(opportunity.contact_id, list);
    if (
      isTimestampInWindow(opportunity.created_at, cutoffMs, endMs) ||
      isTimestampInWindow(opportunity.updated_at, cutoffMs, endMs) ||
      isTimestampInWindow(opportunity.stage_changed_at, cutoffMs, endMs) ||
      isTimestampInWindow(opportunity.won_at, cutoffMs, endMs)
    ) {
      affectedContactIds.add(opportunity.contact_id);
    }
  }

  for (const contact of contacts) {
    if (
      isTimestampInWindow(contact.created_at, cutoffMs, endMs) ||
      isTimestampInWindow(contact.raw?.dateUpdated, cutoffMs, endMs)
    ) {
      affectedContactIds.add(contact.id);
    }
  }

  const existingKeys = new Set(
    existingEvents.map((event) => `${event.contact_id}:${event.stage_slug}`),
  );
  const importedContactIds = new Set(importedRows.map((row) => row.contact_id));
  const snapshotsByOpportunity = new Map();
  for (const snapshot of snapshots) {
    const list = snapshotsByOpportunity.get(snapshot.opportunity_id) ?? [];
    list.push(snapshot);
    snapshotsByOpportunity.set(snapshot.opportunity_id, list);
  }

  const candidates = [];
  const excludedImported = [];
  let alreadyRecorded = 0;
  for (const contact of contacts) {
    if (!affectedContactIds.has(contact.id)) continue;
    const tags = Array.isArray(contact.raw?.tags) ? contact.raw.tags : [];
    if (importedContactIds.has(contact.id)) {
      excludedImported.push({
        contact_id: contact.id,
        reason: "classificado por public.v_contatos_importados",
      });
      continue;
    }

    const stages = new Set(tags.map(stageFromTag).filter(Boolean));
    const contactOpportunities = opportunitiesByContact.get(contact.id) ?? [];
    for (const stage of stages) {
      const key = `${contact.id}:${stage}`;
      if (existingKeys.has(key)) {
        alreadyRecorded += 1;
        continue;
      }

      const inference = inferTimestamp({
        contact,
        opportunities: contactOpportunities,
        stage,
        cutoffMs,
        endMs,
      });
      const relatedOpportunity = bestOpportunity(
        contactOpportunities,
        stage,
        cutoffMs,
        endMs,
      );
      candidates.push({
        contact_id: contact.id,
        stage_slug: stage,
        stage_name: STAGES[stage],
        ...inference,
        eligible_for_automatic_backfill:
          inference.confidence === "exact" || inference.confidence === "strong",
        opportunity_id: relatedOpportunity?.id ?? null,
        current_pipeline_stage: relatedOpportunity?.stage_name ?? null,
        quantidade_pares:
          relatedOpportunity?.qty_pares ?? contact.qty_pares ?? null,
        snapshots: relatedOpportunity
          ? snapshotsByOpportunity.get(relatedOpportunity.id) ?? []
          : [],
      });
    }
  }

  candidates.sort((a, b) => {
    const byTime = String(a.occurred_at ?? "9999").localeCompare(
      String(b.occurred_at ?? "9999"),
    );
    return byTime || a.contact_id.localeCompare(b.contact_id) || a.stage_slug.localeCompare(b.stage_slug);
  });

  const eligibleCandidates = candidates.filter(
    (candidate) => candidate.eligible_for_automatic_backfill,
  );
  const runId = `ghl-funnel-${new Date().toISOString()}`;
  const application = {
    requested: applyRequested,
    run_id: runId,
    inserted: [],
    skipped_after_recheck: [],
  };

  if (applyRequested) {
    const confirmation = Number.parseInt(argValue("confirm", ""), 10);
    if (confirmation !== eligibleCandidates.length) {
      throw new Error(
        `Confirmação inválida: há ${eligibleCandidates.length} candidatos elegíveis. ` +
          `Execute novamente com --apply --confirm=${eligibleCandidates.length}.`,
      );
    }

    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    for (const candidate of eligibleCandidates) {
      const { data: duplicate, error: duplicateError } = await db
        .from("ghl_funnel_events")
        .select("id")
        .eq("contact_id", candidate.contact_id)
        .eq("stage_slug", candidate.stage_slug)
        .limit(1)
        .maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) {
        application.skipped_after_recheck.push({
          contact_id: candidate.contact_id,
          stage_slug: candidate.stage_slug,
          existing_id: duplicate.id,
        });
        continue;
      }

      const contact = contactsById.get(candidate.contact_id);
      const raw = contact?.raw ?? {};
      const tags = Array.isArray(raw.tags) ? raw.tags : [];
      const { data: inserted, error: insertError } = await db
        .from("ghl_funnel_events")
        .insert({
          event_type: "backfill_reconstructed",
          stage_slug: candidate.stage_slug,
          stage_name: candidate.stage_name,
          contact_id: candidate.contact_id,
          contact_name:
            raw.firstName || raw.lastName
              ? [raw.firstName, raw.lastName].filter(Boolean).join(" ")
              : null,
          contact_email: raw.email ?? null,
          contact_phone: raw.phone ?? null,
          contact_company_name: raw.companyName ?? null,
          quantidade_pares: candidate.quantidade_pares,
          tags,
          location_id: raw.locationId ?? process.env.GHL_LOCATION_ID ?? null,
          workflow_name: "Backfill da interrupção de 2026-08-11",
          contact_created_at: contact?.created_at ?? null,
          received_at: candidate.occurred_at,
          raw_payload: {
            backfill: {
              run_id: runId,
              generated_at: new Date().toISOString(),
              confidence: candidate.confidence,
              timestamp_source: candidate.source,
              reason: candidate.reason,
              opportunity_id: candidate.opportunity_id,
              reversible: true,
            },
          },
        })
        .select("id,contact_id,stage_slug,received_at")
        .single();
      if (insertError) throw insertError;
      application.inserted.push(inserted);
    }
  }

  const confidenceCounts = candidates.reduce((counts, candidate) => {
    counts[candidate.confidence] = (counts[candidate.confidence] ?? 0) + 1;
    return counts;
  }, {});
  const stageCounts = candidates.reduce((counts, candidate) => {
    counts[candidate.stage_slug] = (counts[candidate.stage_slug] ?? 0) + 1;
    return counts;
  }, {});
  const report = {
    generated_at: new Date().toISOString(),
    mode: applyRequested ? "apply-reviewed-candidates" : "dry-run",
    window: { cutoff: new Date(cutoffMs).toISOString(), end: new Date(endMs).toISOString() },
    methodology: {
      candidate_scope: "Contatos criados/atualizados ou com oportunidades alteradas durante a interrupção.",
      duplicate_rule: "contact_id + stage_slug já existente é ignorado.",
      import_rule: "Contatos classificados por public.v_contatos_importados são excluídos.",
      automatic_rule: "Somente confiança exact/strong é elegível para gravação automática após revisão.",
    },
    summary: {
      contacts_scanned: contacts.length,
      opportunities_scanned: opportunities.length,
      affected_contacts: affectedContactIds.size,
      existing_events: existingEvents.length,
      already_recorded_pairs: alreadyRecorded,
      excluded_imported_contacts: excludedImported.length,
      candidates: candidates.length,
      eligible_for_automatic_backfill: eligibleCandidates.length,
      inserted: application.inserted.length,
      skipped_after_recheck: application.skipped_after_recheck.length,
      by_confidence: confidenceCounts,
      by_stage: stageCounts,
    },
    candidates,
    excluded_imported: excludedImported,
    application,
  };

  const outputDir = path.resolve(argValue("output-dir", "backfill-reports"));
  await fs.mkdir(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const jsonPath = path.join(outputDir, `ghl-funnel-backfill-${stamp}.json`);
  const csvPath = path.join(outputDir, `ghl-funnel-backfill-${stamp}.csv`);
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const columns = [
    "contact_id",
    "stage_slug",
    "stage_name",
    "occurred_at",
    "confidence",
    "source",
    "eligible_for_automatic_backfill",
    "opportunity_id",
    "current_pipeline_stage",
    "quantidade_pares",
    "reason",
  ];
  const csv = [
    columns.map(csvCell).join(","),
    ...candidates.map((candidate) =>
      columns.map((column) => csvCell(candidate[column])).join(","),
    ),
  ].join("\n");
  await fs.writeFile(csvPath, `${csv}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ...report.summary,
        json_report: jsonPath,
        csv_report: csvPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
