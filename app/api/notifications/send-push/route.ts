import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminOrCron } from "@/lib/security/route-guards";

// Configurar web-push com as chaves VAPID
const vapidKeys = {
  publicKey:
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    "BIR3mNGleITndcH1jIAAF4Cva8sGIHJnhQdYDjPw6yC8XnH96or0C5nFdlbb8PZt4gaFs10MjXl6H8ZaYLeUsiI",
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

// Verificar se as chaves VAPID estão configuradas
if (!vapidKeys.privateKey) {
  console.error("❌ VAPID_PRIVATE_KEY não configurada!");
  throw new Error("VAPID private key not configured");
}

console.log("🔑 VAPID Keys status:", {
  publicKeyConfigured: Boolean(vapidKeys.publicKey),
  privateKeyConfigured: Boolean(vapidKeys.privateKey),
});

webpush.setVapidDetails(
  "mailto:hudlabprivatelabel@gmail.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// POST - Enviar push notifications
export async function POST(request: NextRequest) {
  try {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    // This privileged client is unreachable until the admin/cron guard passes.
    const supabase: any = createServiceClient();

    const body = await request.json();
    const { notificationId, userIds, title, message, type, data } = body;

    let notification = null;
    let targetUserIds = userIds;

    // Se notificationId foi fornecido, buscar dados da notificação
    if (notificationId) {
      const { data: notificationData, error: notificationError } =
        await supabase
          .from("notifications")
          .select("*")
          .eq("id", notificationId)
          .single();

      if (notificationError || !notificationData) {
        return NextResponse.json(
          { error: "Notification not found" },
          { status: 404 }
        );
      }

      notification = notificationData;

      // Se userIds não foi fornecido, buscar usuários da notificação
      if (!targetUserIds) {
        const { data: userNotifications } = await supabase
          .from("user_notifications")
          .select("user_id")
          .eq("notification_id", notificationId);

        targetUserIds =
          userNotifications?.map((un: { user_id: string }) => un.user_id) || [];
      }
    }

    if (!targetUserIds || targetUserIds.length === 0) {
      console.error("❌ No target users specified");
      return NextResponse.json(
        { error: "No target users specified" },
        { status: 400 }
      );
    }

    console.log("🎯 Target users:", targetUserIds);

    // Buscar subscriptions ativas dos usuários
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", targetUserIds)
      .eq("is_active", true);

    if (subscriptionsError) {
      console.error("❌ Error fetching subscriptions:", subscriptionsError);
      return NextResponse.json(
        { error: "Failed to fetch subscriptions" },
        { status: 500 }
      );
    }

    console.log("📱 Found subscriptions:", subscriptions?.length || 0);

    if (!subscriptions || subscriptions.length === 0) {
      console.warn(
        "⚠️ No active subscriptions found for users:",
        targetUserIds
      );
      return NextResponse.json(
        { message: "No active subscriptions found", sent: 0, failed: 0 },
        { status: 200 }
      );
    }

    // Preparar payload da notificação
    const pushPayload = {
      title: title || notification?.title || "HudLab Dashboard",
      message: message || notification?.message || "Nova notificação",
      type: type || notification?.type || "info",
      notificationId: notificationId,
      url: "/",
      data: data || notification?.data || {},
      timestamp: Date.now(),
    };

    // Customizar URL baseado no tipo
    if (pushPayload.type === "sale" && pushPayload.data?.brand) {
      pushPayload.url = "/partners/dashboard";
    }

    const pushOptions = {
      vapidDetails: {
        subject: "mailto:hudlabprivatelabel@gmail.com",
        publicKey: vapidKeys.publicKey,
        privateKey: vapidKeys.privateKey!,
      },
      TTL: 24 * 60 * 60, // 24 horas
    };

    let sentCount = 0;
    let failedCount = 0;
    const failedSubscriptions: string[] = [];

    console.log(
      "📤 Sending push notifications to",
      subscriptions.length,
      "subscriptions"
    );
    console.log("📦 Push payload:", pushPayload);

    // Enviar push notification para cada subscription
    for (const subscription of subscriptions) {
      try {
        console.log(
          `📱 Sending to subscription ${subscription.id} for user ${subscription.user_id}`
        );

        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh_key,
            auth: subscription.auth_key,
          },
        };

        console.log(
          `🔗 Endpoint: ${subscription.endpoint.substring(0, 50)}...`
        );

        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(pushPayload),
          pushOptions
        );

        sentCount++;
        console.log(`✅ Successfully sent to subscription ${subscription.id}`);

        // Atualizar last_used_at da subscription
        await supabase
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", subscription.id);

        // Registrar envio na user_notification se existe
        if (notificationId) {
          await supabase
            .from("user_notifications")
            .update({
              push_sent: true,
              push_sent_at: new Date().toISOString(),
            })
            .eq("notification_id", notificationId)
            .eq("user_id", subscription.user_id);
        }
      } catch (error: any) {
        console.error(
          `❌ Failed to send push to subscription ${subscription.id}:`,
          error
        );
        console.error(`❌ Error details:`, {
          statusCode: error.statusCode,
          message: error.message,
          endpoint: subscription.endpoint.substring(0, 50) + "...",
        });

        failedCount++;
        failedSubscriptions.push(subscription.id);

        // Se a subscription é inválida, desativá-la
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(
            `🗑️ Deactivating invalid subscription ${subscription.id}`
          );
          await supabase
            .from("push_subscriptions")
            .update({ is_active: false })
            .eq("id", subscription.id);
        }

        // Registrar erro na user_notification se existe
        if (notificationId) {
          await supabase
            .from("user_notifications")
            .update({
              push_sent: false,
              push_error: error.message || "Failed to send push notification",
            })
            .eq("notification_id", notificationId)
            .eq("user_id", subscription.user_id);
        }
      }
    }

    // Atualizar contadores na notificação se existe
    if (notificationId) {
      await supabase
        .from("notifications")
        .update({
          push_sent_count: sentCount,
          push_failed_count: failedCount,
        })
        .eq("id", notificationId);
    }

    console.log(
      `📱 Push notifications sent: ${sentCount}, failed: ${failedCount}`
    );

    return NextResponse.json({
      message: "Push notifications processed",
      sent: sentCount,
      failed: failedCount,
      totalSubscriptions: subscriptions.length,
      failedSubscriptions,
    });
  } catch (error) {
    console.error("Error sending push notifications:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
