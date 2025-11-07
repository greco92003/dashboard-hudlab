import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// GET endpoint to fetch deals from programacao_cache organized by shipping date
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is approved
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    console.log("📦 Fetching deals from programacao_cache...");

    // Fetch deals from programacao_cache
    const { data: deals, error: dealsError } = await supabase
      .from("programacao_cache")
      .select(
        `
        deal_id,
        title,
        value,
        currency,
        stage_id,
        stage_title,
        data_embarque,
        created_date,
        estado,
        quantidade_pares,
        vendedor,
        designer
      `
      )
      .eq("sync_status", "synced")
      .order("data_embarque", { ascending: true, nullsFirst: false });

    if (dealsError) {
      console.error("❌ Error fetching deals:", dealsError);
      return NextResponse.json(
        { error: "Failed to fetch deals", details: dealsError.message },
        { status: 500 }
      );
    }

    console.log(`✅ Found ${deals?.length || 0} deals`);

    // Group deals by data_embarque (shipping date)
    const dealsByEmbarque = new Map<string, any[]>();

    deals?.forEach((deal) => {
      const embarqueDate = deal.data_embarque || "Sem data de embarque";
      if (!dealsByEmbarque.has(embarqueDate)) {
        dealsByEmbarque.set(embarqueDate, []);
      }
      dealsByEmbarque.get(embarqueDate)!.push({
        id: deal.deal_id,
        title: deal.title,
        value: deal.value,
        currency: deal.currency,
        stageTitle: deal.stage_title,
        createdDate: deal.created_date,
        estado: deal.estado,
        quantidadePares: deal.quantidade_pares,
        vendedor: deal.vendedor,
        designer: deal.designer,
        customField54: deal.data_embarque,
      });
    });

    // Transform into groups array sorted by date
    const groups = Array.from(dealsByEmbarque.entries())
      .map(([embarqueDate, groupDeals]) => ({
        id: embarqueDate,
        title: embarqueDate,
        dealsCount: groupDeals.length,
        deals: groupDeals,
      }))
      .sort((a, b) => {
        // Sort groups by date (DD/MM/YYYY format)
        if (a.title === "Sem data de embarque") return 1;
        if (b.title === "Sem data de embarque") return -1;

        const parseDate = (dateStr: string) => {
          const [day, month, year] = dateStr.split("/").map(Number);
          return new Date(year, month - 1, day).getTime();
        };

        try {
          return parseDate(a.title) - parseDate(b.title);
        } catch {
          return 0;
        }
      });

    // Calculate summary statistics
    const totalDeals = deals?.length || 0;
    const totalValue =
      deals?.reduce((sum, deal) => sum + (deal.value || 0), 0) || 0;

    return NextResponse.json({
      success: true,
      message: "Successfully retrieved deals from cache",
      summary: {
        totalDeals,
        totalValue: totalValue / 100, // Convert from cents
        totalGroups: groups.length,
      },
      groups,
      debug: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("❌ Error in programacao endpoint:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        stack: error instanceof Error ? error.stack : null,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
