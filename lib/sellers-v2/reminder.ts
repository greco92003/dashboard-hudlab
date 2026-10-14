import "server-only";

import { notifyUsers } from "@/lib/notifications/notify-users";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { reminderMessage } from "./arena-text";
import { playerProgress } from "./progression";
import { loadSeasonSessions, loadTeam, toLite } from "./team";

/** Lembrete das 15h para quem tem notificação ativa e ainda não treinou hoje. */
export async function sendTrainingReminders(now = Date.now()): Promise<{ avisados: number; jaTreinaram: number; semPush: number }> {
  const supabase = await createSupabaseServerForSync();
  const [team, rows] = await Promise.all([loadTeam(), loadSeasonSessions()]);
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("user_id")
    .eq("is_active", true)
    .in("user_id", team.map((m) => m.id));
  if (error) throw new Error(`push_subscriptions: ${error.message}`);
  const withPush = new Set((subs ?? []).map((s) => s.user_id as string));
  const lite = toLite(rows);

  let avisados = 0;
  let jaTreinaram = 0;
  let semPush = 0;
  for (const m of team) {
    const p = playerProgress(m.id, lite, now);
    if (p.trainedToday) {
      jaTreinaram++;
      continue;
    }
    if (!withPush.has(m.id)) {
      semPush++;
      continue;
    }
    const { title, message } = reminderMessage(p.streak, m.nome);
    await notifyUsers({ userIds: [m.id], title, message, url: "/sellers_v2", from: "Arena de Vendedores" });
    avisados++;
  }
  return { avisados, jaTreinaram, semPush };
}
