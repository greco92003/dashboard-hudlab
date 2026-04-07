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
    },
  );
}

async function checkAdminOrOwner(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return { user: null, error: "Unauthorized", status: 401 };

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
    return { user: null, error: "Insufficient permissions", status: 403 };
  }

  return { user, error: null, status: 200 };
}

// GET - Fetch all tools
export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { user, error, status } = await checkAdminOrOwner(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const { data, error: dbError } = await supabase
      .from("tools_costs")
      .select("*")
      .order("tool_name", { ascending: true });

    if (dbError) {
      console.error("Error fetching tools costs:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in GET /api/tools-cost:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST - Create new tool
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { user, error, status } = await checkAdminOrOwner(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const body = await request.json();
    const { tool_name, icon_url, color, monthly_cost, usage_score } = body;

    if (!tool_name) {
      return NextResponse.json(
        { error: "tool_name is required" },
        { status: 400 },
      );
    }

    const { data, error: dbError } = await supabase
      .from("tools_costs")
      .insert({
        tool_name,
        icon_url: icon_url || null,
        color: color || "#6366f1",
        monthly_cost: monthly_cost ?? 0,
        usage_score: usage_score ?? 1,
        user_id: user.id,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Error creating tool cost:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // Auto-create history for the current month (treated as recurring from creation)
    if (data && (monthly_cost ?? 0) >= 0) {
      const now = new Date();
      await supabase.from("tools_cost_history").upsert(
        {
          tool_id: data.id,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          cost: monthly_cost ?? 0,
        },
        { onConflict: "tool_id,month,year" },
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in POST /api/tools-cost:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// PUT - Update existing tool
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { user, error, status } = await checkAdminOrOwner(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const body = await request.json();
    const {
      id,
      tool_name,
      icon_url,
      color,
      monthly_cost,
      usage_score,
      effective_month,
      effective_year,
      change_type, // "recurring" | "one_time"
    } = body;

    if (!id || !tool_name) {
      return NextResponse.json(
        { error: "id and tool_name are required" },
        { status: 400 },
      );
    }

    // Determine what to update on the tool record
    // "recurring": update monthly_cost (the recurring base) + upsert history
    // "one_time": keep monthly_cost as-is, only upsert history for that specific month
    const toolUpdate: Record<string, unknown> = {
      tool_name,
      icon_url: icon_url || null,
      color: color || "#6366f1",
      usage_score: usage_score ?? 1,
    };
    if (!change_type || change_type === "recurring") {
      toolUpdate.monthly_cost = monthly_cost ?? 0;
    }

    const { data, error: dbError } = await supabase
      .from("tools_costs")
      .update(toolUpdate)
      .eq("id", id)
      .select()
      .single();

    if (dbError) {
      console.error("Error updating tool cost:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // Always upsert history for the effective month
    const now = new Date();
    const month = effective_month ?? now.getMonth() + 1;
    const year = effective_year ?? now.getFullYear();
    await supabase
      .from("tools_cost_history")
      .upsert(
        { tool_id: id, month, year, cost: monthly_cost ?? 0 },
        { onConflict: "tool_id,month,year" },
      );

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in PUT /api/tools-cost:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// PATCH - Toggle is_active (cancel / reactivate)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { user, error, status } = await checkAdminOrOwner(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const body = await request.json();
    const { id, is_active } = body;

    if (!id || typeof is_active !== "boolean") {
      return NextResponse.json(
        { error: "id and is_active (boolean) are required" },
        { status: 400 },
      );
    }

    const { data, error: dbError } = await supabase
      .from("tools_costs")
      .update({ is_active })
      .eq("id", id)
      .select()
      .single();

    if (dbError) {
      console.error("Error toggling tool is_active:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in PATCH /api/tools-cost:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// DELETE - Delete tool
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { user, error, status } = await checkAdminOrOwner(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing tool ID" }, { status: 400 });
    }

    const { error: dbError } = await supabase
      .from("tools_costs")
      .delete()
      .eq("id", id);

    if (dbError) {
      console.error("Error deleting tool cost:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/tools-cost:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
