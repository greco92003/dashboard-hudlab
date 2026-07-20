import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminOrCron } from "@/lib/security/route-guards";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST - Criar notificação automática de venda
export async function POST(request: NextRequest) {
  try {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    const body = await request.json();

    const {
      orderId,
      orderNumber,
      brand,
      totalValue,
      discounts = 0,
      customerName,
      products = [],
    } = body;

    // Validações
    if (!orderId || !brand || totalValue === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: orderId, brand, totalValue" },
        { status: 400 }
      );
    }

    // Buscar configurações de comissão para a marca específica
    const { data: commissionSettings } = await supabase
      .from("partners_commission_settings")
      .select("percentage")
      .eq("brand", brand)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    const commissionPercentage = commissionSettings?.percentage || 5.0;

    // Calcular valor real da venda (subtotal - descontos, sem frete)
    const realRevenue = Math.max(0, totalValue - discounts);
    const commissionValue = (realRevenue * commissionPercentage) / 100;

    // Buscar partners-media da marca
    const { data: brandPartners, error: partnersError } = await supabase
      .from("user_profiles")
      .select("id, email, first_name, last_name")
      .eq("role", "partners-media")
      .eq("assigned_brand", brand)
      .eq("approved", true);

    if (partnersError) {
      console.error("Error fetching brand partners:", partnersError);
      return NextResponse.json(
        { error: "Failed to fetch brand partners" },
        { status: 500 }
      );
    }

    if (!brandPartners || brandPartners.length === 0) {
      console.log(`No partners found for brand: ${brand}`);
      return NextResponse.json({
        message: "No partners found for this brand",
        brand,
        partnersCount: 0,
      });
    }

    // Preparar dados da notificação
    const title = `💰 Nova Venda - ${brand}`;
    const message = `Parabéns! Uma nova venda foi realizada para a marca ${brand}. Sua comissão: R$ ${commissionValue.toFixed(
      2
    )}`;

    const notificationData = {
      orderId,
      orderNumber,
      brand,
      totalValue,
      discounts,
      realRevenue,
      commissionPercentage,
      commissionValue,
      customerName,
      products: products.slice(0, 3), // Limitar a 3 produtos para não sobrecarregar
      saleDate: new Date().toISOString(),
    };

    // Criar notificação principal
    const { data: notification, error: notificationError } = await supabase
      .from("notifications")
      .insert({
        title,
        message,
        type: "sale",
        data: notificationData,
        created_by_user_id: null, // Sistema
        created_by_name: "Sistema HudLab",
        created_by_email: "sistema@hudlab.com",
        target_type: "brand_partners",
        target_brand: brand,
        send_push: true,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (notificationError) {
      console.error("Error creating sale notification:", notificationError);
      return NextResponse.json(
        { error: "Failed to create sale notification" },
        { status: 500 }
      );
    }

    // Criar user_notifications para cada partner
    const userNotifications = brandPartners.map((partner) => ({
      notification_id: notification.id,
      user_id: partner.id,
      is_read: false,
    }));

    const { error: userNotificationsError } = await supabase
      .from("user_notifications")
      .insert(userNotifications);

    if (userNotificationsError) {
      console.error(
        "Error creating user notifications:",
        userNotificationsError
      );
      return NextResponse.json(
        { error: "Failed to create user notifications" },
        { status: 500 }
      );
    }

    // Enviar push notifications
    try {
      const pushResponse = await fetch(
        `${request.nextUrl.origin}/api/notifications/send-push`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify({
            notificationId: notification.id,
            userIds: brandPartners.map((p) => p.id),
          }),
        }
      );

      const pushResult = await pushResponse.json();

      console.log(
        `📱 Sale notification sent to ${brandPartners.length} partners for brand ${brand}`
      );
      console.log(
        `💰 Commission value: R$ ${commissionValue.toFixed(
          2
        )} (${commissionPercentage}%)`
      );

      return NextResponse.json({
        message: "Sale notification sent successfully",
        notification,
        partnersCount: brandPartners.length,
        commissionValue,
        commissionPercentage,
        pushResult,
      });
    } catch (pushError) {
      console.warn("Failed to send push notifications:", pushError);

      return NextResponse.json({
        message: "Sale notification created but push failed",
        notification,
        partnersCount: brandPartners.length,
        commissionValue,
        commissionPercentage,
        pushError:
          pushError instanceof Error ? pushError.message : "Unknown error",
      });
    }
  } catch (error) {
    console.error("Error in sale notification:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
