import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// GET - Retrieve the current pair value
export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pair_values")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "no rows returned"
      console.error("Error fetching pair value:", error);
      return NextResponse.json(
        { error: "Failed to fetch pair value" },
        { status: 500 },
      );
    }

    // If no data exists, return default value
    if (!data) {
      return NextResponse.json({
        value: "100,00",
        id: null,
        created_at: null,
        updated_at: null,
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST - Create or update the pair value
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { value } = await request.json();

    if (!value || typeof value !== "string") {
      return NextResponse.json(
        { error: "Value is required and must be a string" },
        { status: 400 },
      );
    }

    // Check if there's already a value in the database
    const { data: existingData } = await supabase
      .from("pair_values")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let result;

    if (existingData) {
      // Update existing record
      const { data, error } = await supabase
        .from("pair_values")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("id", existingData.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating pair value:", error);
        return NextResponse.json(
          { error: "Failed to update pair value" },
          { status: 500 },
        );
      }

      result = data;
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from("pair_values")
        .insert({ value })
        .select()
        .single();

      if (error) {
        console.error("Error creating pair value:", error);
        return NextResponse.json(
          { error: "Failed to create pair value" },
          { status: 500 },
        );
      }

      result = data;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
