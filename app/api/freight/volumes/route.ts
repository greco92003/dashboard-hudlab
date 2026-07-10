import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

async function checkAuth(supabase: ReturnType<typeof createServerClient>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const user = await checkAuth(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("freight_volumes")
      .select("*")
      .order("pairs_capacity", { ascending: true });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET freight_volumes error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const user = await checkAuth(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, pairs_capacity, weight_kg, width_cm, height_cm, depth_cm } = body;

    if (!name || !pairs_capacity) {
      return NextResponse.json({ error: "Nome e capacidade são obrigatórios" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("freight_volumes")
      .insert([{ name, pairs_capacity, weight_kg, width_cm, height_cm, depth_cm }])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("POST freight_volumes error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
