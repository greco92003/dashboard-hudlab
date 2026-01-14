import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/ote/sellers
 * Lista todos os vendedores OTE
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verificar autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    // Buscar vendedores
    const { data: sellers, error } = await supabase
      .from("ote_sellers")
      .select("*")
      .order("seller_name", { ascending: true });

    if (error) {
      console.error("Erro ao buscar vendedores:", error);
      return NextResponse.json(
        { error: "Erro ao buscar vendedores" },
        { status: 500 }
      );
    }

    return NextResponse.json({ sellers });

  } catch (error) {
    console.error("Erro ao buscar vendedores:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ote/sellers
 * Cria um novo vendedor OTE
 * 
 * Body: {
 *   user_id: string,
 *   seller_name: string,
 *   salary_fixed: number,
 *   commission_percentage: number,
 *   active: boolean
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verificar autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    // Verificar se é admin ou owner
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "owner"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Sem permissão" },
        { status: 403 }
      );
    }

    // Parse do body
    const body = await request.json();
    const { user_id, seller_name, salary_fixed, commission_percentage, active } = body;

    if (!user_id || !seller_name || salary_fixed === undefined || commission_percentage === undefined) {
      return NextResponse.json(
        { error: "Campos obrigatórios faltando" },
        { status: 400 }
      );
    }

    // Criar vendedor
    const { data: seller, error } = await supabase
      .from("ote_sellers")
      .insert({
        user_id,
        seller_name,
        salary_fixed,
        commission_percentage,
        active: active !== undefined ? active : true,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Erro ao criar vendedor:", error);
      return NextResponse.json(
        { error: "Erro ao criar vendedor" },
        { status: 500 }
      );
    }

    return NextResponse.json({ seller }, { status: 201 });

  } catch (error) {
    console.error("Erro ao criar vendedor:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ote/sellers
 * Atualiza um vendedor OTE
 * 
 * Body: {
 *   id: string,
 *   seller_name?: string,
 *   salary_fixed?: number,
 *   commission_percentage?: number,
 *   active?: boolean
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verificar autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    // Verificar se é admin ou owner
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "owner"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Sem permissão" },
        { status: 403 }
      );
    }

    // Parse do body
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID é obrigatório" },
        { status: 400 }
      );
    }

    // Atualizar vendedor
    const { data: seller, error } = await supabase
      .from("ote_sellers")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Erro ao atualizar vendedor:", error);
      return NextResponse.json(
        { error: "Erro ao atualizar vendedor" },
        { status: 500 }
      );
    }

    return NextResponse.json({ seller });

  } catch (error) {
    console.error("Erro ao atualizar vendedor:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

