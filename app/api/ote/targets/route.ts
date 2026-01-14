import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/ote/targets
 * Lista todas as metas mensais da empresa
 * Query params: month, year
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    // Construir query
    let query = supabase
      .from("ote_monthly_targets")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    if (month) {
      query = query.eq("month", parseInt(month));
    }
    if (year) {
      query = query.eq("year", parseInt(year));
    }

    const { data: targets, error } = await query;

    if (error) {
      console.error("Erro ao buscar metas:", error);
      return NextResponse.json(
        { error: "Erro ao buscar metas" },
        { status: 500 }
      );
    }

    return NextResponse.json({ targets });
  } catch (error) {
    console.error("Erro ao buscar metas:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ote/targets
 * Cria uma nova meta mensal da empresa
 *
 * Body: {
 *   month: number,
 *   year: number,
 *   target_amount: number
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // Verificar se é admin ou owner
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "owner"].includes(profile.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Parse do body
    const body = await request.json();
    const { month, year, target_amount } = body;

    if (!month || !year || target_amount === undefined) {
      return NextResponse.json(
        { error: "Campos obrigatórios faltando" },
        { status: 400 }
      );
    }

    // Validar mês e ano
    if (month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Mês inválido (1-12)" },
        { status: 400 }
      );
    }

    if (year < 2020 || year > 2100) {
      return NextResponse.json({ error: "Ano inválido" }, { status: 400 });
    }

    // Criar meta
    const { data: target, error } = await supabase
      .from("ote_monthly_targets")
      .insert({
        month,
        year,
        target_amount,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Erro ao criar meta:", error);

      // Verificar se é erro de duplicação
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Já existe uma meta para este mês/ano" },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Erro ao criar meta" },
        { status: 500 }
      );
    }

    return NextResponse.json({ target }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar meta:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ote/targets
 * Atualiza uma meta OTE
 *
 * Body: {
 *   id: string,
 *   target_amount?: number
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // Verificar se é admin ou owner
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "owner"].includes(profile.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Parse do body
    const body = await request.json();
    const { id, target_amount } = body;

    if (!id || target_amount === undefined) {
      return NextResponse.json(
        { error: "ID e target_amount são obrigatórios" },
        { status: 400 }
      );
    }

    // Atualizar meta
    const { data: target, error } = await supabase
      .from("ote_monthly_targets")
      .update({ target_amount })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Erro ao atualizar meta:", error);
      return NextResponse.json(
        { error: "Erro ao atualizar meta" },
        { status: 500 }
      );
    }

    return NextResponse.json({ target });
  } catch (error) {
    console.error("Erro ao atualizar meta:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
