import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// POST - Configure NuvemShop credentials in the database
export async function POST(request: NextRequest) {
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

    // Check if user is admin or owner
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, approved")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile?.approved ||
      !["admin", "owner"].includes(profile.role)
    ) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Get credentials from environment variables
    const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
    const userId = process.env.NUVEMSHOP_USER_ID;

    if (!accessToken || !userId) {
      return NextResponse.json(
        { 
          error: "NuvemShop credentials not found in environment variables",
          details: "Please configure NUVEMSHOP_ACCESS_TOKEN and NUVEMSHOP_USER_ID"
        },
        { status: 400 }
      );
    }

    console.log("🔧 Configuring NuvemShop credentials in database...");

    // Update credentials in system_config table
    const { error: updateError } = await supabase
      .from("system_config")
      .upsert([
        {
          key: "nuvemshop_access_token",
          value: accessToken,
          description: "Token de acesso da API do NuvemShop",
        },
        {
          key: "nuvemshop_user_id", 
          value: userId,
          description: "ID do usuário no NuvemShop",
        },
      ]);

    if (updateError) {
      console.error("Error updating NuvemShop credentials:", updateError);
      return NextResponse.json(
        { error: "Failed to update credentials" },
        { status: 500 }
      );
    }

    console.log("✅ NuvemShop credentials configured successfully");

    return NextResponse.json({
      success: true,
      message: "NuvemShop credentials configured successfully",
      configured: {
        access_token: accessToken ? "✓ Configured" : "✗ Missing",
        user_id: userId ? "✓ Configured" : "✗ Missing",
      },
    });

  } catch (error) {
    console.error("Error configuring NuvemShop credentials:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// GET - Check current credential configuration status
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

    // Check if user is admin or owner
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, approved")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile?.approved ||
      !["admin", "owner"].includes(profile.role)
    ) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Check environment variables
    const envAccessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
    const envUserId = process.env.NUVEMSHOP_USER_ID;

    // Check database configuration
    const { data: dbConfig, error: dbError } = await supabase
      .from("system_config")
      .select("key, value")
      .in("key", ["nuvemshop_access_token", "nuvemshop_user_id"]);

    if (dbError) {
      console.error("Error fetching database config:", dbError);
      return NextResponse.json(
        { error: "Failed to fetch configuration" },
        { status: 500 }
      );
    }

    const dbAccessToken = dbConfig?.find(c => c.key === "nuvemshop_access_token")?.value;
    const dbUserId = dbConfig?.find(c => c.key === "nuvemshop_user_id")?.value;

    const isEnvConfigured = envAccessToken && envUserId;
    const isDbConfigured = dbAccessToken && 
                          dbUserId && 
                          dbAccessToken !== "PLACEHOLDER_TOKEN" && 
                          dbUserId !== "PLACEHOLDER_USER_ID";

    return NextResponse.json({
      environment: {
        access_token: envAccessToken ? "✓ Configured" : "✗ Missing",
        user_id: envUserId ? "✓ Configured" : "✗ Missing",
        configured: isEnvConfigured,
      },
      database: {
        access_token: dbAccessToken && dbAccessToken !== "PLACEHOLDER_TOKEN" ? "✓ Configured" : "✗ Missing/Placeholder",
        user_id: dbUserId && dbUserId !== "PLACEHOLDER_USER_ID" ? "✓ Configured" : "✗ Missing/Placeholder", 
        configured: isDbConfigured,
      },
      trigger_ready: isDbConfigured,
      recommendation: !isDbConfigured && isEnvConfigured ? 
        "Run POST /api/admin/configure-nuvemshop-credentials to sync environment variables to database" :
        !isEnvConfigured ? 
        "Configure NUVEMSHOP_ACCESS_TOKEN and NUVEMSHOP_USER_ID environment variables" :
        "Configuration is complete"
    });

  } catch (error) {
    console.error("Error checking NuvemShop configuration:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
