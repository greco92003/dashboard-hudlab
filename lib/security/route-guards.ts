import { timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const ADMIN_ROLES = ["admin", "owner"] as const;

type UserRole =
  | "owner"
  | "admin"
  | "user"
  | "manager"
  | "team-leader"
  | "partners-media";

type UserProfile = {
  id: string;
  approved: boolean | null;
  role: UserRole;
};

type AccessGranted = { ok: true; user: User; profile: UserProfile | null };
type AccessDenied = { ok: false; response: NextResponse };
export type AccessResult = AccessGranted | AccessDenied;

function deny(message: string, status: number): AccessDenied {
  return {
    ok: false,
    response: NextResponse.json(
      { error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    ),
  };
}

export async function requireUser(): Promise<AccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return deny("Não autenticado", 401);
  return { ok: true, user, profile: null };
}

export async function requireApprovedUser(): Promise<AccessResult> {
  const authenticated = await requireUser();
  if (!authenticated.ok) return authenticated;

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("id, approved, role")
    .eq("id", authenticated.user.id)
    .single();

  if (error || !profile || profile.approved !== true) {
    return deny("Usuário sem aprovação", 403);
  }

  return {
    ok: true,
    user: authenticated.user,
    profile: profile as UserProfile,
  };
}

export async function requireRole(
  roles: readonly UserRole[],
): Promise<AccessResult> {
  const approved = await requireApprovedUser();
  if (!approved.ok) return approved;

  if (!approved.profile || !roles.includes(approved.profile.role)) {
    return deny("Permissão insuficiente", 403);
  }
  return approved;
}

export function requireAdmin(): Promise<AccessResult> {
  return requireRole(ADMIN_ROLES);
}

export function safeSecretEqual(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function requireBearerSecret(
  request: Request,
  secret: string | undefined,
  label = "secret",
): NextResponse | null {
  if (!secret) {
    console.error(`${label} não configurado; acesso bloqueado`);
    return NextResponse.json(
      { error: "Serviço indisponível" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authorization = request.headers.get("authorization") || "";
  const prefix = "Bearer ";
  if (
    !authorization.startsWith(prefix) ||
    !safeSecretEqual(authorization.slice(prefix.length), secret)
  ) {
    return NextResponse.json(
      { error: "Não autorizado" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}

export function requireCronSecret(request: Request): NextResponse | null {
  return requireBearerSecret(request, process.env.CRON_SECRET, "CRON_SECRET");
}

export async function requireAdminOrCron(
  request: Request,
): Promise<NextResponse | null> {
  if (request.headers.has("authorization")) {
    return requireCronSecret(request);
  }

  const access = await requireAdmin();
  return access.ok ? null : access.response;
}

export async function requireAdminOrInternal(
  request: Request,
): Promise<NextResponse | null> {
  if (request.headers.has("authorization")) {
    return requireBearerSecret(
      request,
      process.env.INTERNAL_API_SECRET,
      "INTERNAL_API_SECRET",
    );
  }

  const access = await requireAdmin();
  return access.ok ? null : access.response;
}

export function blockDiagnosticRouteInProduction(): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
