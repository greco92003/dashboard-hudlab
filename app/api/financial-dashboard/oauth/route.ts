/**
 * OAuth2 initiation – Tiny/Olist
 *
 * GET /api/financial-dashboard/oauth
 *   → Redirects the browser to the Tiny authorization page.
 */

import { NextResponse } from "next/server";
import { buildOAuthAuthorizationUrl } from "@/lib/tiny/auth";
import { requireAdmin } from "@/lib/security/route-guards";

export async function GET() {
  const access = await requireAdmin();
  if (!access.ok) return access.response;

  try {
    const authUrl = buildOAuthAuthorizationUrl();
    return NextResponse.redirect(authUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
