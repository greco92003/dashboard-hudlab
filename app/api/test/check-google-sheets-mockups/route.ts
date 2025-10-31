import { NextRequest, NextResponse } from "next/server";

/**
 * Test endpoint to check what data is being read from Google Sheets
 * for the Mockups Feitos sheet
 */
export async function GET(request: NextRequest) {
  try {
    console.log("🧪 Testing Google Sheets Mockups data...");

    // Fetch data from Google Sheets
    const sheetsResponse = await fetch(
      `${request.nextUrl.origin}/api/google-sheets/read`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spreadsheetId:
            process.env.NEXT_PUBLIC_GOOGLE_SHEETS_DESIGNER_FOLLOW_UP_ID ||
            "1yjVv1CKWVBJ81Xxzgu5qQknQTMbt3EDk4UvxZRStuPM",
          range: "Mockups Feitos!A1:Z5000",
          includeHeaders: true,
        }),
      }
    );

    if (!sheetsResponse.ok) {
      const errorText = await sheetsResponse.text();
      throw new Error(`Google Sheets API error: ${errorText}`);
    }

    const sheetsData = await sheetsResponse.json();
    const rawData = sheetsData.data?.data || [];

    console.log("📊 Full Google Sheets response:", {
      success: sheetsData.success,
      cached: sheetsData.cached,
      totalRows: rawData.length,
      headers: sheetsData.data?.headers,
    });

    // Filter for October 30, 2025 data (check both US and BR formats)
    const oct30Data = rawData.filter((row: any) => {
      const atualizadoEm = row["Atualizado Em"] || row["Atualizado em"];
      return (
        atualizadoEm &&
        (atualizadoEm.includes("10/30/2025") || // US format
          atualizadoEm.includes("30/10/2025")) // BR format
      );
    });

    console.log("📅 October 30, 2025 data:", {
      count: oct30Data.length,
      records: oct30Data,
    });

    // Filter for Vitor and Felipe
    const vitorFelipeData = rawData.filter((row: any) => {
      const designer = row["Designer"]?.toString().toLowerCase();
      return (
        designer &&
        (designer.includes("vitor") ||
          designer.includes("vítor") ||
          designer.includes("felipe"))
      );
    });

    console.log("👨‍💻 Vitor and Felipe data:", {
      count: vitorFelipeData.length,
      records: vitorFelipeData.slice(0, 10),
    });

    // Check for Oct 30, 2025 data for Vitor and Felipe (both date formats)
    const oct30VitorFelipe = rawData.filter((row: any) => {
      const atualizadoEm = row["Atualizado Em"] || row["Atualizado em"];
      const designer = row["Designer"]?.toString().toLowerCase();
      return (
        atualizadoEm &&
        (atualizadoEm.includes("10/30/2025") || // US format
          atualizadoEm.includes("30/10/2025")) && // BR format
        designer &&
        (designer.includes("vitor") ||
          designer.includes("vítor") ||
          designer.includes("felipe"))
      );
    });

    console.log("🎯 October 30, 2025 - Vitor and Felipe:", {
      count: oct30VitorFelipe.length,
      records: oct30VitorFelipe,
    });

    return NextResponse.json({
      success: true,
      summary: {
        totalRows: rawData.length,
        headers: sheetsData.data?.headers,
        oct30Count: oct30Data.length,
        vitorFelipeCount: vitorFelipeData.length,
        oct30VitorFelipeCount: oct30VitorFelipe.length,
      },
      data: {
        sampleRows: rawData.slice(0, 5),
        oct30Data: oct30Data,
        vitorFelipeData: vitorFelipeData.slice(0, 10),
        oct30VitorFelipe: oct30VitorFelipe,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error testing Google Sheets:", error);
    return NextResponse.json(
      {
        error: "Failed to test Google Sheets",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
