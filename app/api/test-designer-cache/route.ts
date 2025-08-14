import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  console.log("🚀 GET /api/test-designer-cache called");
  return NextResponse.json({
    success: true,
    message: "GET method working",
    timestamp: new Date().toISOString()
  });
}

export async function POST(request: NextRequest) {
  console.log("🚀 POST /api/test-designer-cache called");
  try {
    const body = await request.json();
    console.log("📦 Request body:", body);
    
    return NextResponse.json({
      success: true,
      message: "POST method working",
      receivedData: body,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Error in POST:", error);
    return NextResponse.json({
      error: "POST method failed",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
