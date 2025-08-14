import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: linkId } = await params;

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

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    if (!profile.approved || !["admin", "owner"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { url } = body;

    // Validate required fields
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Check if link exists
    const { data: existingLink, error: fetchError } = await supabase
      .from("affiliate_links")
      .select("id, brand")
      .eq("id", linkId)
      .eq("is_active", true)
      .single();

    if (fetchError || !existingLink) {
      return NextResponse.json(
        { error: "Affiliate link not found" },
        { status: 404 }
      );
    }

    // Update affiliate link
    const { data: updatedLink, error: updateError } = await supabase
      .from("affiliate_links")
      .update({
        url: url.trim(),
      })
      .eq("id", linkId)
      .select(
        `
        id,
        url,
        brand,
        created_at,
        updated_at
      `
      )
      .single();

    if (updateError) {
      console.error("Error updating affiliate link:", updateError);
      console.error("Update error details:", {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        userId: user.id,
        userRole: profile.role,
        userApproved: profile.approved,
        linkId,
      });
      return NextResponse.json(
        {
          error: "Failed to update affiliate link",
          details: updateError.message,
          code: updateError.code,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      link: updatedLink,
    });
  } catch (error) {
    console.error("Error in affiliate link PUT:", error);
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
    const { id: linkId } = await params;

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

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    if (!profile.approved || !["admin", "owner"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Check if link exists
    const { data: existingLink, error: fetchError } = await supabase
      .from("affiliate_links")
      .select("id, brand")
      .eq("id", linkId)
      .eq("is_active", true)
      .single();

    if (fetchError || !existingLink) {
      return NextResponse.json(
        { error: "Affiliate link not found" },
        { status: 404 }
      );
    }

    // Soft delete by setting is_active to false
    const { error: deleteError } = await supabase
      .from("affiliate_links")
      .update({ is_active: false })
      .eq("id", linkId);

    if (deleteError) {
      console.error("Error deleting affiliate link:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete affiliate link" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Affiliate link deleted successfully",
    });
  } catch (error) {
    console.error("Error in affiliate link DELETE:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
