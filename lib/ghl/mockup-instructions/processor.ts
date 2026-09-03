import "server-only";

import { createHash } from "node:crypto";
import {
  alterationHeadline,
  formatGhlBriefing,
  shouldSkipMockupInstruction,
} from "./briefing";
import { createServiceClient } from "@/lib/supabase/service";
import {
  extractOpportunityFieldValue,
  fetchCustomFieldDefs,
  fetchGhlContactById,
  fetchGhlPipelines,
  fetchOpportunityById,
  searchGhlOpportunitiesByContact,
  updateGhlOpportunity,
} from "@/lib/ghl/api";
import {
  createContactNote,
  fetchMessagesSince,
  findContactNoteByMarker,
  findConversationIdForContact,
  type MockupConversationMessage,
} from "@/lib/ghl/mockup-instructions/ghl-client";
import {
  MOCKUP_AGENT_MODEL,
  MOCKUP_PROMPT_VERSION,
  MOCKUP_TRANSCRIPTION_MODEL,
  runMockupInstructionAgent,
} from "@/lib/ghl/mockup-instructions/agent";

type JsonRecord = Record<string, unknown>;

const TARGET_PIPELINE = "fabrica de mockups";
const INITIAL_STAGE = "mockup prioridade";
const ALTERATION_STAGES = new Set(["alteracao", "alteracao prioridade"]);

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function jsonHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function urlsFromValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(urlsFromValue);
  if (value && typeof value === "object") {
    return Object.values(value as JsonRecord).flatMap(urlsFromValue);
  }
  if (typeof value !== "string") return [];
  return value
    .split(/[\s,\n]+/)
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item));
}

function isConversationContent(message: MockupConversationMessage) {
  return (
    !message.messageType.startsWith("TYPE_ACTIVITY_") &&
    (message.body.trim().length > 0 || message.attachments.length > 0)
  );
}

function instructionChoice(message: MockupConversationMessage) {
  if (message.direction !== "inbound") return null;
  const body = normalize(message.body);
  if (body.includes("quero dar instru")) return "yes" as const;
  if (body.includes("sem instru")) return "no" as const;
  return null;
}

function trimToInstructionAnchor(messages: MockupConversationMessage[]) {
  const anchorIndex = messages.findIndex((message) =>
    instructionChoice(message),
  );
  if (anchorIndex < 0) {
    return { messages, anchor: null as MockupConversationMessage | null };
  }
  return {
    messages: messages.slice(anchorIndex),
    anchor: messages[anchorIndex],
  };
}

function fieldValueMap(
  defs: Array<{ id: string; name: string }>,
  fields: Array<Record<string, unknown> & { id: string }>,
) {
  const nameById = new Map(defs.map((field) => [field.id, field.name]));
  const result = new Map<string, unknown>();
  for (const field of fields) {
    const name = nameById.get(field.id);
    if (!name) continue;
    result.set(normalize(name), extractOpportunityFieldValue(field));
  }
  return result;
}

function contactFieldValueMap(
  defs: Array<{ id: string; name: string }>,
  fields: Array<{ id: string; value: unknown }>,
) {
  const nameById = new Map(defs.map((field) => [field.id, field.name]));
  const result = new Map<string, unknown>();
  for (const field of fields) {
    const name = nameById.get(field.id);
    if (name) result.set(normalize(name), field.value);
  }
  return result;
}

function collectUrls(map: Map<string, unknown>, names: string[]) {
  return Array.from(
    new Set(names.flatMap((name) => urlsFromValue(map.get(normalize(name))))),
  );
}

export type MockupWebhookResult = {
  accepted: boolean;
  duplicate?: boolean;
  runId?: string;
  status?: "completed" | "skipped" | "failed";
  reason?: string;
  summary?: string;
};

export async function processMockupInstructionWebhook(
  payload: JsonRecord,
): Promise<MockupWebhookResult> {
  const payloadOpportunity = record(payload.opportunity);
  const payloadContact = record(payload.contact);
  const customData = record(payload.customData);
  const reprocessKey = firstString(
    customData.reprocess_key,
    customData.reprocessKey,
  );
  const eventType = firstString(payload.type, payload.eventType);
  let opportunityId = firstString(
    payload.opportunityId,
    payload.opportunity_id,
    payloadOpportunity.id,
    customData.opportunityId,
    customData.opportunity_id,
    customData.deal_id,
    eventType?.toLowerCase().includes("opportunity") ? payload.id : null,
  );
  const payloadContactId = firstString(
    payload.contactId,
    payload.contact_id,
    payloadContact.id,
    customData.contactId,
    customData.contact_id,
  );

  const pipelines = await fetchGhlPipelines();
  if (!opportunityId && payloadContactId) {
    const targetPipeline = pipelines.find(
      (item) => normalize(item.name) === TARGET_PIPELINE,
    );
    const targetStageIds = new Set(
      (targetPipeline?.stages ?? [])
        .filter((stage) => {
          const name = normalize(stage.name);
          return name === INITIAL_STAGE || ALTERATION_STAGES.has(name);
        })
        .map((stage) => stage.id),
    );
    const candidates = await searchGhlOpportunitiesByContact(payloadContactId);
    opportunityId =
      candidates
        .filter(
          (candidate) =>
            candidate.pipelineId === targetPipeline?.id &&
            Boolean(candidate.pipelineStageId) &&
            targetStageIds.has(candidate.pipelineStageId as string),
        )
        .sort((left, right) =>
          (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
        )[0]?.id ?? null;
  }
  if (!opportunityId)
    return { accepted: false, reason: "missing_opportunity_id" };

  const opportunity = await fetchOpportunityById(opportunityId);
  if (
    !opportunity.contactId ||
    !opportunity.pipelineId ||
    !opportunity.pipelineStageId
  ) {
    return { accepted: false, reason: "incomplete_opportunity" };
  }

  const pipeline = pipelines.find((item) => item.id === opportunity.pipelineId);
  const stage = pipeline?.stages?.find(
    (item) => item.id === opportunity.pipelineStageId,
  );
  const pipelineName = pipeline?.name ?? "";
  const stageName = stage?.name ?? "";
  const normalizedStage = normalize(stageName);
  if (
    normalize(pipelineName) !== TARGET_PIPELINE ||
    (normalizedStage !== INITIAL_STAGE &&
      !ALTERATION_STAGES.has(normalizedStage))
  ) {
    return { accepted: false, reason: "stage_not_in_scope" };
  }

  const instructionType =
    normalizedStage === INITIAL_STAGE
      ? ("initial" as const)
      : ("alteration" as const);
  const eventKey = [
    "mockup-instruction",
    opportunity.id,
    opportunity.pipelineStageId,
    reprocessKey
      ? `reprocess:${reprocessKey}`
      : opportunity.lastStageChangeAt ||
        firstString(payload.timestamp, customData.timestamp) ||
        jsonHash(payload),
  ].join(":");
  const supabase = createServiceClient() as any;

  const runInsert = {
    event_key: eventKey,
    opportunity_id: opportunity.id,
    contact_id: opportunity.contactId,
    opportunity_name: opportunity.name,
    pipeline_id: opportunity.pipelineId,
    pipeline_stage_id: opportunity.pipelineStageId,
    stage_name: stageName,
    instruction_type: instructionType,
    status: "processing",
    model: MOCKUP_AGENT_MODEL,
    transcription_model: MOCKUP_TRANSCRIPTION_MODEL,
    prompt_version: MOCKUP_PROMPT_VERSION,
    raw_payload: payload,
  };
  const { data: inserted, error: insertError } = await supabase
    .from("ghl_mockup_instruction_runs")
    .insert(runInsert)
    .select("id,status,summary,prompt_version")
    .single();

  let run = inserted as {
    id: string;
    status: string;
    summary: string | null;
    prompt_version?: string | null;
  } | null;
  if (insertError?.code === "23505") {
    const { data: existing, error } = await supabase
      .from("ghl_mockup_instruction_runs")
      .select("id,status,summary,prompt_version")
      .eq("event_key", eventKey)
      .single();
    if (error) throw error;
    if (
      (existing.status === "completed" || existing.status === "skipped") &&
      existing.prompt_version === MOCKUP_PROMPT_VERSION
    ) {
      return {
        accepted: true,
        duplicate: true,
        runId: existing.id,
        status: existing.status,
        summary: existing.summary ?? undefined,
      };
    }
    run = existing;
    await supabase
      .from("ghl_mockup_instruction_runs")
      .update({
        status: "processing",
        prompt_version: MOCKUP_PROMPT_VERSION,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else if (insertError) {
    throw insertError;
  }
  if (!run) throw new Error("Failed to claim mockup instruction run");

  try {
    const [opportunityDefs, contactDefs, contact, cacheResponse] =
      await Promise.all([
        fetchCustomFieldDefs("opportunity"),
        fetchCustomFieldDefs("contact"),
        fetchGhlContactById(opportunity.contactId),
        supabase
          .from("ghl_mockup_conversation_cache")
          .select("*")
          .eq("opportunity_id", opportunity.id)
          .maybeSingle(),
      ]);
    if (cacheResponse.error) throw cacheResponse.error;
    const cache = cacheResponse.data as any | null;
    const opportunityValues = fieldValueMap(
      opportunityDefs,
      (opportunity.customFields ?? []) as Array<
        Record<string, unknown> & { id: string }
      >,
    );
    const contactValues = contactFieldValueMap(
      contactDefs,
      (contact.customFields ?? []) as Array<{ id: string; value: unknown }>,
    );

    const wantsInstructions = normalize(
      String(
        opportunityValues.get(normalize("Quer dar Instrução de Mockup?")) ?? "",
      ),
    );
    if (shouldSkipMockupInstruction(instructionType, wantsInstructions)) {
      await supabase
        .from("ghl_mockup_instruction_runs")
        .update({
          status: "skipped",
          skip_reason: "quer_dar_instrucao_nao",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      return {
        accepted: true,
        runId: run.id,
        status: "skipped",
        reason: "instructions_not_requested",
      };
    }

    const conversationId =
      cache?.conversation_id ??
      (await findConversationIdForContact(opportunity.contactId));
    if (!conversationId)
      throw new Error("No GHL conversation found for contact");
    const fetched = await fetchMessagesSince(
      conversationId,
      reprocessKey ? null : (cache?.last_message_id ?? null),
    );
    let messages = fetched.messages.filter(isConversationContent);
    let anchor = null as MockupConversationMessage | null;
    if (reprocessKey && cache?.anchor_message_at) {
      const anchorTimestamp = Date.parse(cache.anchor_message_at);
      messages = messages.filter(
        (message) => Date.parse(message.dateAdded) >= anchorTimestamp,
      );
    } else if (!cache) {
      const trimmed = trimToInstructionAnchor(messages);
      messages = trimmed.messages;
      anchor = trimmed.anchor;
    }
    const newestMessage = messages[messages.length - 1] ?? null;

    const sourceFields = {
      mockupLogotipo: Array.from(
        new Set([
          ...collectUrls(contactValues, [
            "mockup_logotipo",
            "mockup_logotipo_pdf",
            "Logotipo Reenviado",
            "Logotipo",
          ]),
          ...collectUrls(opportunityValues, [
            "Logotipo",
            "Logo Mock Automatico",
            "Logotipo Alterado",
          ]),
        ]),
      ),
      linkMockup: Array.from(
        new Set([
          ...collectUrls(contactValues, ["Link Mockup", "mockup_url"]),
          ...collectUrls(opportunityValues, [
            "Link Mockup Negócio",
            "Link Drive Mockup",
            "Link Mockup Automatico",
          ]),
        ]),
      ),
      linkAlteracaoMockup: Array.from(
        new Set([
          ...collectUrls(contactValues, ["Link Alteração Mockup"]),
          ...collectUrls(opportunityValues, [
            "Link Mockup Alterado Negócio",
            "Link Drive Mockup Alteracao",
          ]),
        ]),
      ),
    };

    const agent = await runMockupInstructionAgent({
      opportunityName: opportunity.name,
      stageName,
      instructionType,
      previousSummary: cache?.context_summary ?? null,
      messages,
      sourceFields,
    });

    const summaryField = opportunityDefs.find(
      (field) =>
        normalize(field.name) === normalize("Instrução Mockup Resumo IA"),
    );
    if (!summaryField)
      throw new Error("GHL field 'Instrução Mockup Resumo IA' was not found");
    const ghlSummary = formatGhlBriefing(
      agent.result.resumo,
      alterationHeadline(agent.result),
    );
    await updateGhlOpportunity(opportunity.id, {
      customFields: [{ id: summaryField.id, fieldValue: ghlSummary }],
    });

    const marker = `[HUDLAB_MOCKUP_IA:${eventKey}]`;
    let noteId = await findContactNoteByMarker(opportunity.contactId, marker);
    if (!noteId) {
      noteId = await createContactNote({
        contactId: opportunity.contactId,
        title: `Instrução Mockup IA — ${stageName}`,
        body: `${ghlSummary}\n\nGerado automaticamente em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.\nNegócio: ${opportunity.name} (${opportunity.id})\n${marker}`,
      });
    }

    const now = new Date().toISOString();
    const cachePayload = {
      opportunity_id: opportunity.id,
      contact_id: opportunity.contactId,
      conversation_id: conversationId,
      anchor_message_id: cache?.anchor_message_id ?? anchor?.id ?? null,
      anchor_message_at: cache?.anchor_message_at ?? anchor?.dateAdded ?? null,
      last_message_id: newestMessage?.id ?? cache?.last_message_id ?? null,
      last_message_at:
        newestMessage?.dateAdded ?? cache?.last_message_at ?? null,
      context_summary: agent.result.resumo,
      last_stage_name: stageName,
      last_run_id: run.id,
      updated_at: now,
    };
    const { error: cacheError } = await supabase
      .from("ghl_mockup_conversation_cache")
      .upsert(cachePayload, { onConflict: "opportunity_id" });
    if (cacheError) throw cacheError;

    const { error: updateError } = await supabase
      .from("ghl_mockup_instruction_runs")
      .update({
        conversation_id: conversationId,
        status: "completed",
        summary: agent.result.resumo,
        result_json: agent.result,
        cache_hit: Boolean(cache && fetched.watermarkFound),
        messages_read: fetched.totalFetched,
        new_messages_processed: messages.length,
        images_processed: agent.stats.images,
        audios_processed: agent.stats.audios,
        source_fields: sourceFields,
        note_id: noteId,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", run.id);
    if (updateError) throw updateError;

    return {
      accepted: true,
      runId: run.id,
      status: "completed",
      summary: agent.result.resumo,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown processing error";
    await supabase
      .from("ghl_mockup_instruction_runs")
      .update({
        status: "failed",
        error_message: errorMessage.slice(0, 2000),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    console.error("Mockup instruction processing failed", {
      opportunityId,
      runId: run.id,
      error: errorMessage,
    });
    return {
      accepted: true,
      runId: run.id,
      status: "failed",
      reason: errorMessage,
    };
  }
}
