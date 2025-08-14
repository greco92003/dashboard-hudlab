import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");

  // if "next" is in param, use it as the redirect URL
  let next = searchParams.get("next") ?? "/dashboard";

  // Special handling for password recovery
  if (type === "recovery") {
    next = "/reset-password";
  }

  if (!next.startsWith("/")) {
    // if "next" is not a relative URL, use the default
    next = "/dashboard";
  }

  // Log callback attempt for debugging
  if (process.env.NODE_ENV === "production") {
    console.log("Auth callback:", {
      hasCode: !!code,
      type,
      next,
      origin,
      forwardedHost: request.headers.get("x-forwarded-host"),
      timestamp: new Date().toISOString(),
    });
  }

  if (code) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error && data.session) {
        const forwardedHost = request.headers.get("x-forwarded-host"); // original origin before load balancer
        const isLocalEnv = process.env.NODE_ENV === "development";

        let redirectUrl;
        if (isLocalEnv) {
          // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
          redirectUrl = `${origin}${next}`;
        } else if (forwardedHost) {
          redirectUrl = `https://${forwardedHost}${next}`;
        } else {
          redirectUrl = `${origin}${next}`;
        }

        if (process.env.NODE_ENV === "production") {
          console.log("Auth callback success:", {
            userId: data.session.user.id,
            redirectUrl,
            timestamp: new Date().toISOString(),
          });
        }

        return NextResponse.redirect(redirectUrl);
      } else {
        // Log the error for debugging
        if (process.env.NODE_ENV === "production") {
          console.error("Auth callback error:", {
            error: error?.message || "No session created",
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.error("Auth callback exception:", {
        error: err instanceof Error ? err.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
