import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

// Versão do build - será diferente a cada deploy
const BUILD_VERSION =
  process.env.NEXT_PUBLIC_BUILD_ID ||
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  Date.now().toString();

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
    return NextResponse.next();
  }

  // Adiciona header com a versão do build em todas as respostas
  const response = await updateSession(request);

  // Adiciona header customizado com a versão do servidor
  response.headers.set("X-App-Version", BUILD_VERSION);

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot)|storage).*)",
  ],
};
