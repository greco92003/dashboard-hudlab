import { requireUser } from "@/lib/security/route-guards";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request) {
  try {
    const access = await requireUser();
    if (!access.ok) return access.response;

    const supabase = await createClient();
    const service = createServiceClient() as any;
    const { userId } = await request.json();

    if (!userId || typeof userId !== "string") {
      return jsonError("ID do usuário é obrigatório", 400);
    }

    const { data: target, error: targetError } = await service
      .from("user_profiles")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!target) return jsonError("Usuário não encontrado", 404);

    if (userId !== access.user.id) {
      const { data: profile, error: profileError } = await service
        .from("user_profiles")
        .select("approved, role")
        .eq("id", access.user.id)
        .single();

      const canDeleteOtherUser =
        !profileError &&
        profile?.approved === true &&
        (profile.role === "owner"
          ? target.role !== "owner"
          : profile.role === "admin" &&
            !["owner", "admin"].includes(target.role));

      if (!canDeleteOtherUser) {
        return jsonError("Permissão insuficiente", 403);
      }
    }

    const { error } = await service.auth.admin.deleteUser(userId);

    if (error) {
      console.error("Error deleting Supabase auth user:", error);
      return jsonError("Erro interno do servidor", 500);
    }

    if (userId === access.user.id) {
      await supabase.auth.signOut({ scope: "global" });
    }

    return NextResponse.json(
      { success: true, message: "Conta deletada com sucesso" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error in delete-user API:", error);
    return jsonError("Erro interno do servidor", 500);
  }
}
