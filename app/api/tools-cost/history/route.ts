import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

async function checkAdminOrOwner(supabase: Awaited<ReturnType<typeof createSupabaseServer>>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { user: null, error: "Unauthorized", status: 401 };

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role, approved")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.approved || !["admin", "owner"].includes(profile.role)) {
    return { user: null, error: "Insufficient permissions", status: 403 };
  }

  return { user, error: null, status: 200 };
}

// GET - Fetch history (optionally filtered by months back)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { user, error, status } = await checkAdminOrOwner(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const { searchParams } = new URL(request.url);
    const monthsBack = parseInt(searchParams.get("monthsBack") || "12");
    const toolId = searchParams.get("toolId");

    // Calculate date range
    const now = new Date();
    const cutoffDate = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);

    let query = supabase
      .from("tools_cost_history")
      .select("*, tools_costs(tool_name, color, icon_url)")
      .order("year", { ascending: true })
      .order("month", { ascending: true });

    if (toolId) {
      query = query.eq("tool_id", toolId);
    }

    // Filter by year/month range
    query = query.or(
      `year.gt.${cutoffDate.getFullYear()},and(year.eq.${cutoffDate.getFullYear()},month.gte.${cutoffDate.getMonth() + 1})`
    );

    const { data, error: dbError } = await query;

    if (dbError) {
      console.error("Error fetching tools cost history:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in GET /api/tools-cost/history:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Register monthly cost
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { user, error, status } = await checkAdminOrOwner(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const body = await request.json();
    const { tool_id, month, year, cost } = body;

    if (!tool_id || !month || !year) {
      return NextResponse.json({ error: "tool_id, month, and year are required" }, { status: 400 });
    }

    const { data, error: dbError } = await supabase
      .from("tools_cost_history")
      .upsert({
        tool_id,
        month,
        year,
        cost: cost ?? 0,
      }, { onConflict: "tool_id,month,year" })
      .select()
      .single();

    if (dbError) {
      console.error("Error creating tool cost history:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in POST /api/tools-cost/history:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT - Update a specific month cost
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { user, error, status } = await checkAdminOrOwner(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const body = await request.json();
    const { id, cost } = body;

    if (!id || cost === undefined) {
      return NextResponse.json({ error: "id and cost are required" }, { status: 400 });
    }

    const { data, error: dbError } = await supabase
      .from("tools_cost_history")
      .update({ cost })
      .eq("id", id)
      .select()
      .single();

    if (dbError) {
      console.error("Error updating tool cost history:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in PUT /api/tools-cost/history:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
