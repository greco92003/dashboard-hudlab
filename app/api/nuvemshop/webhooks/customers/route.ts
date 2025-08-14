import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Log the webhook data
    console.log("Customer webhook received:", body);

    // Process customer data here
    // You can sync customer information to your database

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Customer webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
