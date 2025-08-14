import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Helper function to format date as YYYY-MM-DD without timezone issues
function formatDateString(year: number, month: number, day: number): string {
  const yearStr = year.toString();
  const monthStr = (month + 1).toString().padStart(2, "0"); // month is 0-indexed, so add 1
  const dayStr = day.toString().padStart(2, "0");
  return `${yearStr}-${monthStr}-${dayStr}`;
}

// Create Supabase client
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

// GET - Fetch all fixed costs
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
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let query = supabase
      .from("fixed_costs")
      .select("*")
      .order("date", { ascending: false });

    // Apply date filters if provided
    if (startDate && endDate) {
      query = query.gte("date", startDate).lte("date", endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching fixed costs:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in GET /api/fixed-costs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Create new fixed cost(s)
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

    // Get user profile for additional info
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("first_name, last_name, email, avatar_url")
      .eq("id", user.id)
      .single();

    const body = await request.json();
    const { description, date, value, recurrence, tag } = body;

    // Validate required fields
    if (!description || !date || value === undefined || !recurrence || !tag) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Prepare user data for tracking
    const userName = userProfile
      ? `${userProfile.first_name || ""} ${
          userProfile.last_name || ""
        }`.trim() || userProfile.email
      : user.email || "Unknown User";

    const userTrackingData = {
      created_by_user_id: user.id,
      created_by_name: userName,
      created_by_email: userProfile?.email || user.email,
      created_by_avatar_url: userProfile?.avatar_url,
    };

    // Create array of costs to insert (handling recurrence)
    const costsToInsert = [
      {
        description,
        date,
        value,
        recurrence,
        tag,
        ...userTrackingData,
      },
    ];

    // Handle recurrence
    if (recurrence === "monthly") {
      // Parse the input date string (YYYY-MM-DD) to avoid timezone issues
      const [year, month, day] = date.split("-").map(Number);
      const inputDate = new Date(year, month - 1, day); // month is 0-indexed
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);

      // Determine the starting date for recurrence
      let startYear = year;
      let startMonth = month - 1; // 0-indexed
      let startDay = day;

      // If the input date is in the past, start recurrence from next month
      if (inputDate < currentDate) {
        const nextMonth = new Date(currentDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        startYear = nextMonth.getFullYear();
        startMonth = nextMonth.getMonth();
        startDay = day; // Keep the original day
      }

      // Create entries for the next 11 months from the start date
      for (let i = 1; i <= 11; i++) {
        const nextMonth = startMonth + i;
        const nextYear = startYear + Math.floor(nextMonth / 12);
        const adjustedMonth = nextMonth % 12;

        // Handle month overflow for days like 31st when target month has fewer days
        const daysInMonth = new Date(nextYear, adjustedMonth + 1, 0).getDate();
        const adjustedDay = Math.min(startDay, daysInMonth);

        costsToInsert.push({
          description,
          date: formatDateString(nextYear, adjustedMonth, adjustedDay),
          value,
          recurrence,
          tag,
          ...userTrackingData,
        });
      }
    } else if (recurrence === "annually") {
      // Parse the input date string (YYYY-MM-DD) to avoid timezone issues
      const [year, month, day] = date.split("-").map(Number);

      // Always use the original date as the base, regardless of whether it's in the past or future
      const baseYear = year;
      const baseMonth = month - 1; // 0-indexed
      const baseDay = day;

      // Create entries for the next 3 years from the original date
      // This ensures we get: original date + 3 additional years
      for (let i = 1; i <= 3; i++) {
        const nextYear = baseYear + i;

        costsToInsert.push({
          description,
          date: formatDateString(nextYear, baseMonth, baseDay),
          value,
          recurrence,
          tag,
          ...userTrackingData,
        });
      }
    }

    const { data, error } = await supabase
      .from("fixed_costs")
      .insert(costsToInsert)
      .select();

    if (error) {
      console.error("Error creating fixed costs:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in POST /api/fixed-costs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT - Update existing fixed cost
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

    const body = await request.json();
    const {
      id,
      description,
      date,
      value,
      recurrence,
      tag,
      editMode,
      originalDescription,
      originalRecurrence,
      originalTag,
    } = body;

    // Validate required fields
    if (
      !id ||
      !description ||
      !date ||
      value === undefined ||
      !recurrence ||
      !tag
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    let data, error;

    if (
      editMode === "all" &&
      originalDescription &&
      originalRecurrence &&
      originalTag
    ) {
      // Update all occurrences with the same description, recurrence, and tag
      const updateResult = await supabase
        .from("fixed_costs")
        .update({
          description,
          value,
          recurrence,
          tag,
        })
        .eq("description", originalDescription)
        .eq("recurrence", originalRecurrence)
        .eq("tag", originalTag)
        .select();

      data = updateResult.data;
      error = updateResult.error;
    } else {
      // Update only this specific occurrence (default behavior)
      const updateResult = await supabase
        .from("fixed_costs")
        .update({
          description,
          date,
          value,
          recurrence,
          tag,
        })
        .eq("id", id)
        .select();

      data = updateResult.data;
      error = updateResult.error;
    }

    if (error) {
      console.error("Error updating fixed cost:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in PUT /api/fixed-costs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Delete fixed cost
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const mode = searchParams.get("mode"); // 'single' or 'future'
    const description = searchParams.get("description");
    const recurrence = searchParams.get("recurrence");
    const tag = searchParams.get("tag");
    const date = searchParams.get("date");

    if (!id) {
      return NextResponse.json({ error: "Missing cost ID" }, { status: 400 });
    }

    if (mode === "single") {
      // Delete only this instance
      const { error } = await supabase
        .from("fixed_costs")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting fixed cost:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (mode === "future" && description && recurrence && tag && date) {
      // Delete this and future instances
      const { error } = await supabase
        .from("fixed_costs")
        .delete()
        .eq("description", description)
        .eq("recurrence", recurrence)
        .eq("tag", tag)
        .gte("date", date);

      if (error) {
        console.error("Error deleting future fixed costs:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/fixed-costs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
