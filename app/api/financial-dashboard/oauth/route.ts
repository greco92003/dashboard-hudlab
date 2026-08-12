import { NextResponse } from "next/server";
import { buildOAuthAuthorizationUrl } from "@/lib/tiny/auth";
import { createTinyOAuthFlow } from "@/lib/tiny/oauth-security";
import { requireAdmin } from "@/lib/security/route-guards";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/financial-dashboard/callback",
  maxAge: 10 * 60,
};

export async function GET() {
  const access = await requireAdmin();
  if (!access.ok) return access.response;

  try {
    const flow = createTinyOAuthFlow(access.user.id);
    const response = NextResponse.redirect(
      buildOAuthAuthorizationUrl({
        state: flow.state,
        codeChallenge: flow.codeChallenge,
      }),
    );
    response.cookies.set("tiny_oauth_nonce", flow.nonce, COOKIE_OPTIONS);
    response.cookies.set(
      "tiny_oauth_code_verifier",
      flow.codeVerifier,
      COOKIE_OPTIONS,
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json(
      { error: "Tiny OAuth is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const runtime = "nodejs";
