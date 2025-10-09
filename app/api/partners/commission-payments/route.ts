import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is approved and has permission
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role, assigned_brand")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    // Allow partners-media to view their brand's payments and owners/admins to view all
    const allowedRoles = ["owner", "admin", "partners-media"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const selectedBrand = searchParams.get("brand"); // Brand filter for owners/admins
    const selectedFranchise = searchParams.get("franchise"); // Franchise filter for Zenith brand

    let query = supabase
      .from("commission_payments")
      .select(
        `
        id,
        brand,
        franchise,
        partner_user_id,
        amount,
        payment_date,
        description,
        payment_method,
        payment_reference,
        status,
        created_at,
        updated_at,
        created_by,
        updated_by
      `
      )
      .order("payment_date", { ascending: false });

    // Apply brand filter based on user role
    if (profile.role === "partners-media" && profile.assigned_brand) {
      // Partners-media: only see their assigned brand's payments
      query = query.eq("brand", profile.assigned_brand);
    } else if (profile.role === "partners-media" && !profile.assigned_brand) {
      // Partners-media without assigned brand: no access
      return NextResponse.json({ error: "No brand assigned" }, { status: 403 });
    } else if (selectedBrand && selectedBrand !== "all") {
      // Owners/admins with brand filter
      query = query.eq("brand", selectedBrand);
    }
    // Owners/admins without filter: see all payments

    // Apply franchise filter if provided
    if (selectedFranchise) {
      query = query.eq("franchise", selectedFranchise);
    }

    const { data: payments, error } = await query;

    if (error) {
      console.error("Error fetching commission payments:", error);
      return NextResponse.json(
        { error: "Failed to fetch commission payments" },
        { status: 500 }
      );
    }

    return NextResponse.json({ payments: payments || [] });
  } catch (error) {
    console.error("Error in commission payments GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is approved and has permission to create payments
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    // Only owners and admins can create commission payments
    if (!["owner", "admin"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can create commission payments" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      brand,
      franchise,
      partner_user_id,
      amount,
      payment_date,
      description,
      payment_method = "pix",
      payment_reference,
      status = "sent",
    } = body;

    // Validate required fields
    if (!brand || !amount || !payment_date) {
      return NextResponse.json(
        { error: "Brand, amount, and payment_date are required" },
        { status: 400 }
      );
    }

    // Validate amount
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be a positive number" },
        { status: 400 }
      );
    }

    // Validate payment_date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
      return NextResponse.json(
        { error: "Payment date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    // Validate status
    if (!["sent", "confirmed", "cancelled"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be one of: sent, confirmed, cancelled" },
        { status: 400 }
      );
    }

    // Create the payment record
    const { data: payment, error } = await supabase
      .from("commission_payments")
      .insert({
        brand,
        franchise: franchise || null,
        partner_user_id,
        amount,
        payment_date,
        description,
        payment_method,
        payment_reference,
        status,
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating commission payment:", error);
      return NextResponse.json(
        { error: "Failed to create commission payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    console.error("Error in commission payments POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
