import { requireUser } from "@/lib/security/route-guards";
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function DELETE(request: Request) {
  try {
    const access = await requireUser();
    if (!access.ok) return access.response;

    const supabase = await createClient();
    const { userId } = await request.json();

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { success: false, error: "ID do usuário é obrigatório" },
        { status: 400 },
      );
    }

    if (userId !== access.user.id) {
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("approved, role")
        .eq("id", access.user.id)
        .single();

      const canDeleteOtherUser =
        !profileError &&
        profile?.approved === true &&
        ["admin", "owner"].includes(profile.role);

      if (!canDeleteOtherUser) {
        return NextResponse.json(
          { success: false, error: "Permissão insuficiente" },
          { status: 403 },
        );
      }
    }

    const { data, error } = await supabase.rpc("delete_user_account", {
      user_id_to_delete: userId,
    });

    if (error) {
      console.error("Error calling delete_user_account:", error);
      return NextResponse.json(
        { success: false, error: "Erro interno do servidor" },
        { status: 500 },
      );
    }

    if (data.success) {
      if (userId === access.user.id) {
        await supabase.auth.signOut({ scope: "global" });
      }
      return NextResponse.json(data);
    }

    return NextResponse.json(data, { status: 400 });
  } catch (error) {
    console.error("Error in delete-user API:", error);
    return NextResponse.json(
      { success: false, error: "Erro interno do servidor" },
      { status: 500 },
    );
  }
}
