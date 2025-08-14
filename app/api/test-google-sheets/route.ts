import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    console.log("🧪 Testing Google Sheets API...");
    
    // Test environment variables
    const requiredEnvVars = [
      'GOOGLE_SHEETS_PRIVATE_KEY',
      'GOOGLE_SHEETS_CLIENT_EMAIL',
      'GOOGLE_SHEETS_PROJECT_ID',
      'NEXT_PUBLIC_GOOGLE_SHEETS_DESIGNER_FOLLOW_UP_ID'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      return NextResponse.json({
        error: "Missing environment variables",
        missingVars,
        status: "failed"
      }, { status: 500 });
    }
    
    console.log("✅ All environment variables present");
    
    // Test Google Sheets API call
    const baseUrl = request.nextUrl.origin;
    const testResponse = await fetch(`${baseUrl}/api/google-sheets/read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        spreadsheetId: process.env.NEXT_PUBLIC_GOOGLE_SHEETS_DESIGNER_FOLLOW_UP_ID,
        range: "Mockups Feitos!A1:E5", // Small range for testing
        includeHeaders: true,
      }),
    });
    
    console.log("📊 Test response status:", testResponse.status);
    
    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error("❌ Test API error:", errorText);
      return NextResponse.json({
        error: "Google Sheets API test failed",
        status: testResponse.status,
        details: errorText
      }, { status: 500 });
    }
    
    const testResult = await testResponse.json();
    console.log("✅ Test successful:", testResult);
    
    return NextResponse.json({
      success: true,
      message: "Google Sheets API is working",
      testResult: {
        hasData: !!testResult.data,
        dataStructure: testResult.data ? Object.keys(testResult.data) : [],
        rowCount: testResult.data?.data?.length || 0,
        headers: testResult.data?.headers || [],
        firstRow: testResult.data?.data?.[0] || null
      }
    });
    
  } catch (error) {
    console.error("❌ Test error:", error);
    return NextResponse.json({
      error: "Test failed",
      details: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
