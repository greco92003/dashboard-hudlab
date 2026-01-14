import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/ote/dashboard
 * Retorna o dashboard completo do vendedor logado
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

    // 1. Buscar dados do vendedor
    const { data: seller, error: sellerError } = await supabase
      .from("ote_sellers")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true)
      .single();

    if (sellerError || !seller) {
      return NextResponse.json(
        { error: "Vendedor não encontrado ou inativo" },
        { status: 404 }
      );
    }

    // 2. Buscar meta do mês atual (meta única da empresa)
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const { data: currentTarget } = await supabase
      .from("ote_monthly_targets")
      .select("*")
      .eq("month", currentMonth)
      .eq("year", currentYear)
      .single();

    // 3. Calcular comissão do mês atual (se houver meta)
    let currentMonthData = null;
    if (currentTarget) {
      try {
        const calcResponse = await fetch(
          `${request.nextUrl.origin}/api/ote/calculate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: request.headers.get("cookie") || "",
            },
            body: JSON.stringify({
              seller_id: seller.id,
              month: currentMonth,
              year: currentYear,
            }),
          }
        );

        if (calcResponse.ok) {
          currentMonthData = await calcResponse.json();
        }
      } catch (error) {
        console.error("Erro ao calcular comissão do mês atual:", error);
      }
    }

    // 4. Buscar histórico dos últimos 6 meses
    const { data: history } = await supabase
      .from("ote_commission_history")
      .select("*")
      .eq("seller_id", seller.id)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(6);

    // 5. Buscar notificações não lidas
    const { data: notifications } = await supabase
      .from("ote_notifications")
      .select("*")
      .eq("user_id", user.id)
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(10);

    // 6. Montar resposta
    const dashboard = {
      seller,
      current_month: currentMonthData,
      monthly_target: currentTarget,
      previous_months: history || [],
      notifications: notifications || [],
    };

    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("Erro ao buscar dashboard:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
