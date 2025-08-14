import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/auth-utils";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const profile = await getUserProfile(supabase);

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🧪 Test push setup for user:", profile.email);

    const body = await request.json();
    const { action, subscriptionData } = body;

    switch (action) {
      case "register_subscription":
        if (!subscriptionData?.endpoint || !subscriptionData?.keys) {
          return NextResponse.json(
            { error: "Invalid subscription data" },
            { status: 400 }
          );
        }

        // Desativar subscriptions antigas
        await supabase
          .from("push_subscriptions")
          .update({ is_active: false })
          .eq("user_id", profile.id);

        // Criar nova subscription
        const { data, error } = await supabase
          .from("push_subscriptions")
          .insert({
            user_id: profile.id,
            endpoint: subscriptionData.endpoint,
            p256dh_key: subscriptionData.keys.p256dh,
            auth_key: subscriptionData.keys.auth,
            user_agent: subscriptionData.userAgent || "Test Browser",
            device_type: subscriptionData.deviceType || "desktop",
            browser_name: subscriptionData.browserName || "chrome",
            is_active: true,
            last_used_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          console.error("❌ Error saving subscription:", error);
          return NextResponse.json(
            { error: "Failed to save subscription", details: error.message },
            { status: 500 }
          );
        }

        console.log("✅ Subscription saved:", data.id);
        return NextResponse.json({
          success: true,
          message: "Subscription registered successfully",
          subscriptionId: data.id,
        });

      case "check_subscriptions":
        const { data: subscriptions } = await supabase
          .from("push_subscriptions")
          .select("id, endpoint, is_active, created_at")
          .eq("user_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(5);

        return NextResponse.json({
          success: true,
          subscriptions: subscriptions || [],
          count: subscriptions?.length || 0,
        });

      case "get_vapid_key":
        return NextResponse.json({
          success: true,
          vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        });

      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("❌ Error in test-push-setup:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
