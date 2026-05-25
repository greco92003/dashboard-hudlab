/**
 * Cron job – Renovar token OAuth2 do Tiny a cada 6 horas
 *
 * O refresh token do Tiny expira após 24 horas de inatividade (idle timeout
 * configurado no Keycloak deles). Este cron garante que o token seja renovado
 * bem antes disso, e o novo refresh token é salvo no Supabase automaticamente.
 *
 * Schedule: a cada 6 horas (0 *\/6 * * * no vercel.json)
 */

import { NextResponse } from "next/server";
import { getTinyV3AccessToken, getAuthMode } from "@/lib/tiny/auth";

export async function GET(request: Request) {
  // Vercel cron jobs send this header for security
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = getAuthMode();

  if (mode !== "v3-oauth") {
    return NextResponse.json({
      ok: false,
      message:
        "Tiny está em modo V2 (token estático) ou não configurado. Nada a renovar.",
    });
  }

  try {
    // Calling getTinyV3AccessToken() forces a refresh (ignores in-memory cache
    // because each cron invocation is a fresh serverless function instance).
    // The new refresh token is automatically saved to Supabase inside the function.
    const accessToken = await getTinyV3AccessToken();

    return NextResponse.json({
      ok: true,
      message: "Token Tiny renovado com sucesso e salvo no Supabase.",
      expiresIn: "~4h (próxima renovação em 6h)",
      tokenPreview: `${accessToken.slice(0, 20)}…`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/refresh-tiny-token]", msg);

    return NextResponse.json(
      {
        ok: false,
        error: msg,
        action:
          "Acesse /financial-dashboard e clique em 'Conectar Tiny' para re-autorizar.",
      },
      { status: 500 },
    );
  }
}
