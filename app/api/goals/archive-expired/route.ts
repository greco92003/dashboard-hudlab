import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

// POST - Archive expired goals
export async function POST(request: NextRequest) {
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

    // Get current date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    // Find all active goals that have passed their end date
    const { data: expiredGoals, error: fetchError } = await supabase
      .from("goals")
      .select("id, title, end_date")
      .eq("status", "active")
      .lt("end_date", today);

    if (fetchError) {
      console.error("Error fetching expired goals:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch expired goals" },
        { status: 500 }
      );
    }

    if (!expiredGoals || expiredGoals.length === 0) {
      return NextResponse.json({
        message: "No expired goals found",
        archivedCount: 0,
        archivedGoals: [],
      });
    }

    // Archive all expired goals
    const { data: archivedGoals, error: updateError } = await supabase
      .from("goals")
      .update({ status: "archived" })
      .in("id", expiredGoals.map(goal => goal.id))
      .select("id, title, end_date");

    if (updateError) {
      console.error("Error archiving expired goals:", updateError);
      return NextResponse.json(
        { error: "Failed to archive expired goals" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: `Successfully archived ${archivedGoals?.length || 0} expired goals`,
      archivedCount: archivedGoals?.length || 0,
      archivedGoals: archivedGoals || [],
    });
  } catch (error) {
    console.error("Error in POST /api/goals/archive-expired:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET - Check for expired goals (read-only)
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

    // Get current date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    // Find all active goals that have passed their end date
    const { data: expiredGoals, error: fetchError } = await supabase
      .from("goals")
      .select("id, title, end_date, target_type")
      .eq("status", "active")
      .lt("end_date", today);

    if (fetchError) {
      console.error("Error fetching expired goals:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch expired goals" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      expiredGoals: expiredGoals || [],
      count: expiredGoals?.length || 0,
    });
  } catch (error) {
    console.error("Error in GET /api/goals/archive-expired:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
