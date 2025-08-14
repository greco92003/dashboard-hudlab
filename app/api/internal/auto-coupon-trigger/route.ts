import { NextRequest, NextResponse } from "next/server";

// Internal endpoint to be called by database triggers
// This endpoint will call the auto-coupon generation API
export async function POST(request: NextRequest) {
  try {
    // Verify this is an internal call (you might want to add a secret header)
    const authHeader = request.headers.get("authorization");
    const expectedSecret = process.env.INTERNAL_API_SECRET || "internal-secret";
    
    if (authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { brand } = body;

    if (!brand) {
      return NextResponse.json({ error: "Brand is required" }, { status: 400 });
    }

    console.log(`🔔 Auto-coupon trigger called for brand: ${brand}`);

    // Call the auto-coupon generation API
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/partners/coupons/auto-generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Use a service account or admin token for internal calls
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ brand }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`Failed to generate auto-coupon for ${brand}:`, result);
      return NextResponse.json({
        success: false,
        error: result.error || "Failed to generate auto-coupon",
      }, { status: response.status });
    }

    console.log(`✅ Auto-coupon trigger completed for ${brand}:`, result);

    return NextResponse.json({
      success: true,
      message: "Auto-coupon trigger completed",
      result: result,
    });

  } catch (error) {
    console.error("Error in auto-coupon trigger:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
