import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserProfile } from "@/lib/auth-utils";

// POST - Enviar notificação de teste
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const profile = await getUserProfile(supabase);

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      userId = profile.id,
      title = "Teste de Notificação",
      message = "Esta é uma notificação de teste do HudLab Dashboard!",
      type = "info",
    } = body;

    // Usar service client para criar notificação (bypass RLS)
    const serviceSupabase = createServiceClient();

    // Criar notificação de teste
    const { data: notification, error: notificationError } =
      await serviceSupabase
        .from("notifications")
        .insert({
          title,
          message,
          type,
          data: {
            isTest: true,
            sentBy: profile.email,
            timestamp: new Date().toISOString(),
          },
          created_by_user_id: profile.id,
          created_by_name: `${profile.first_name || ""} ${
            profile.last_name || ""
          }`.trim(),
          created_by_email: profile.email,
          target_type: "user",
          target_user_ids: [userId],
          send_push: true,
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (notificationError) {
      console.error("Error creating test notification:", notificationError);
      return NextResponse.json(
        { error: "Failed to create test notification" },
        { status: 500 }
      );
    }

    // Criar user_notification usando service client
    const { error: userNotificationError } = await serviceSupabase
      .from("user_notifications")
      .insert({
        notification_id: notification.id,
        user_id: userId,
        is_read: false,
      });

    if (userNotificationError) {
      console.error("Error creating user notification:", userNotificationError);
      return NextResponse.json(
        { error: "Failed to create user notification" },
        { status: 500 }
      );
    }

    // Enviar push notification
    try {
      const pushResponse = await fetch(
        `${request.nextUrl.origin}/api/notifications/send-push`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            "x-test-mode": "true",
          },
          body: JSON.stringify({
            notificationId: notification.id,
            userIds: [userId],
          }),
        }
      );

      const pushResult = await pushResponse.json();

      return NextResponse.json({
        message: "Test notification sent successfully",
        notification,
        pushResult,
      });
    } catch (pushError) {
      console.warn("Failed to send push notification:", pushError);

      return NextResponse.json({
        message: "Test notification created but push failed",
        notification,
        pushError:
          pushError instanceof Error ? pushError.message : "Unknown error",
      });
    }
  } catch (error) {
    console.error("Error in test notification:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
