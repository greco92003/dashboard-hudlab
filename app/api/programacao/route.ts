import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// Environment variables for ActiveCampaign
const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

const headers = {
  "Api-Token": API_TOKEN || "",
  "Content-Type": "application/json",
};

async function fetchJSON(url: string, timeout = 15000) {
  console.log("Fetching URL:", url);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    return await res.json();
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
}

// GET endpoint to fetch stages with won deals organized in Kanban style
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is approved
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    // Validate environment variables
    if (!BASE_URL || !API_TOKEN) {
      return NextResponse.json(
        { error: "ActiveCampaign credentials not configured" },
        { status: 500 }
      );
    }

    console.log("🔍 Fetching stages and won deals for Kanban view...");

    // 1. Fetch all deal stages from ActiveCampaign
    const stagesUrl = `${BASE_URL}/api/3/dealStages`;
    console.log("🌐 Fetching stages from:", stagesUrl);

    let stagesResponse;
    try {
      stagesResponse = await fetchJSON(stagesUrl);
      console.log(`✅ Successfully fetched stages`);
    } catch (error) {
      console.error("❌ Error fetching stages:", error);
      return NextResponse.json(
        {
          error: "Failed to fetch deal stages from ActiveCampaign",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }

    const dealStages = stagesResponse.dealStages || [];
    console.log(`📊 Found ${dealStages.length} deal stages`);

    // 2. Fetch pipelines for context
    const pipelinesUrl = `${BASE_URL}/api/3/dealGroups`;
    let pipelines = [];
    try {
      const pipelinesResponse = await fetchJSON(pipelinesUrl);
      pipelines = pipelinesResponse.dealGroups || [];
      console.log(`✅ Found ${pipelines.length} pipelines`);
    } catch (error) {
      console.warn("⚠️ Could not fetch pipelines:", error);
    }

    // Create a map of pipeline IDs to pipeline names
    const pipelineMap = new Map();
    pipelines.forEach((pipeline: any) => {
      pipelineMap.set(pipeline.id, {
        title: pipeline.title,
        currency: pipeline.currency,
      });
    });

    // 3. Fetch won deals from Supabase cache
    console.log("📦 Fetching won deals from cache...");
    const { data: wonDeals, error: dealsError } = await supabase
      .from("deals_cache")
      .select(
        `
        deal_id,
        title,
        value,
        currency,
        status,
        stage_id,
        closing_date,
        created_date,
        estado,
        "quantidade-de-pares",
        vendedor,
        designer,
        custom_field_54
      `
      )
      .eq("sync_status", "synced")
      .or("status.eq.1,status.eq.won,status.ilike.won")
      .not("closing_date", "is", null)
      .order("closing_date", { ascending: false });

    if (dealsError) {
      console.error("❌ Error fetching won deals:", dealsError);
      return NextResponse.json(
        { error: "Failed to fetch won deals", details: dealsError.message },
        { status: 500 }
      );
    }

    console.log(`✅ Found ${wonDeals?.length || 0} won deals`);

    // 4. Group deals by stage_id
    const dealsByStage = new Map();
    wonDeals?.forEach((deal) => {
      const stageId = deal.stage_id;
      if (!dealsByStage.has(stageId)) {
        dealsByStage.set(stageId, []);
      }
      dealsByStage.get(stageId).push({
        id: deal.deal_id,
        title: deal.title,
        value: deal.value,
        currency: deal.currency,
        closingDate: deal.closing_date,
        createdDate: deal.created_date,
        estado: deal.estado,
        quantidadePares: deal["quantidade-de-pares"],
        vendedor: deal.vendedor,
        designer: deal.designer,
        customField54: deal.custom_field_54,
      });
    });

    // 5. Enhance stages with deals and pipeline information
    const stagesWithDeals = dealStages.map((stage: any) => {
      const pipelineInfo = pipelineMap.get(stage.group);
      const deals = dealsByStage.get(stage.id) || [];

      return {
        id: stage.id,
        title: stage.title,
        order: parseInt(stage.order),
        color: stage.color,
        pipelineId: stage.group,
        pipelineName: pipelineInfo?.title || `Pipeline ${stage.group}`,
        dealsCount: deals.length,
        deals: deals,
      };
    });

    // 6. Group stages by pipeline and sort
    const stagesByPipeline = stagesWithDeals.reduce((acc: any, stage: any) => {
      const pipelineId = stage.pipelineId;
      if (!acc[pipelineId]) {
        acc[pipelineId] = {
          pipelineId,
          pipelineName: stage.pipelineName,
          stages: [],
          totalDeals: 0,
        };
      }
      acc[pipelineId].stages.push(stage);
      acc[pipelineId].totalDeals += stage.dealsCount;
      return acc;
    }, {});

    // Sort stages within each pipeline by order
    Object.values(stagesByPipeline).forEach((pipeline: any) => {
      pipeline.stages.sort((a: any, b: any) => a.order - b.order);
    });

    // 7. Calculate summary statistics
    const totalWonDeals = wonDeals?.length || 0;
    const totalValue =
      wonDeals?.reduce((sum, deal) => sum + (deal.value || 0), 0) || 0;
    const stagesWithDeals_count = stagesWithDeals.filter(
      (s: any) => s.dealsCount > 0
    ).length;

    return NextResponse.json({
      success: true,
      message: "Successfully retrieved stages with won deals",
      summary: {
        totalStages: dealStages.length,
        totalPipelines: pipelines.length,
        totalWonDeals,
        totalValue: totalValue / 100, // Convert from cents
        stagesWithDeals: stagesWithDeals_count,
      },
      pipelines: Object.values(stagesByPipeline),
      debug: {
        timestamp: new Date().toISOString(),
        environment: {
          hasBaseUrl: !!BASE_URL,
          hasApiToken: !!API_TOKEN,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error in programacao endpoint:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        stack: error instanceof Error ? error.stack : null,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
