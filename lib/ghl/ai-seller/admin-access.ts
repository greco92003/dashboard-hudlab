import "server-only";

import { NextResponse } from "next/server";
import { ownerUserIds } from "@/lib/notifications/notify-users";
import { requireApprovedUser, type AccessResult } from "@/lib/security/route-guards";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { CAMI_ADMIN_EMAILS, isCamiAdmin } from "./admin-shape";

/** Rota que só quem administra a Cami usa (owner ou conta da lista). */
export async function requireCamiAdmin(): Promise<AccessResult> {
  const access = await requireApprovedUser();
  if (!access.ok) return access;
  if (!isCamiAdmin(access.profile?.role, access.user.email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Só quem administra a Cami pode fazer isso" }, { status: 403 }),
    };
  }
  return access;
}

/** Quem recebe os avisos de quem administra a Cami: owners e as contas da lista. */
export async function camiAdminUserIds(): Promise<string[]> {
  const ids = new Set(await ownerUserIds());
  if (CAMI_ADMIN_EMAILS.length) {
    const supabase = await createSupabaseServerForSync();
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, email")
      .eq("approved", true)
      .in("email", [...CAMI_ADMIN_EMAILS]);
    if (error) console.error("camiAdminUserIds:", error);
    for (const u of data ?? []) ids.add(u.id as string);
  }
  return [...ids];
}
