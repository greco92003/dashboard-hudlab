import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserProfile } from "@/lib/auth-utils";
import type { Database } from "@/types/supabase";

// GET - Buscar notificações do usuário
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const profile = await getUserProfile(supabase);

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const unreadOnly = searchParams.get("unread_only") === "true";

    let query = supabase
      .from("user_notifications")
      .select(
        `
        *,
        notification:notifications(*)
      `
      )
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data: notifications, error } = await query;

    if (error) {
      console.error("Error fetching notifications:", error);
      return NextResponse.json(
        { error: "Failed to fetch notifications" },
        { status: 500 }
      );
    }

    // Buscar contagem de não lidas
    const { data: unreadCountData } = await supabase.rpc(
      "get_unread_notifications_count",
      { p_user_id: profile.id }
    );

    return NextResponse.json({
      notifications: notifications || [],
      unreadCount: unreadCountData || 0,
      total: notifications?.length || 0,
    });
  } catch (error) {
    console.error("Error in notifications GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Criar nova notificação (apenas admins/owners)
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

    const body = await request.json();
    const {
      title,
      message,
      type = "info",
      data = {},
      target_type,
      target_roles,
      target_user_ids,
      target_brand,
      send_push = true,
    } = body;

    // Validações
    if (!title || !message || !target_type) {
      return NextResponse.json(
        { error: "Missing required fields: title, message, target_type" },
        { status: 400 }
      );
    }

    if (!["role", "user", "brand_partners"].includes(target_type)) {
      return NextResponse.json(
        { error: "Invalid target_type" },
        { status: 400 }
      );
    }

    if (!["info", "success", "warning", "error", "sale"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid notification type" },
        { status: 400 }
      );
    }

    // Usar service client para criar notificação (bypass RLS)
    const serviceSupabase = createServiceClient();

    // Criar notificação
    const insertData = {
      title,
      message,
      type: type as "info" | "success" | "warning" | "error" | "sale",
      data,
      created_by_user_id: profile.id,
      created_by_name: `${profile.first_name || ""} ${
        profile.last_name || ""
      }`.trim(),
      created_by_email: profile.email,
      target_type: target_type as "role" | "user" | "brand_partners",
      target_roles,
      target_user_ids,
      target_brand,
      send_push,
      status: "draft" as const,
    };

    const { data: notification, error: notificationError } = await (
      serviceSupabase as any
    )
      .from("notifications")
      .insert(insertData)
      .select()
      .single();

    if (notificationError) {
      console.error("Error creating notification:", notificationError);
      return NextResponse.json(
        { error: "Failed to create notification" },
        { status: 500 }
      );
    }

    // Determinar usuários destinatários
    let targetUsers: any[] = [];

    switch (target_type) {
      case "role":
        if (!target_roles || target_roles.length === 0) {
          return NextResponse.json(
            { error: "target_roles required for role target_type" },
            { status: 400 }
          );
        }

        const { data: roleUsers } = await supabase
          .from("user_profiles")
          .select("id, email, first_name, last_name")
          .in("role", target_roles)
          .eq("approved", true);

        targetUsers = roleUsers || [];
        break;

      case "user":
        if (!target_user_ids || target_user_ids.length === 0) {
          return NextResponse.json(
            { error: "target_user_ids required for user target_type" },
            { status: 400 }
          );
        }

        const { data: specificUsers } = await supabase
          .from("user_profiles")
          .select("id, email, first_name, last_name")
          .in("id", target_user_ids)
          .eq("approved", true);

        targetUsers = specificUsers || [];
        break;

      case "brand_partners":
        if (!target_brand) {
          return NextResponse.json(
            { error: "target_brand required for brand_partners target_type" },
            { status: 400 }
          );
        }

        const { data: brandUsers } = await supabase
          .from("user_profiles")
          .select("id, email, first_name, last_name")
          .eq("role", "partners-media")
          .eq("assigned_brand", target_brand)
          .eq("approved", true);

        targetUsers = brandUsers || [];
        break;
    }

    if (targetUsers.length === 0) {
      return NextResponse.json(
        { error: "No target users found" },
        { status: 400 }
      );
    }

    // Criar user_notifications para cada usuário
    const userNotifications = targetUsers.map((user) => ({
      notification_id: notification.id,
      user_id: user.id,
      is_read: false,
    }));

    const { error: userNotificationsError } = await (serviceSupabase as any)
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

    // Atualizar status da notificação para "sent"
    await (serviceSupabase as any)
      .from("notifications")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", notification.id);

    // Enviar push notifications se habilitado
    if (send_push) {
      try {
        await fetch(`${request.nextUrl.origin}/api/notifications/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notificationId: notification.id,
            userIds: targetUsers.map((u) => u.id),
          }),
        });
      } catch (pushError) {
        console.warn("Failed to send push notifications:", pushError);
      }
    }

    return NextResponse.json({
      notification,
      targetUsersCount: targetUsers.length,
      message: "Notification created and sent successfully",
    });
  } catch (error) {
    console.error("Error in notifications POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
