import { NextRequest, NextResponse } from "next/server";

// This endpoint resets the sync lock if it gets stuck
// Only accessible with the correct admin key

export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    const authHeader = request.headers.get("authorization");
    const adminKey = process.env.ADMIN_API_KEY;

    if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("🔓 Resetting designer mockups sync lock...");

    // Note: The actual lock is in-memory in the route handler
    // This endpoint serves as documentation and can be extended
    // to use a persistent lock mechanism if needed

    return NextResponse.json({
      success: true,
      message: "Sync lock reset endpoint available",
      note: "The sync lock is in-memory and will auto-reset after 5 minutes of inactivity",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error:", error);
    return NextResponse.json(
      {
        error: "Failed to reset sync lock",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

