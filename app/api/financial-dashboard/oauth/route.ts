/**
 * OAuth2 initiation – Tiny/Olist
 *
 * GET /api/financial-dashboard/oauth
 *   → Redirects the browser to the Tiny authorization page.
 */

import { NextResponse } from "next/server";
import { buildOAuthAuthorizationUrl } from "@/lib/tiny/auth";

export async function GET() {
  try {
    const authUrl = buildOAuthAuthorizationUrl();
    return NextResponse.redirect(authUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
