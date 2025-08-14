import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { pix_key, pix_type = "random" } = body;
    const resolvedParams = await params;
    const pixKeyId = resolvedParams.id;

    if (!pix_key) {
      return NextResponse.json(
        { error: "pix_key is required" },
        { status: 400 }
      );
    }

    // Validate pix_type
    const validPixTypes = ["cpf", "cnpj", "email", "phone", "random"];
    if (!validPixTypes.includes(pix_type)) {
      return NextResponse.json(
        {
          error:
            "Invalid pix_type. Must be one of: " + validPixTypes.join(", "),
        },
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
      .select("role, assigned_brand")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Get the existing pix key to check brand ownership
    const { data: existingPixKey, error: fetchError } = await supabase
      .from("partner_pix_keys")
      .select("brand")
      .eq("id", pixKeyId)
      .single();

    if (fetchError || !existingPixKey) {
      return NextResponse.json({ error: "Pix key not found" }, { status: 404 });
    }

    // Check permissions based on role
    if (profile.role === "partners-media") {
      // Partners-media can only update their assigned brand's pix key
      if (
        !profile.assigned_brand ||
        profile.assigned_brand !== existingPixKey.brand
      ) {
        return NextResponse.json(
          {
            error:
              "Partners-media can only update pix keys for their assigned brand",
          },
          { status: 403 }
        );
      }
    } else if (!["owner", "admin"].includes(profile.role)) {
      // Only owners, admins, and partners-media can update pix keys
      return NextResponse.json(
        { error: "Insufficient permissions to update pix keys" },
        { status: 403 }
      );
    }

    // Update pix key
    const { data: pixKey, error } = await supabase
      .from("partner_pix_keys")
      .update({
        pix_key,
        pix_type,
        updated_by: user.id,
      })
      .eq("id", pixKeyId)
      .select()
      .single();

    if (error) {
      console.error("Error updating pix key:", error);
      return NextResponse.json(
        { error: "Failed to update pix key" },
        { status: 500 }
      );
    }

    if (!pixKey) {
      return NextResponse.json({ error: "Pix key not found" }, { status: 404 });
    }

    return NextResponse.json({ pixKey });
  } catch (error) {
    console.error("Error in PUT /api/partners/pix-keys/[id]:", error);
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
    const pixKeyId = resolvedParams.id;

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
      .select("role, assigned_brand")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Get the existing pix key to check brand ownership
    const { data: existingPixKey, error: fetchError } = await supabase
      .from("partner_pix_keys")
      .select("brand")
      .eq("id", pixKeyId)
      .single();

    if (fetchError || !existingPixKey) {
      return NextResponse.json({ error: "Pix key not found" }, { status: 404 });
    }

    // Check permissions based on role
    if (profile.role === "partners-media") {
      // Partners-media can only delete their assigned brand's pix key
      if (
        !profile.assigned_brand ||
        profile.assigned_brand !== existingPixKey.brand
      ) {
        return NextResponse.json(
          {
            error:
              "Partners-media can only delete pix keys for their assigned brand",
          },
          { status: 403 }
        );
      }
    } else if (!["owner", "admin"].includes(profile.role)) {
      // Only owners, admins, and partners-media can delete pix keys
      return NextResponse.json(
        { error: "Insufficient permissions to delete pix keys" },
        { status: 403 }
      );
    }

    // Delete pix key
    const { error } = await supabase
      .from("partner_pix_keys")
      .delete()
      .eq("id", pixKeyId);

    if (error) {
      console.error("Error deleting pix key:", error);
      return NextResponse.json(
        { error: "Failed to delete pix key" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/partners/pix-keys/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
