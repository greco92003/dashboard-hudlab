import { NextRequest, NextResponse } from "next/server";

// Rede de segurança da /programacao.
//
// A programacao_cache é mantida por dois caminhos: o botão "Atualizar" (manual) e
// o webhook do ActiveCampaign (/api/webhooks/active-campaign), cujo upsert da
// programacao_cache é best-effort (fica num try/catch que engole erros). Se o AC
// deixar de enviar algum evento — ou o upsert falhar uma vez — o board diverge em
// silêncio até alguém clicar em "Atualizar". Este cron roda o MESMO sync completo
// do botão uma vez por dia, para a programacao_cache se auto-corrigir.
//
// Agendado no vercel.json. Reaproveita /api/programacao/sync (nada duplicado).
async function runProgramacaoSync() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min

  try {
    const res = await fetch(
      `${
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      }/api/programacao/sync`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Programacao sync failed: ${errorText}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "AbortError"
      ? "Sincronização cancelada por timeout (5 minutos)"
      : error.message;
  }
  return "Erro desconhecido";
}

// Cron diário (ver vercel.json). Autenticado via CRON_SECRET, igual aos demais crons.
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log("Unauthorized cron request (sync-programacao)");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(
      "🚀 Cron sync-programacao iniciado (mesmo sync do botão Atualizar)..."
    );
    const syncResult = await runProgramacaoSync();
    console.log("✅ Cron sync-programacao concluído");

    return NextResponse.json({
      message: "Cron sync-programacao completed successfully",
      timestamp: new Date().toISOString(),
      syncResult,
    });
  } catch (error) {
    console.error("Cron sync-programacao error:", error);
    return NextResponse.json(
      { error: toErrorMessage(error), timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

// Trigger manual para teste (mesma lógica do GET, sem exigir CRON_SECRET).
export async function POST() {
  try {
    console.log("🚀 Trigger manual sync-programacao...");
    const syncResult = await runProgramacaoSync();

    return NextResponse.json({
      message: "Manual sync-programacao completed successfully",
      timestamp: new Date().toISOString(),
      syncResult,
    });
  } catch (error) {
    console.error("Manual sync-programacao error:", error);
    return NextResponse.json(
      { error: toErrorMessage(error) },
      { status: 500 }
    );
  }
}

// 5 minutos (limite do plano) — o sync completo do AC leva ~1-2 min.
export const maxDuration = 300;
