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

    const body = await request.json();
    const { endpoint, p256dh, auth, userAgent, deviceType, browserName } = body;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "Missing required subscription data" },
        { status: 400 }
      );
    }

    console.log("📱 Registering push subscription for user:", profile.email);
    console.log("📱 Endpoint:", endpoint.substring(0, 50) + "...");

    // Desativar subscriptions antigas do usuário
    await supabase
      .from("push_subscriptions")
      .update({ is_active: false })
      .eq("user_id", profile.id);

    // Criar nova subscription
    const { data, error } = await supabase
      .from("push_subscriptions")
      .insert({
        user_id: profile.id,
        endpoint,
        p256dh_key: p256dh,
        auth_key: auth,
        user_agent: userAgent || navigator?.userAgent || "Unknown",
        device_type: deviceType || "desktop",
        browser_name: browserName || "unknown",
        is_active: true,
        last_used_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("❌ Error saving push subscription:", error);
      return NextResponse.json(
        { error: "Failed to save subscription" },
        { status: 500 }
      );
    }

    console.log("✅ Push subscription saved successfully:", data.id);

    return NextResponse.json({
      message: "Push subscription registered successfully",
      subscriptionId: data.id,
      userId: profile.id,
      email: profile.email,
    });
  } catch (error) {
    console.error("❌ Error in register-push:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
