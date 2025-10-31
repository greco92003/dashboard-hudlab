import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Check if table exists and has data
    const { data: tableData, error: tableError } = await supabase
      .from("designer_mockups_cache")
      .select("*", { count: "exact" })
      .limit(5);

    console.log("📊 Table check:", {
      hasError: !!tableError,
      error: tableError?.message,
      rowCount: tableData?.length,
    });

    // Try to call the function
    console.log("🔍 Attempting to call get_designer_mockups_stats function...");
    const { data: funcData, error: funcError } = await supabase.rpc(
      "get_designer_mockups_stats",
      {
        p_designers: ["Vitor", "Felipe"],
        p_start_date: null,
        p_end_date: null,
      }
    );

    console.log("📊 Function call result:", {
      hasError: !!funcError,
      error: funcError?.message,
      code: funcError?.code,
      details: funcError?.details,
      hint: funcError?.hint,
      data: funcData,
    });

    // Check records for 10/30/2025
    const { data: oct30Data, error: oct30Error } = await supabase
      .from("designer_mockups_cache")
      .select(
        "nome_negocio, designer, etapa_funil, atualizado_em_raw, atualizado_em"
      )
      .eq("atualizado_em_raw", "10/30/2025")
      .limit(10);

    // Check records with parsed date 2025-10-30
    const { data: parsedOct30Data, error: parsedOct30Error } = await supabase
      .from("designer_mockups_cache")
      .select(
        "nome_negocio, designer, etapa_funil, atualizado_em_raw, atualizado_em"
      )
      .eq("atualizado_em", "2025-10-30")
      .limit(10);

    // Test the function with date filter for Oct 30
    const { data: functionOct30Data, error: functionOct30Error } =
      await supabase.rpc("get_designer_mockups_stats", {
        p_designers: ["Vitor", "Felipe"],
        p_start_date: "2025-10-30",
        p_end_date: "2025-10-30",
      });

    return NextResponse.json({
      tableCheck: {
        hasError: !!tableError,
        error: tableError?.message,
        rowCount: tableData?.length,
        sampleData: tableData?.slice(0, 2),
      },
      oct30RawCheck: {
        hasError: !!oct30Error,
        error: oct30Error?.message,
        rowCount: oct30Data?.length || 0,
        data: oct30Data,
      },
      oct30ParsedCheck: {
        hasError: !!parsedOct30Error,
        error: parsedOct30Error?.message,
        rowCount: parsedOct30Data?.length || 0,
        data: parsedOct30Data,
      },
      functionCheck: {
        hasError: !!funcError,
        error: funcError?.message,
        code: funcError?.code,
        details: funcError?.details,
        hint: funcError?.hint,
        data: funcData,
      },
      functionOct30Check: {
        hasError: !!functionOct30Error,
        error: functionOct30Error?.message,
        data: functionOct30Data,
      },
    });
  } catch (error) {
    console.error("❌ Error:", error);
    return NextResponse.json(
      {
        error: "Test failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
