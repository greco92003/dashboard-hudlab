import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Log the webhook data
    console.log("Store webhook received:", body);

    // You can process the store data here
    // For example, update store information in your database

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Store webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
