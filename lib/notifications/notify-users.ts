import "server-only";

import webpush from "web-push";
import { createSupabaseServerForSync } from "@/lib/supabase/server";

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BIR3mNGleITndcH1jIAAF4Cva8sGIHJnhQdYDjPw6yC8XnH96or0C5nFdlbb8PZt4gaFs10MjXl6H8ZaYLeUsiI";

export interface NotifyResult {
  notificationId: string | null;
  pushSent: number;
  pushFailed: number;
}

/**
 * Notificação para usuários do dashboard: aparece no sininho e vai por push
 * para os celulares com notificação ativa. Nunca lança — alerta que falha não
 * pode derrubar o cron que o disparou.
 */
export async function notifyUsers(input: {
  userIds: string[];
  title: string;
  message: string;
  type?: "info" | "warning";
  /** Para onde o toque na notificação leva (ex.: "/cami?tab=conversas"). */
  url: string;
  data?: Record<string, unknown>;
  from?: string;
}): Promise<NotifyResult> {
  const result: NotifyResult = { notificationId: null, pushSent: 0, pushFailed: 0 };
  const userIds = [...new Set(input.userIds)].filter(Boolean);
  if (userIds.length === 0) return result;

  try {
    const supabase = await createSupabaseServerForSync();
    const { data: notification, error } = await supabase
      .from("notifications")
      .insert({
        title: input.title,
        message: input.message,
        type: input.type ?? "info",
        data: { ...(input.data ?? {}), url: input.url },
        created_by_user_id: null,
        created_by_name: input.from ?? "CAMI Intelligence",
        created_by_email: "sistema@hudlab.com",
        target_type: "user",
        target_user_ids: userIds,
        send_push: true,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(`notifications: ${error.message}`);
    result.notificationId = notification.id;

    const { error: linkError } = await supabase
      .from("user_notifications")
      .insert(userIds.map((user_id) => ({ notification_id: notification.id, user_id, is_read: false })));
    if (linkError) throw new Error(`user_notifications: ${linkError.message}`);

    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!privateKey) {
      console.warn("notifyUsers: VAPID_PRIVATE_KEY não configurada; só o sininho recebe");
      return result;
    }
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh_key, auth_key")
      .in("user_id", userIds)
      .eq("is_active", true);
    if (subError) throw new Error(`push_subscriptions: ${subError.message}`);

    const payload = JSON.stringify({
      title: input.title,
      message: input.message,
      type: input.type ?? "info",
      notificationId: notification.id,
      url: input.url,
      data: input.data ?? {},
      timestamp: Date.now(),
    });
    for (const sub of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
          payload,
          {
            vapidDetails: { subject: "mailto:hudlabprivatelabel@gmail.com", publicKey: VAPID_PUBLIC_KEY, privateKey },
            TTL: 24 * 60 * 60,
          },
        );
        result.pushSent++;
        await supabase
          .from("user_notifications")
          .update({ push_sent: true, push_sent_at: new Date().toISOString() })
          .eq("notification_id", notification.id)
          .eq("user_id", sub.user_id);
      } catch (err) {
        result.pushFailed++;
        const statusCode = (err as { statusCode?: number }).statusCode;
        // Inscrição que o navegador descartou: desliga para não tentar de novo.
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").update({ is_active: false }).eq("id", sub.id);
        }
        console.error("notifyUsers: push falhou", { subscriptionId: sub.id, statusCode });
      }
    }
    await supabase
      .from("notifications")
      .update({ push_sent_count: result.pushSent, push_failed_count: result.pushFailed })
      .eq("id", notification.id);
  } catch (err) {
    console.error("notifyUsers: notificação não enviada", { title: input.title, err });
  }
  return result;
}

/** Usuários do dashboard com papel owner (quem acompanha a Cami). */
export async function ownerUserIds(): Promise<string[]> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("role", "owner")
    .eq("approved", true);
  if (error) {
    console.error("ownerUserIds:", error);
    return [];
  }
  return (data ?? []).map((u) => u.id as string);
}

/**
 * Usuário do dashboard de uma pessoa do GHL: pelo e-mail e, quando a pessoa
 * usa e-mails diferentes nos dois (caso da Schay), pelo primeiro nome — só se
 * houver exatamente um usuário com esse nome.
 */
export async function dashboardUserIdForGhlUser(user: { email: string | null; name: string } | undefined): Promise<string | null> {
  if (!user) return null;
  const byEmail = await dashboardUserIdByEmail(user.email);
  if (byEmail) return byEmail;
  const firstName = user.name.trim().split(/\s+/)[0];
  if (!firstName) return null;
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id")
    .ilike("first_name", firstName)
    .eq("approved", true)
    .limit(2);
  if (error) {
    console.error("dashboardUserIdForGhlUser:", error);
    return null;
  }
  return data && data.length === 1 ? (data[0].id as string) : null;
}

/** Usuário do dashboard com o mesmo e-mail (o login do GHL e o do dashboard são da mesma pessoa). */
export async function dashboardUserIdByEmail(email: string | null): Promise<string | null> {
  if (!email) return null;
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id")
    .ilike("email", email)
    .eq("approved", true)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("dashboardUserIdByEmail:", error);
    return null;
  }
  return (data?.id as string) ?? null;
}
