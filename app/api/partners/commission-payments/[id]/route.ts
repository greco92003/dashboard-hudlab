import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is approved and has permission to update payments
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    // Only owners and admins can update commission payments
    if (!["owner", "admin"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can update commission payments" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      amount,
      payment_date,
      description,
      payment_method,
      payment_reference,
      status,
      franchise,
    } = body;

    // Validate amount if provided
    if (amount !== undefined && (typeof amount !== "number" || amount <= 0)) {
      return NextResponse.json(
        { error: "Amount must be a positive number" },
        { status: 400 }
      );
    }

    // Validate payment_date format if provided
    if (payment_date && !/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
      return NextResponse.json(
        { error: "Payment date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    // Validate status if provided
    if (status && !["sent", "confirmed", "cancelled"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be one of: sent, confirmed, cancelled" },
        { status: 400 }
      );
    }

    // Check if payment exists
    const { data: existingPayment, error: fetchError } = await supabase
      .from("commission_payments")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !existingPayment) {
      return NextResponse.json(
        { error: "Commission payment not found" },
        { status: 404 }
      );
    }

    // Update the payment record
    const updateData: any = {
      updated_by: user.id,
    };

    if (amount !== undefined) updateData.amount = amount;
    if (payment_date !== undefined) updateData.payment_date = payment_date;
    if (description !== undefined) updateData.description = description;
    if (payment_method !== undefined)
      updateData.payment_method = payment_method;
    if (payment_reference !== undefined)
      updateData.payment_reference = payment_reference;
    if (status !== undefined) updateData.status = status;
    if (franchise !== undefined) updateData.franchise = franchise || null;

    const { data: payment, error } = await supabase
      .from("commission_payments")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating commission payment:", error);
      return NextResponse.json(
        { error: "Failed to update commission payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ payment });
  } catch (error) {
    console.error("Error in commission payment PUT:", error);
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
    const { id } = await params;
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is approved and has permission to delete payments
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    // Only owners and admins can delete commission payments
    if (!["owner", "admin"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can delete commission payments" },
        { status: 403 }
      );
    }

    // Check if payment exists
    const { data: existingPayment, error: fetchError } = await supabase
      .from("commission_payments")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !existingPayment) {
      return NextResponse.json(
        { error: "Commission payment not found" },
        { status: 404 }
      );
    }

    // Delete the payment record
    const { error } = await supabase
      .from("commission_payments")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting commission payment:", error);
      return NextResponse.json(
        { error: "Failed to delete commission payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Commission payment deleted successfully",
    });
  } catch (error) {
    console.error("Error in commission payment DELETE:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
