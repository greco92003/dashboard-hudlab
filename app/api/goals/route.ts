import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

// GET - Fetch all goals
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

    const { searchParams } = new URL(request.url);
    const targetType = searchParams.get("targetType"); // 'sellers' or 'designers'
    const status = searchParams.get("status"); // 'active' or 'archived'

    let query = supabase
      .from("goals")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply filters if provided
    if (targetType) {
      query = query.eq("target_type", targetType);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: goals, error } = await query;

    if (error) {
      console.error("Error fetching goals:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: goals });
  } catch (error) {
    console.error("Error in GET /api/goals:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Create new goal
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

    // Check if user has admin or owner role
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("role, first_name, last_name, email, avatar_url")
      .eq("id", user.id)
      .single();

    if (!userProfile || !["admin", "owner"].includes(userProfile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      title,
      description,
      start_date,
      end_date,
      general_goal_value,
      individual_goal_value,
      goal_type,
      target_type,
      rewards,
    } = body;

    // Validate required fields
    if (
      !title ||
      !description ||
      !start_date ||
      !end_date ||
      !goal_type ||
      !target_type
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate rewards
    if (!rewards || !Array.isArray(rewards) || rewards.length === 0) {
      return NextResponse.json(
        { error: "At least one reward is required" },
        { status: 400 }
      );
    }

    // Validate that all rewards have descriptions
    if (
      rewards.some(
        (reward: any) => !reward.description || !reward.description.trim()
      )
    ) {
      return NextResponse.json(
        { error: "All rewards must have valid descriptions" },
        { status: 400 }
      );
    }

    // Validate that at least one goal value is provided
    if (!general_goal_value && !individual_goal_value) {
      return NextResponse.json(
        {
          error:
            "At least one goal value (general or individual) must be provided",
        },
        { status: 400 }
      );
    }

    // Validate goal type
    if (!["total_sales", "pairs_sold"].includes(goal_type)) {
      return NextResponse.json({ error: "Invalid goal type" }, { status: 400 });
    }

    // Validate target type
    if (!["sellers", "designers"].includes(target_type)) {
      return NextResponse.json(
        { error: "Invalid target type" },
        { status: 400 }
      );
    }

    // Create the goal
    const { data: goal, error } = await supabase
      .from("goals")
      .insert({
        title,
        description,
        start_date,
        end_date,
        general_goal_value: general_goal_value || null,
        individual_goal_value: individual_goal_value || null,
        goal_type,
        target_type,
        rewards: JSON.stringify(rewards),
        created_by_user_id: user.id,
        created_by_name: `${userProfile.first_name} ${userProfile.last_name}`,
        created_by_email: userProfile.email,
        created_by_avatar_url: userProfile.avatar_url,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating goal:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: goal });
  } catch (error) {
    console.error("Error in POST /api/goals:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT - Update existing goal
export async function PUT(request: NextRequest) {
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

    // Check if user has admin or owner role
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userProfile || !["admin", "owner"].includes(userProfile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      id,
      title,
      description,
      start_date,
      end_date,
      general_goal_value,
      individual_goal_value,
      goal_type,
      target_type,
      status,
      rewards,
    } = body;

    // Validate required fields
    if (!id) {
      return NextResponse.json(
        { error: "Goal ID is required" },
        { status: 400 }
      );
    }

    // Build update object with only provided fields
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (start_date !== undefined) updateData.start_date = start_date;
    if (end_date !== undefined) updateData.end_date = end_date;
    if (general_goal_value !== undefined)
      updateData.general_goal_value = general_goal_value;
    if (individual_goal_value !== undefined)
      updateData.individual_goal_value = individual_goal_value;
    if (goal_type !== undefined) updateData.goal_type = goal_type;
    if (target_type !== undefined) updateData.target_type = target_type;
    if (status !== undefined) updateData.status = status;
    if (rewards !== undefined) updateData.rewards = JSON.stringify(rewards);

    // Update the goal
    const { data: goal, error } = await supabase
      .from("goals")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating goal:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: goal });
  } catch (error) {
    console.error("Error in PUT /api/goals:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Delete goal
export async function DELETE(request: NextRequest) {
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

    // Check if user has admin or owner role
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userProfile || !["admin", "owner"].includes(userProfile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Goal ID is required" },
        { status: 400 }
      );
    }

    // Delete the goal
    const { error } = await supabase.from("goals").delete().eq("id", id);

    if (error) {
      console.error("Error deleting goal:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Goal deleted successfully" });
  } catch (error) {
    console.error("Error in DELETE /api/goals:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
