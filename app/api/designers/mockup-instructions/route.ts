import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { createServiceClient } from "@/lib/supabase/service";
import {
  extractOpportunityFieldValue,
  fetchCustomFieldDefs,
  fetchGhlPipelines,
  searchGhlOpportunitiesByStage,
} from "@/lib/ghl/api";
import { fetchMessagesSince } from "@/lib/ghl/mockup-instructions/ghl-client";

const TARGET_PIPELINE = "fábrica de mockups";
const TARGET_STAGES = [
  "mockup prioridade",
  "alteração",
  "alteração prioridade",
];

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function isImageUrl(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(?:avif|gif|jpe?g|png|webp)$/.test(pathname);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  try {
    const requestedDealId = new URL(request.url).searchParams.get("deal");
    const [pipelines, fieldDefs] = await Promise.all([
      fetchGhlPipelines(),
      fetchCustomFieldDefs("opportunity"),
    ]);
    const pipeline = pipelines.find(
      (item) => normalized(item.name) === TARGET_PIPELINE,
    );
    if (!pipeline)
      throw new Error("Pipeline 'Fábrica de Mockups' não encontrado");
    const stages = (pipeline.stages ?? []).filter((stage) =>
      TARGET_STAGES.includes(normalized(stage.name)),
    );
    if (stages.length !== TARGET_STAGES.length) {
      throw new Error(
        "Uma ou mais etapas de mockup não foram encontradas no GHL",
      );
    }

    const opportunities = (
      await Promise.all(
        stages.map(async (stage) =>
          (await searchGhlOpportunitiesByStage(pipeline.id, stage.id)).map(
            (opportunity) => ({ opportunity, stage }),
          ),
        ),
      )
    ).flat();
    const opportunityIds = opportunities.map(
      ({ opportunity }) => opportunity.id,
    );
    const supabase = createServiceClient() as any;
    const [runsResponse, cachesResponse] = opportunityIds.length
      ? await Promise.all([
          supabase
            .from("ghl_mockup_instruction_runs")
            .select(
              "id,opportunity_id,stage_name,instruction_type,status,summary,result_json,cache_hit,messages_read,new_messages_processed,images_processed,audios_processed,skip_reason,error_message,created_at,completed_at",
            )
            .in("opportunity_id", opportunityIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("ghl_mockup_conversation_cache")
            .select(
              "opportunity_id,conversation_id,anchor_message_at,last_message_at,updated_at",
            )
            .in("opportunity_id", opportunityIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
    if (runsResponse.error) throw runsResponse.error;
    if (cachesResponse.error) throw cachesResponse.error;

    const runsByOpportunity = new Map<string, any[]>();
    for (const run of runsResponse.data ?? []) {
      const list = runsByOpportunity.get(run.opportunity_id) ?? [];
      list.push(run);
      runsByOpportunity.set(run.opportunity_id, list);
    }
    const cacheByOpportunity = new Map<string, any>(
      (cachesResponse.data ?? []).map((cache: any) => [
        cache.opportunity_id,
        cache,
      ]),
    );
    const summaryFieldId = fieldDefs.find(
      (field) => normalized(field.name) === "instrução mockup resumo ia",
    )?.id;

    const deals = await Promise.all(
      opportunities
        .filter(
          ({ opportunity }) =>
            !requestedDealId || opportunity.id === requestedDealId,
        )
        .map(({ opportunity, stage }) => {
          const history = runsByOpportunity.get(opportunity.id) ?? [];
          const cache = cacheByOpportunity.get(opportunity.id);
          const fieldEntry = opportunity.customFields?.find(
            (field) => field.id === summaryFieldId,
          );
          return {
            id: opportunity.id,
            name: opportunity.name,
            contactId: opportunity.contactId,
            contactName: opportunity.contact?.name ?? null,
            email: opportunity.contact?.email ?? null,
            phone: opportunity.contact?.phone ?? null,
            monetaryValue: opportunity.monetaryValue,
            stageId: stage.id,
            stageName: stage.name,
            updatedAt: opportunity.updatedAt,
            currentSummary: fieldEntry
              ? extractOpportunityFieldValue(fieldEntry)
              : (history.find((run) => run.status === "completed")?.summary ??
                null),
            conversationId: cache?.conversation_id ?? null,
            anchorMessageAt: cache?.anchor_message_at ?? null,
            cacheUpdatedAt: cache?.updated_at ?? null,
            lastMessageAt: cache?.last_message_at ?? null,
            history,
            conversationMedia: [] as Array<{
              id: string;
              url: string;
              messageId: string;
              direction: "inbound" | "outbound";
              dateAdded: string;
            }>,
          };
        })
        .map(async (deal) => {
          if (!requestedDealId || !deal.conversationId) return deal;
          const fetched = await fetchMessagesSince(deal.conversationId, null);
          deal.conversationMedia = fetched.messages
            .filter(
              (message) =>
                !deal.anchorMessageAt ||
                Date.parse(message.dateAdded) >=
                  Date.parse(deal.anchorMessageAt),
            )
            .flatMap((message) =>
              message.attachments
                .filter(isImageUrl)
                .map((url, attachmentIndex) => ({
                  id: `${message.id}:${attachmentIndex}`,
                  url,
                  messageId: message.id,
                  direction: message.direction,
                  dateAdded: message.dateAdded,
                })),
            );
          return deal;
        }),
    );

    deals.sort((left, right) => {
      const stageOrder = TARGET_STAGES.indexOf(normalized(left.stageName));
      const otherStageOrder = TARGET_STAGES.indexOf(
        normalized(right.stageName),
      );
      if (stageOrder !== otherStageOrder) return stageOrder - otherStageOrder;
      return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
    });

    return NextResponse.json(
      {
        deals,
        meta: {
          total: deals.length,
          generatedAt: new Date().toISOString(),
          pipeline: { id: pipeline.id, name: pipeline.name },
          stages: stages.map((stage) => ({ id: stage.id, name: stage.name })),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Mockup instruction dashboard failed", error);
    return NextResponse.json(
      {
        error: "Não foi possível carregar as instruções de mockup.",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
