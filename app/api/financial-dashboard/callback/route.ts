/**
 * OAuth2 callback – Tiny/Olist
 *
 * Tiny redirects here after the user authorizes the app:
 *   GET /api/financial-dashboard/callback?code=...
 *
 * The route exchanges the code for tokens and renders a page with the
 * refresh_token so the developer can copy it to .env.local as TINY_REFRESH_TOKEN.
 */

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/tiny/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return new NextResponse(
      html(`
        <h2 style="color:#ef4444">Autorização negada</h2>
        <p>O Tiny retornou o erro: <code>${error}</code></p>
        <p>${searchParams.get("error_description") ?? ""}</p>
        <a href="/financial-dashboard">← Voltar</a>
      `),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  if (!code) {
    return NextResponse.json({ error: "code ausente na query string" }, { status: 400 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    return new NextResponse(
      html(`
        <h2 style="color:#22c55e">✅ Autorização concluída!</h2>
        <p>Copie o <strong>refresh_token</strong> abaixo e adicione no seu <code>.env.local</code>:</p>
        <pre style="background:#1e1e2e;color:#cdd6f4;padding:16px;border-radius:8px;overflow-x:auto;white-space:pre-wrap;word-break:break-all">TINY_REFRESH_TOKEN=${tokens.refresh_token}</pre>
        <p style="color:#94a3b8;font-size:14px">
          Após adicionar a variável, <strong>reinicie o servidor de desenvolvimento</strong> (<code>npm run dev</code>)
          e acesse <a href="/financial-dashboard">/financial-dashboard</a>.
        </p>
        <hr/>
        <details>
          <summary style="cursor:pointer;color:#94a3b8;font-size:13px">Ver access_token (debug)</summary>
          <pre style="font-size:11px;color:#6b7280;overflow-x:auto;white-space:pre-wrap;word-break:break-all">${tokens.access_token}</pre>
        </details>
      `),
      { headers: { "Content-Type": "text/html" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(
      html(`
        <h2 style="color:#ef4444">Erro ao trocar o código</h2>
        <pre style="color:#ef4444">${msg}</pre>
        <p>Verifique se a <strong>URL de Redirecionamento</strong> no app Tiny é exatamente igual à <code>TINY_REDIRECT_URI</code> no .env.local.</p>
        <a href="/financial-dashboard">← Voltar</a>
      `),
      { headers: { "Content-Type": "text/html" } },
    );
  }
}

function html(body: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Tiny OAuth</title>
  <style>*{font-family:system-ui,sans-serif;line-height:1.6}body{max-width:720px;margin:48px auto;padding:0 24px}pre{font-family:monospace}</style>
  </head><body>${body}</body></html>`;
}
