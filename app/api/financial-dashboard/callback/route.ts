import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  saveRefreshTokenToSupabase,
} from "@/lib/tiny/auth";
import { verifyTinyOAuthState } from "@/lib/tiny/oauth-security";
import { requireAdmin } from "@/lib/security/route-guards";

function finish(response: NextResponse): NextResponse {
  const expiredCookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/financial-dashboard/callback",
    maxAge: 0,
  };
  response.cookies.set("tiny_oauth_nonce", "", expiredCookie);
  response.cookies.set("tiny_oauth_code_verifier", "", expiredCookie);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function dashboardRedirect(request: NextRequest, status: string): NextResponse {
  const target = new URL("/financial-dashboard", request.url);
  target.searchParams.set("tiny_oauth", status);
  return finish(NextResponse.redirect(target));
}

export async function GET(request: NextRequest) {
  const access = await requireAdmin();
  if (!access.ok) return access.response;

  const stateValid = verifyTinyOAuthState({
    state: request.nextUrl.searchParams.get("state"),
    expectedUserId: access.user.id,
    expectedNonce: request.cookies.get("tiny_oauth_nonce")?.value,
  });
  const codeVerifier = request.cookies.get("tiny_oauth_code_verifier")?.value;
  if (!stateValid || !codeVerifier) {
    return finish(
      NextResponse.json(
        { error: "Invalid OAuth state" },
        { status: 400 },
      ),
    );
  }

  if (request.nextUrl.searchParams.has("error")) {
    return dashboardRedirect(request, "denied");
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return finish(
      NextResponse.json({ error: "Missing authorization code" }, { status: 400 }),
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code, codeVerifier);
    await saveRefreshTokenToSupabase(tokens.refresh_token);
    return dashboardRedirect(request, "connected");
  } catch {
    console.error("[Tiny OAuth] Authorization code exchange failed");
    return dashboardRedirect(request, "failed");
  }
}

export const runtime = "nodejs";
