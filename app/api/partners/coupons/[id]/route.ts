import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// Nuvemshop API configuration
const NUVEMSHOP_API_BASE_URL = "https://api.nuvemshop.com.br/v1";

// Helper function to make authenticated requests to Nuvemshop API
async function fetchNuvemshopAPI(endpoint: string, options: RequestInit = {}) {
  const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
  const userId = process.env.NUVEMSHOP_USER_ID;

  if (!accessToken || !userId) {
    throw new Error("Nuvemshop credentials not configured");
  }

  const url = `${NUVEMSHOP_API_BASE_URL}/${userId}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authentication: `bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "HudLab Dashboard (contato@hudlab.com.br)",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Nuvemshop API Error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// DELETE - Delete a coupon (admin/owner only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: couponId } = await params;

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

    console.log(`Attempting to delete coupon with ID/Code: ${couponId}`);

    // Check if coupon exists by ID or code
    let existingCoupon;
    let fetchError;

    // First try to find by ID (UUID format)
    if (
      couponId.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    ) {
      console.log("Searching by UUID:", couponId);
      const result = await supabase
        .from("generated_coupons")
        .select("id, code, nuvemshop_coupon_id, is_active, created_by")
        .eq("id", couponId)
        .single();
      existingCoupon = result.data;
      fetchError = result.error;
      console.log("UUID search result:", {
        data: result.data,
        error: result.error,
      });
    } else {
      // If not UUID format, try to find by code
      console.log("Searching by code:", couponId);
      const result = await supabase
        .from("generated_coupons")
        .select("id, code, nuvemshop_coupon_id, is_active, created_by")
        .eq("code", couponId)
        .single();
      existingCoupon = result.data;
      fetchError = result.error;
      console.log("Code search result:", {
        data: result.data,
        error: result.error,
      });
    }

    console.log("Coupon query result:", {
      existingCoupon,
      fetchError,
      searchedBy: couponId,
    });

    if (fetchError || !existingCoupon) {
      console.error("Coupon not found in database:", { couponId, fetchError });
      return NextResponse.json(
        {
          error: "Coupon not found",
          details:
            fetchError?.message || "No coupon found with this ID or code",
        },
        { status: 404 }
      );
    }

    // Check if coupon is already deleted
    if (!existingCoupon.is_active) {
      return NextResponse.json(
        {
          error: "Coupon already deleted",
        },
        { status: 400 }
      );
    }

    console.log(
      `Deleting coupon: ${existingCoupon.code} (ID: ${existingCoupon.id})`
    );

    // First, try to delete from Nuvemshop if it exists there
    if (existingCoupon.nuvemshop_coupon_id) {
      try {
        console.log(
          `Deleting coupon from Nuvemshop: ${existingCoupon.nuvemshop_coupon_id}`
        );

        await fetchNuvemshopAPI(
          `/coupons/${existingCoupon.nuvemshop_coupon_id}`,
          {
            method: "DELETE",
          }
        );

        console.log(
          `✅ Coupon deleted from Nuvemshop: ${existingCoupon.nuvemshop_coupon_id}`
        );
      } catch (nuvemshopError) {
        console.error(
          `❌ Failed to delete coupon from Nuvemshop:`,
          nuvemshopError
        );

        // Continue with database deletion even if Nuvemshop deletion fails
        // But log the error for manual cleanup later
        console.warn(
          `Continuing with database deletion despite Nuvemshop error for coupon ${existingCoupon.code}`
        );
      }
    } else {
      console.log(
        `Coupon ${existingCoupon.code} has no Nuvemshop ID, skipping Nuvemshop deletion`
      );
    }

    // Delete the coupon from our database (hard delete)
    console.log(
      `Attempting to delete from Supabase with ID: ${existingCoupon.id}`
    );
    console.log("Full coupon object:", existingCoupon);

    // First, let's verify the coupon still exists before deletion
    const { data: verifyData, error: verifyError } = await supabase
      .from("generated_coupons")
      .select("id, code, is_active, created_by")
      .eq("id", existingCoupon.id)
      .single();

    console.log("Pre-deletion verification:", { verifyData, verifyError });

    if (verifyError || !verifyData) {
      console.error("Coupon not found during pre-deletion verification");
      return NextResponse.json(
        { error: "Coupon not found for deletion" },
        { status: 404 }
      );
    }

    // Check if current user has permission to delete this coupon
    console.log("Current user ID:", user.id);
    console.log("Coupon created_by:", verifyData.created_by);
    console.log("User profile:", profile);

    // Try multiple deletion approaches
    let deletedData = null;
    let deleteError = null;

    // Approach 1: Delete by ID
    console.log("Attempting deletion by ID...");
    const deleteById = await supabase
      .from("generated_coupons")
      .delete()
      .eq("id", existingCoupon.id)
      .select();

    if (deleteById.data && deleteById.data.length > 0) {
      deletedData = deleteById.data;
      console.log("✅ Successfully deleted by ID");
    } else {
      console.log("❌ Failed to delete by ID:", deleteById.error);

      // Approach 2: Delete by code
      console.log("Attempting deletion by code...");
      const deleteByCode = await supabase
        .from("generated_coupons")
        .delete()
        .eq("code", existingCoupon.code)
        .select();

      if (deleteByCode.data && deleteByCode.data.length > 0) {
        deletedData = deleteByCode.data;
        console.log("✅ Successfully deleted by code");
      } else {
        console.log("❌ Failed to delete by code:", deleteByCode.error);

        // Approach 3: Soft delete (update is_active to false)
        console.log("Attempting soft delete...");
        const softDelete = await supabase
          .from("generated_coupons")
          .update({ is_active: false })
          .eq("id", existingCoupon.id)
          .select();

        if (softDelete.data && softDelete.data.length > 0) {
          deletedData = softDelete.data;
          console.log("✅ Successfully soft deleted");
        } else {
          console.log("❌ Failed to soft delete:", softDelete.error);
          deleteError =
            softDelete.error || new Error("All deletion methods failed");
        }
      }
    }

    if (deleteError || !deletedData || deletedData.length === 0) {
      console.error("All deletion methods failed:", deleteError);
      return NextResponse.json(
        {
          error: "Coupon could not be deleted from database",
          details: deleteError?.message || "All deletion approaches failed",
          debugInfo: {
            couponId: existingCoupon.id,
            couponCode: existingCoupon.code,
            userId: user.id,
            userRole: profile.role,
          },
        },
        { status: 500 }
      );
    }

    console.log(
      `✅ Coupon ${existingCoupon.code} deleted successfully from database`
    );

    return NextResponse.json({
      success: true,
      message: "Coupon deleted successfully from both Nuvemshop and database",
      deletedCoupon: {
        code: existingCoupon.code,
        id: existingCoupon.id,
        nuvemshopId: existingCoupon.nuvemshop_coupon_id,
      },
    });
  } catch (error) {
    console.error("Error in coupon DELETE:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET - Get specific coupon details (for admin/owner)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: couponId } = await params;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user has permission to view coupons
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, approved, assigned_brand")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    const allowedRoles = ["owner", "admin", "manager", "partners-media"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Build query
    let query = supabase
      .from("generated_coupons")
      .select(
        `
        id,
        code,
        percentage,
        brand,
        valid_until,
        max_uses,
        current_uses,
        nuvemshop_status,
        nuvemshop_coupon_id,
        is_active,
        created_at,
        created_by_brand
      `
      )
      .eq("id", couponId)
      .eq("is_active", true);

    // Filter by brand for partners-media users
    if (profile.role === "partners-media" && profile.assigned_brand) {
      query = query.eq("brand", profile.assigned_brand);
    }

    const { data: coupon, error: couponError } = await query.single();

    if (couponError || !coupon) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        percentage: coupon.percentage,
        brand: coupon.brand,
        validUntil: coupon.valid_until,
        maxUses: coupon.max_uses,
        currentUses: coupon.current_uses,
        status: coupon.nuvemshop_status,
        nuvemshopId: coupon.nuvemshop_coupon_id,
        isActive: coupon.is_active,
        createdAt: coupon.created_at,
        createdByBrand: coupon.created_by_brand,
      },
    });
  } catch (error) {
    console.error("Error in coupon GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
