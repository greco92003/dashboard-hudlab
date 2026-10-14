import { NextResponse } from "next/server";
import { requireRole } from "@/lib/security/route-guards";
import { notifyUsers } from "@/lib/notifications/notify-users";
import { loadSeasonSessions, loadTeam, toLite } from "@/lib/sellers-v2/team";
import { playerProgress } from "@/lib/sellers-v2/progression";
import { reminderMessage } from "@/lib/sellers-v2/arena-text";

// "Mandar lembrete" da visão do gestor: o owner chama uma pessoa do time para treinar.
export async function POST(request: Request) {
  const access = await requireRole(["owner"]);
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as { userId?: unknown } | null;
  const userId = typeof body?.userId === "string" ? body.userId : "";
  try {
    const team = await loadTeam();
    const member = team.find((m) => m.id === userId);
    if (!member) return NextResponse.json({ error: "Pessoa não encontrada no time" }, { status: 404 });
    const progress = playerProgress(member.id, toLite(await loadSeasonSessions()), Date.now());
    const { title, message } = reminderMessage(progress.streak, member.nome);
    const result = await notifyUsers({ userIds: [member.id], title, message, url: "/sellers_v2", from: "Arena de Vendedores" });
    return NextResponse.json({ ok: true, push: result.pushSent > 0 });
  } catch (error) {
    console.error("arena gestor lembrete error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
