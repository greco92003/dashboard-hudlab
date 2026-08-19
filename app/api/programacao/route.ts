import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { createClient } from "@/utils/supabase/server";
import { fetchAllSupabaseRows } from "@/lib/supabase-pagination";

// GET GHL deals from the unified deals_cache organized by shipping date.
export async function GET(request: NextRequest) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

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

    console.log("📦 Fetching all won GHL deals from deals_cache...");

    // Supabase projects commonly cap each response at 1,000 rows.
    const deals = await fetchAllSupabaseRows<any>(
      (from, to) =>
        supabase
          .from("deals_cache")
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
        "quantidade-de-pares",
        vendedor,
        designer
      `,
          )
          .eq("source_system", "ghl")
          .eq("status", "won")
          .eq("sync_status", "synced")
          .order("data_embarque", { ascending: true, nullsFirst: false })
          .order("deal_id", { ascending: true })
          .range(from, to),
      "Programacao deals read failed",
    );

    console.log(`✅ Found ${deals.length} deals`);

    // Group deals by data_embarque (shipping date)
    const dealsByEmbarque = new Map<string, any[]>();

    deals.forEach((deal) => {
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
        quantidadePares: deal["quantidade-de-pares"],
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
    const totalDeals = deals.length;
    const totalValue =
      deals.reduce((sum, deal) => sum + (deal.value || 0), 0) || 0;

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
      { status: 500 },
    );
  }
}
