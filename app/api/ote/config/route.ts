import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/ote/config
 * Retorna a configuração ativa do sistema OTE
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

    // Buscar configuração ativa
    const { data: config, error } = await supabase
      .from("ote_config")
      .select("*")
      .eq("active", true)
      .single();

    if (error || !config) {
      return NextResponse.json(
        { error: "Configuração não encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ config });

  } catch (error) {
    console.error("Erro ao buscar configuração:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ote/config
 * Atualiza a configuração do sistema OTE
 * 
 * Body: {
 *   paid_traffic_percentage?: number,
 *   organic_percentage?: number,
 *   multipliers?: OTEMultiplier[]
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
    const updates: any = {};

    if (body.paid_traffic_percentage !== undefined) {
      updates.paid_traffic_percentage = body.paid_traffic_percentage;
    }
    if (body.organic_percentage !== undefined) {
      updates.organic_percentage = body.organic_percentage;
    }
    if (body.multipliers !== undefined) {
      updates.multipliers = body.multipliers;
    }

    // Validar que as porcentagens somam 100%
    if (updates.paid_traffic_percentage !== undefined || updates.organic_percentage !== undefined) {
      const paidTraffic = updates.paid_traffic_percentage ?? (await supabase
        .from("ote_config")
        .select("paid_traffic_percentage")
        .eq("active", true)
        .single()).data?.paid_traffic_percentage ?? 80;
      
      const organic = updates.organic_percentage ?? (await supabase
        .from("ote_config")
        .select("organic_percentage")
        .eq("active", true)
        .single()).data?.organic_percentage ?? 20;

      if (paidTraffic + organic !== 100) {
        return NextResponse.json(
          { error: "As porcentagens devem somar 100%" },
          { status: 400 }
        );
      }
    }

    // Buscar configuração ativa
    const { data: currentConfig } = await supabase
      .from("ote_config")
      .select("id")
      .eq("active", true)
      .single();

    if (!currentConfig) {
      return NextResponse.json(
        { error: "Configuração não encontrada" },
        { status: 404 }
      );
    }

    // Atualizar configuração
    const { data: config, error } = await supabase
      .from("ote_config")
      .update(updates)
      .eq("id", currentConfig.id)
      .select()
      .single();

    if (error) {
      console.error("Erro ao atualizar configuração:", error);
      return NextResponse.json(
        { error: "Erro ao atualizar configuração" },
        { status: 500 }
      );
    }

    return NextResponse.json({ config });

  } catch (error) {
    console.error("Erro ao atualizar configuração:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

