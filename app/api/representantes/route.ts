import { NextRequest, NextResponse } from "next/server";
import { createSecondaryServerClient } from "@/lib/supabase-secondary-server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated using the main Supabase client
    const supabase = await createClient();
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
      .select("approved")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json(
        { error: "User not approved" },
        { status: 403 }
      );
    }

    console.log("🔍 Fetching data from secondary database...");

    // Create client for secondary database
    const supabaseSecondary = createSecondaryServerClient();

    // Fetch representantes
    const { data: representantes, error: repsError } = await supabaseSecondary
      .from("representantes")
      .select("*")
      .order("created_at", { ascending: false });

    if (repsError) {
      console.error("Error fetching representantes:", repsError);
      throw repsError;
    }

    console.log(`✅ Representantes fetched: ${representantes?.length || 0}`);

    // Fetch afiliates
    const { data: afiliates, error: afilError } = await supabaseSecondary
      .from("afiliates")
      .select("*")
      .order("created_at", { ascending: false });

    if (afilError) {
      console.error("Error fetching afiliates:", afilError);
      throw afilError;
    }

    console.log(`✅ Afiliados fetched: ${afiliates?.length || 0}`);

    return NextResponse.json({
      representantes: representantes || [],
      afiliates: afiliates || [],
    });
  } catch (error) {
    console.error("Error in representantes API:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

