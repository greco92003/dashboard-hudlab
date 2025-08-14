import { NextRequest, NextResponse } from "next/server";
import { writeGoogleSheet, appendGoogleSheet } from "@/lib/google-sheets";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      spreadsheetId, 
      range, 
      values, 
      mode = 'update', // 'update' ou 'append'
      valueInputOption = 'USER_ENTERED' 
    } = body;

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "spreadsheetId is required" },
        { status: 400 }
      );
    }

    if (!range) {
      return NextResponse.json(
        { error: "range is required (ex: 'Sheet1!A1' for update or 'Sheet1!A:Z' for append)" },
        { status: 400 }
      );
    }

    if (!values || !Array.isArray(values)) {
      return NextResponse.json(
        { error: "values must be a 2D array" },
        { status: 400 }
      );
    }

    console.log(`📝 Writing to Google Sheet: ${spreadsheetId}, Range: ${range}, Mode: ${mode}`);

    let result;
    
    if (mode === 'append') {
      result = await appendGoogleSheet(spreadsheetId, range, values, valueInputOption);
    } else {
      result = await writeGoogleSheet(spreadsheetId, range, values, valueInputOption);
    }

    return NextResponse.json({
      success: true,
      mode,
      result,
      metadata: {
        updatedRows: result.updatedRows,
        updatedColumns: result.updatedColumns,
        updatedCells: result.updatedCells,
        inputRows: values.length,
        inputColumns: values[0]?.length || 0,
      }
    });

  } catch (error) {
    console.error("Error writing to Google Sheet:", error);
    
    return NextResponse.json(
      { 
        error: "Failed to write to Google Sheet",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      spreadsheetId, 
      range, 
      values, 
      valueInputOption = 'USER_ENTERED' 
    } = body;

    if (!spreadsheetId || !range || !values) {
      return NextResponse.json(
        { error: "spreadsheetId, range, and values are required" },
        { status: 400 }
      );
    }

    console.log(`🔄 Updating Google Sheet: ${spreadsheetId}, Range: ${range}`);

    const result = await writeGoogleSheet(spreadsheetId, range, values, valueInputOption);

    return NextResponse.json({
      success: true,
      mode: 'update',
      result,
      metadata: {
        updatedRows: result.updatedRows,
        updatedColumns: result.updatedColumns,
        updatedCells: result.updatedCells,
      }
    });

  } catch (error) {
    console.error("Error updating Google Sheet:", error);
    
    return NextResponse.json(
      { 
        error: "Failed to update Google Sheet",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
