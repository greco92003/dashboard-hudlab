import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import {
  normalizeSellerName,
  normalizeDesignerName,
} from "@/lib/utils/normalize-names";

// Helper function to normalize designer names (legacy - keeping for compatibility)
function normalizeDesignerNameLegacy(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// GET - Calculate goal progress
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get("goalId");

    if (!goalId) {
      return NextResponse.json(
        { error: "Goal ID is required" },
        { status: 400 }
      );
    }

    // Fetch the goal
    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("*")
      .eq("id", goalId)
      .single();

    if (goalError || !goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    // Fetch deals data for the goal period
    const { data: deals, error: dealsError } = await supabase
      .from("deals_cache")
      .select(
        `
        value, "quantidade-de-pares", vendedor, designer, closing_date
      `
      )
      .eq("sync_status", "synced")
      .not("closing_date", "is", null)
      .gte("closing_date", goal.start_date)
      .lte("closing_date", goal.end_date);

    if (dealsError) {
      console.error("Error fetching deals:", dealsError);
      return NextResponse.json(
        { error: "Failed to fetch deals data" },
        { status: 500 }
      );
    }

    // Filter deals based on target type
    let filteredDeals = deals || [];
    if (goal.target_type === "sellers") {
      filteredDeals = filteredDeals.filter(
        (deal) => deal.vendedor && deal.vendedor.trim() !== ""
      );
    } else if (goal.target_type === "designers") {
      filteredDeals = filteredDeals.filter(
        (deal) => deal.designer && deal.designer.trim() !== ""
      );
    }

    // Calculate general progress
    let generalProgress = 0;
    let generalCurrent = 0;

    if (goal.general_goal_value) {
      if (goal.goal_type === "total_sales") {
        generalCurrent = filteredDeals.reduce((sum, deal) => {
          return sum + (deal.value || 0) / 100; // Divide by 100 to get real values
        }, 0);
      } else if (goal.goal_type === "pairs_sold") {
        generalCurrent = filteredDeals.reduce((sum, deal) => {
          return sum + parseInt(deal["quantidade-de-pares"] || "0");
        }, 0);
      }
      generalProgress = (generalCurrent / goal.general_goal_value) * 100;
    }

    // Calculate individual progress
    const individualProgress: Record<
      string,
      { current: number; progress: number }
    > = {};

    if (goal.individual_goal_value) {
      const targetField =
        goal.target_type === "sellers" ? "vendedor" : "designer";

      // Group deals by individual (seller or designer)
      const individualStats = filteredDeals.reduce((acc: any, deal: any) => {
        let individualName = deal[targetField] || "Não informado";

        // Normalize names based on target type
        if (goal.target_type === "designers") {
          individualName = normalizeDesignerName(individualName);
        } else if (goal.target_type === "sellers") {
          individualName = normalizeSellerName(individualName);
        }

        if (!acc[individualName]) {
          acc[individualName] = {
            totalValue: 0,
            totalPairs: 0,
          };
        }

        acc[individualName].totalValue += (deal.value || 0) / 100;
        acc[individualName].totalPairs += parseInt(
          deal["quantidade-de-pares"] || "0"
        );

        return acc;
      }, {});

      // Calculate progress for each individual
      Object.entries(individualStats).forEach(
        ([name, stats]: [string, any]) => {
          let current = 0;
          if (goal.goal_type === "total_sales") {
            current = stats.totalValue;
          } else if (goal.goal_type === "pairs_sold") {
            current = stats.totalPairs;
          }

          individualProgress[name] = {
            current,
            progress: (current / goal.individual_goal_value) * 100,
          };
        }
      );
    }

    // Check if goal should be archived (past end date)
    const today = new Date().toISOString().split("T")[0];
    const shouldArchive = goal.status === "active" && goal.end_date < today;

    // Auto-archive if needed
    if (shouldArchive) {
      await supabase
        .from("goals")
        .update({ status: "archived" })
        .eq("id", goalId);

      goal.status = "archived";
    }

    // Ensure rewards field is properly formatted (Supabase JSONB already parsed)
    const goalWithParsedRewards = {
      ...goal,
      rewards: Array.isArray(goal.rewards) ? goal.rewards : [],
    };

    return NextResponse.json({
      data: {
        goal: goalWithParsedRewards,
        generalProgress: {
          current: generalCurrent,
          target: goal.general_goal_value,
          progress: Math.min(generalProgress, 100), // Cap at 100%
        },
        individualProgress,
        shouldArchive,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/goals/progress:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
