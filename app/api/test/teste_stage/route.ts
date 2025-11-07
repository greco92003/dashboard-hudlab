import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Environment variables
const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

const headers = {
  "Api-Token": API_TOKEN || "",
  "Content-Type": "application/json",
};

// Create Supabase client with service role key
async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

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

// GET endpoint to list all deal stages from ActiveCampaign
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is approved and has permission
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    const allowedRoles = ["owner", "admin"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Validate environment variables
    if (!BASE_URL || !API_TOKEN) {
      return NextResponse.json(
        { error: "ActiveCampaign credentials not configured" },
        { status: 500 }
      );
    }

    console.log("🔍 Fetching all deal stages from ActiveCampaign...");

    // Fetch all deal stages using the ActiveCampaign API
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
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    const dealStages = stagesResponse.dealStages || [];
    const totalStages = stagesResponse.meta?.total || dealStages.length;

    console.log(`📊 Found ${totalStages} deal stages`);

    // Also fetch pipelines to provide context for the stages
    const pipelinesUrl = `${BASE_URL}/api/3/dealGroups`;
    console.log("🔗 Fetching pipelines from:", pipelinesUrl);

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
        autoassign: pipeline.autoassign,
      });
    });

    // Enhance stages with pipeline information
    const enhancedStages = dealStages.map((stage: any) => {
      const pipelineInfo = pipelineMap.get(stage.group);
      return {
        id: stage.id,
        title: stage.title,
        order: stage.order,
        color: stage.color,
        width: stage.width,
        dealOrder: stage.dealOrder,
        pipelineId: stage.group,
        pipelineName: pipelineInfo?.title || `Pipeline ${stage.group}`,
        cardRegion1: stage.cardRegion1,
        cardRegion2: stage.cardRegion2,
        cardRegion3: stage.cardRegion3,
        cardRegion4: stage.cardRegion4,
        cardRegion5: stage.cardRegion5,
        createdAt: stage.cdate,
        updatedAt: stage.udate,
      };
    });

    // Group stages by pipeline
    const stagesByPipeline = enhancedStages.reduce((acc: any, stage: any) => {
      const pipelineId = stage.pipelineId;
      if (!acc[pipelineId]) {
        acc[pipelineId] = {
          pipelineId,
          pipelineName: stage.pipelineName,
          stages: [],
        };
      }
      acc[pipelineId].stages.push(stage);
      return acc;
    }, {});

    // Sort stages within each pipeline by order
    Object.values(stagesByPipeline).forEach((pipeline: any) => {
      pipeline.stages.sort((a: any, b: any) => parseInt(a.order) - parseInt(b.order));
    });

    return NextResponse.json({
      success: true,
      message: `Successfully retrieved ${totalStages} deal stages`,
      summary: {
        totalStages,
        totalPipelines: pipelines.length,
        stagesPerPipeline: Object.keys(stagesByPipeline).length,
      },
      stagesByPipeline: Object.values(stagesByPipeline),
      allStages: enhancedStages,
      pipelines: pipelines.map((pipeline: any) => ({
        id: pipeline.id,
        title: pipeline.title,
        currency: pipeline.currency,
        autoassign: pipeline.autoassign,
        stageCount: stagesByPipeline[pipeline.id]?.stages.length || 0,
      })),
      debug: {
        stagesUrl,
        pipelinesUrl,
        timestamp: new Date().toISOString(),
        environment: {
          hasBaseUrl: !!BASE_URL,
          hasApiToken: !!API_TOKEN,
          baseUrl: BASE_URL,
          apiTokenLength: API_TOKEN?.length || 0,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error in teste_stage endpoint:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Test failed",
        stack: error instanceof Error ? error.stack : null,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

