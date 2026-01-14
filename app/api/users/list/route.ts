import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/users/list
 * Lista todos os usuários aprovados do sistema
 * Apenas para admins e owners
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

    // Verificar se é admin ou owner
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "owner"].includes(profile.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Buscar usuários aprovados com seus perfis
    const { data: profiles, error } = await supabase
      .from("user_profiles")
      .select("id, first_name, last_name, email, role, approved")
      .eq("approved", true)
      .order("first_name", { ascending: true });

    if (error) {
      console.error("Erro ao buscar usuários:", error);
      return NextResponse.json(
        { error: "Erro ao buscar usuários" },
        { status: 500 }
      );
    }

    // Formatar os dados para incluir o nome completo
    const users =
      profiles?.map((profile) => ({
        id: profile.id,
        name:
          `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
          profile.email,
        email: profile.email,
        role: profile.role,
      })) || [];

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
