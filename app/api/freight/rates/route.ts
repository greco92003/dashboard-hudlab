import { getSupabasePublishableKey } from "@/lib/supabase/keys-public";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const carrierId = searchParams.get("carrier_id");

    let query = supabase
      .from("freight_rates")
      .select("*")
      .order("destination_state", { ascending: true });

    if (carrierId) {
      query = query.eq("carrier_id", carrierId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET freight_rates error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { carrier_id, destination_state, price_per_volume, min_price, delivery_days_min, delivery_days_max, notes } = body;

    if (!carrier_id || !destination_state || price_per_volume === undefined) {
      return NextResponse.json({ error: "carrier_id, destination_state e price_per_volume são obrigatórios" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("freight_rates")
      .upsert([{ carrier_id, destination_state, price_per_volume, min_price, delivery_days_min, delivery_days_max, notes }], {
        onConflict: "carrier_id,destination_state",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("POST freight_rates error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
