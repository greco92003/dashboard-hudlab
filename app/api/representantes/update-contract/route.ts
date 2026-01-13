import { NextRequest, NextResponse } from "next/server";
import { createSecondaryServerClient } from "@/lib/supabase-secondary-server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
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

    // Get request body
    const body = await request.json();
    const { representanteId, contractUrl } = body;

    if (!representanteId || !contractUrl) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log(
      `📝 Updating contract URL for representante ${representanteId}...`
    );

    // Create client for secondary database
    const supabaseSecondary = createSecondaryServerClient();

    // Update contract_url
    const { data, error } = await supabaseSecondary
      .from("representantes")
      .update({ contract_url: contractUrl })
      .eq("id", representanteId)
      .select()
      .single();

    if (error) {
      console.error("Error updating contract URL:", error);
      throw error;
    }

    console.log(`✅ Contract URL updated successfully`);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in update-contract API:", error);
    return NextResponse.json(
      {
        error: "Failed to update contract URL",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

