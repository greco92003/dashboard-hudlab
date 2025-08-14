import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Skip middleware for static assets and API routes
  const skipPaths = [
    "/api/",
    "/_next/",
    "/favicon.ico",
    "/storage/",
    "/auth/callback",
    "/manifest.json",
    "/browserconfig.xml",
    "/sw.js",
    "/workbox-",
    "/worker-",
    "/icons/",
    "/offline.html",
  ];

  const skipExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".css",
    ".js",
  ];

  // Skip static assets and API routes immediately
  if (
    skipPaths.some((path) => request.nextUrl.pathname.startsWith(path)) ||
    skipExtensions.some((ext) => request.nextUrl.pathname.endsWith(ext))
  ) {
    const { NextResponse } = await import("next/server");
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot)|storage).*)",
  ],
};
