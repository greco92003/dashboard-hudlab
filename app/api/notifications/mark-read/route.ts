import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/auth-utils";

// POST - Marcar notificação como lida
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const profile = await getUserProfile(supabase);

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { notificationId, markAll = false } = body;

    if (markAll) {
      // Marcar todas as notificações como lidas
      const { error } = await supabase
        .rpc("mark_all_notifications_as_read", {
          p_user_id: profile.id
        });

      if (error) {
        console.error("Error marking all notifications as read:", error);
        return NextResponse.json(
          { error: "Failed to mark all notifications as read" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        message: "All notifications marked as read",
        success: true,
      });
    }

    if (!notificationId) {
      return NextResponse.json(
        { error: "notificationId is required" },
        { status: 400 }
      );
    }

    // Marcar notificação específica como lida
    const { error } = await supabase
      .rpc("mark_notification_as_read", {
        p_notification_id: notificationId,
        p_user_id: profile.id
      });

    if (error) {
      console.error("Error marking notification as read:", error);
      return NextResponse.json(
        { error: "Failed to mark notification as read" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Notification marked as read",
      success: true,
    });

  } catch (error) {
    console.error("Error in mark-read:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
