import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/auth-utils";

// POST - Criar notificações de demonstração
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const profile = await getUserProfile(supabase);

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verificar permissões
    if (!["owner", "admin"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const results = [];

    // 1. Notificação de venda simulada
    try {
      const saleResponse = await fetch(`${request.nextUrl.origin}/api/notifications/sale-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: "demo-order-001",
          orderNumber: "DEMO-001",
          brand: "Desculpa Qualquer Coisa",
          totalValue: 299.90,
          discounts: 29.99,
          customerName: "Cliente Demonstração",
          products: [
            {
              name: "Produto Demo",
              brand: "Desculpa Qualquer Coisa",
              price: 299.90,
              quantity: 1
            }
          ],
        }),
      });

      if (saleResponse.ok) {
        const saleResult = await saleResponse.json();
        results.push({
          type: "sale",
          success: true,
          message: `Notificação de venda enviada para ${saleResult.partnersCount} partners`,
          data: saleResult,
        });
      } else {
        results.push({
          type: "sale",
          success: false,
          message: "Falha ao enviar notificação de venda",
        });
      }
    } catch (error) {
      results.push({
        type: "sale",
        success: false,
        message: "Erro ao enviar notificação de venda",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 2. Notificação informativa para todos os admins
    try {
      const infoResponse = await fetch(`${request.nextUrl.origin}/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "🎉 Sistema de Notificações Ativo",
          message: "O novo sistema de notificações está funcionando perfeitamente! Agora você receberá alertas em tempo real sobre vendas e outras atividades importantes.",
          type: "success",
          target_type: "role",
          target_roles: ["owner", "admin"],
          send_push: true,
        }),
      });

      if (infoResponse.ok) {
        const infoResult = await infoResponse.json();
        results.push({
          type: "info",
          success: true,
          message: `Notificação informativa enviada para ${infoResult.targetUsersCount} usuários`,
          data: infoResult,
        });
      } else {
        results.push({
          type: "info",
          success: false,
          message: "Falha ao enviar notificação informativa",
        });
      }
    } catch (error) {
      results.push({
        type: "info",
        success: false,
        message: "Erro ao enviar notificação informativa",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 3. Notificação de aviso para partners-media
    try {
      const warningResponse = await fetch(`${request.nextUrl.origin}/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "⚠️ Atualização Importante",
          message: "Lembre-se de verificar regularmente seu dashboard para acompanhar suas comissões e vendas. O sistema agora envia notificações automáticas para cada venda!",
          type: "warning",
          target_type: "role",
          target_roles: ["partners-media"],
          send_push: true,
        }),
      });

      if (warningResponse.ok) {
        const warningResult = await warningResponse.json();
        results.push({
          type: "warning",
          success: true,
          message: `Notificação de aviso enviada para ${warningResult.targetUsersCount} partners`,
          data: warningResult,
        });
      } else {
        results.push({
          type: "warning",
          success: false,
          message: "Falha ao enviar notificação de aviso",
        });
      }
    } catch (error) {
      results.push({
        type: "warning",
        success: false,
        message: "Erro ao enviar notificação de aviso",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 4. Notificação pessoal para o usuário atual
    try {
      const personalResponse = await fetch(`${request.nextUrl.origin}/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "✅ Teste Pessoal",
          message: `Olá ${profile.first_name || profile.email}! Esta é uma notificação de teste pessoal para verificar se tudo está funcionando corretamente.`,
          type: "info",
          target_type: "user",
          target_user_ids: [profile.id],
          send_push: true,
        }),
      });

      if (personalResponse.ok) {
        const personalResult = await personalResponse.json();
        results.push({
          type: "personal",
          success: true,
          message: "Notificação pessoal enviada",
          data: personalResult,
        });
      } else {
        results.push({
          type: "personal",
          success: false,
          message: "Falha ao enviar notificação pessoal",
        });
      }
    } catch (error) {
      results.push({
        type: "personal",
        success: false,
        message: "Erro ao enviar notificação pessoal",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    return NextResponse.json({
      message: `Demo concluída: ${successCount}/${totalCount} notificações enviadas com sucesso`,
      results,
      summary: {
        total: totalCount,
        success: successCount,
        failed: totalCount - successCount,
      },
    });

  } catch (error) {
    console.error("Error in notifications demo:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
