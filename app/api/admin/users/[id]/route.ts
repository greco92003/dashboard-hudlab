import { requireAdmin } from "@/lib/security/route-guards";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/supabase";
import { NextRequest, NextResponse } from "next/server";

type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"];
type ProfileUpdate = Database["public"]["Tables"]["user_profiles"]["Update"];
type UserRole = UserProfile["role"];
type Setor = NonNullable<UserProfile["setor_liderado"]>;

const USER_ROLES = new Set<UserRole>([
  "owner",
  "admin",
  "user",
  "manager",
  "team-leader",
  "partners-media",
]);
const SETORES = new Set<Setor>([
  "design",
  "comercial",
  "financeiro",
  "marketing",
  "rh",
]);
const ALLOWED_FIELDS = new Set([
  "role",
  "approved",
  "assigned_brand",
  "setor_liderado",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAdmin();
    if (!access.ok) return access.response;

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 4096) return jsonError("Payload muito grande", 413);

    const { id } = await params;
    if (!UUID_PATTERN.test(id)) return jsonError("ID de usuário inválido", 400);

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("Payload inválido", 400);
    }

    const input = body as Record<string, unknown>;
    const fields = Object.keys(input);
    if (fields.length === 0 || fields.some((field) => !ALLOWED_FIELDS.has(field))) {
      return jsonError("Campos de atualização inválidos", 400);
    }

    const updates: ProfileUpdate = {};

    if (Object.hasOwn(input, "role")) {
      if (typeof input.role !== "string" || !USER_ROLES.has(input.role as UserRole)) {
        return jsonError("Role inválida", 400);
      }
      if (input.role === "owner") {
        return jsonError("A role owner exige um processo administrativo separado", 403);
      }
      updates.role = input.role as UserRole;
    }

    if (Object.hasOwn(input, "approved")) {
      if (typeof input.approved !== "boolean") {
        return jsonError("Status de aprovação inválido", 400);
      }
      updates.approved = input.approved;
    }

    if (Object.hasOwn(input, "assigned_brand")) {
      if (input.assigned_brand !== null && typeof input.assigned_brand !== "string") {
        return jsonError("Marca atribuída inválida", 400);
      }
      const brand =
        typeof input.assigned_brand === "string" ? input.assigned_brand.trim() : null;
      if (brand && brand.length > 200) return jsonError("Marca muito longa", 400);
      updates.assigned_brand = brand || null;
    }

    if (Object.hasOwn(input, "setor_liderado")) {
      if (
        input.setor_liderado !== null &&
        (typeof input.setor_liderado !== "string" ||
          !SETORES.has(input.setor_liderado as Setor))
      ) {
        return jsonError("Setor inválido", 400);
      }
      updates.setor_liderado = input.setor_liderado as Setor | null;
    }

    // The local generated Database type predates the current Supabase generic
    // metadata shape; keep request validation strongly typed at this boundary.
    const service = createServiceClient() as any;
    const { data: target, error: targetError } = await service
      .from("user_profiles")
      .select("id, role, approved, assigned_brand, setor_liderado")
      .eq("id", id)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!target) return jsonError("Usuário não encontrado", 404);
    if (target.role === "owner") {
      return jsonError("Contas owner não podem ser alteradas por esta rota", 403);
    }

    const nextRole = updates.role ?? target.role;
    const nextBrand = Object.hasOwn(updates, "assigned_brand")
      ? updates.assigned_brand
      : target.assigned_brand;

    if (nextRole === "partners-media" && !nextBrand) {
      return jsonError("Usuários partners-media precisam de uma marca", 400);
    }

    if (updates.role && updates.role !== "partners-media") {
      updates.assigned_brand = null;
    }
    if (updates.role && updates.role !== "team-leader") {
      updates.setor_liderado = null;
    }
    updates.updated_at = new Date().toISOString();

    const { data: updated, error: updateError } = await service
      .from("user_profiles")
      .update(updates)
      .eq("id", id)
      .select("id, email, role, approved, assigned_brand, setor_liderado, updated_at")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json(updated, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("PATCH /api/admin/users/[id] failed:", error);
    return jsonError("Erro interno do servidor", 500);
  }
}
