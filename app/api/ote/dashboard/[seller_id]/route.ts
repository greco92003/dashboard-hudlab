import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/ote/dashboard/[seller_id]
 * Retorna o dashboard de um vendedor específico (apenas para admins/owners)
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ seller_id: string }> }
) {
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

    // Await params (Next.js 15+)
    const params = await props.params;
    const seller_id = params.seller_id;

    console.log("URL:", request.url);
    console.log("Params recebidos:", params);
    console.log("seller_id extraído:", seller_id);

    if (!seller_id) {
      return NextResponse.json(
        { error: "seller_id é obrigatório", receivedParams: params },
        { status: 400 }
      );
    }

    // 1. Buscar dados do vendedor
    const { data: seller, error: sellerError } = await supabase
      .from("ote_sellers")
      .select("*")
      .eq("id", seller_id)
      .single();

    if (sellerError || !seller) {
      return NextResponse.json(
        { error: "Vendedor não encontrado" },
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
    const { data: history, error: historyError } = await supabase
      .from("ote_commission_history")
      .select("*")
      .eq("seller_id", seller.id)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(6);

    if (historyError) {
      console.error("Erro ao buscar histórico:", historyError);
    }

    // 5. Buscar notificações não lidas
    const { data: notifications, error: notificationsError } = await supabase
      .from("ote_notifications")
      .select("*")
      .eq("seller_id", seller.id)
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(10);

    if (notificationsError) {
      console.error("Erro ao buscar notificações:", notificationsError);
    }

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
    console.error("Erro ao buscar dashboard do vendedor:", error);
    return NextResponse.json(
      {
        error: "Erro interno do servidor",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
