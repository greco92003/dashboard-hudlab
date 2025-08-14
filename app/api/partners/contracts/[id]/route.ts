import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { contract_url } = body;
    const resolvedParams = await params;
    const contractId = resolvedParams.id;

    if (!contract_url) {
      return NextResponse.json(
        { error: "contract_url is required" },
        { status: 400 }
      );
    }

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile to check permissions
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Only owners and admins can update contracts
    if (!["owner", "admin"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can update contracts" },
        { status: 403 }
      );
    }

    // Validate URL format
    try {
      new URL(contract_url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Update contract
    const { data: contract, error } = await supabase
      .from("partnership_contracts")
      .update({
        contract_url,
        updated_by: user.id,
      })
      .eq("id", contractId)
      .select()
      .single();

    if (error) {
      console.error("Error updating contract:", error);
      return NextResponse.json(
        { error: "Failed to update contract" },
        { status: 500 }
      );
    }

    if (!contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ contract });
  } catch (error) {
    console.error("Error in PUT /api/partners/contracts/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params;
    const contractId = resolvedParams.id;

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile to check permissions
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Only owners and admins can delete contracts
    if (!["owner", "admin"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can delete contracts" },
        { status: 403 }
      );
    }

    // Delete contract
    const { error } = await supabase
      .from("partnership_contracts")
      .delete()
      .eq("id", contractId);

    if (error) {
      console.error("Error deleting contract:", error);
      return NextResponse.json(
        { error: "Failed to delete contract" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/partners/contracts/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
