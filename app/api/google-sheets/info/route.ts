import { NextRequest, NextResponse } from "next/server";
import { getGoogleSheetsClient } from "@/lib/google-sheets";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const spreadsheetId = searchParams.get('spreadsheetId');

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "spreadsheetId is required" },
        { status: 400 }
      );
    }

    console.log(`ℹ️ Getting Google Sheet info: ${spreadsheetId}`);

    const client = getGoogleSheetsClient();
    const info = await client.getSpreadsheetInfo(spreadsheetId);

    return NextResponse.json({
      success: true,
      data: info,
      metadata: {
        totalSheets: info.sheets?.length || 0,
        spreadsheetTitle: info.title,
      }
    });

  } catch (error) {
    console.error("Error getting Google Sheet info:", error);
    
    return NextResponse.json(
      { 
        error: "Failed to get Google Sheet info",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { spreadsheetId } = body;

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "spreadsheetId is required" },
        { status: 400 }
      );
    }

    console.log(`ℹ️ Getting Google Sheet info via POST: ${spreadsheetId}`);

    const client = getGoogleSheetsClient();
    const info = await client.getSpreadsheetInfo(spreadsheetId);

    return NextResponse.json({
      success: true,
      data: info,
      metadata: {
        totalSheets: info.sheets?.length || 0,
        spreadsheetTitle: info.title,
      }
    });

  } catch (error) {
    console.error("Error getting Google Sheet info:", error);
    
    return NextResponse.json(
      { 
        error: "Failed to get Google Sheet info",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
