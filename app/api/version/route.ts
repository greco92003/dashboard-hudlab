import { NextResponse } from "next/server";

/**
 * API endpoint para retornar a versão atual do build
 *
 * Este endpoint é usado pelo cliente para verificar se há uma nova versão
 * do frontend disponível e forçar logout/limpeza de cache se necessário
 */

// Gera um ID único baseado no timestamp do build ou commit SHA
// IMPORTANTE: NÃO usar Date.now() aqui - em serverless cada cold start gera
// um timestamp diferente, causando falsos positivos de "nova versão"
const BUILD_VERSION =
  process.env.NEXT_PUBLIC_BUILD_ID ||
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  "development";

export async function GET() {
  try {
    return NextResponse.json({
      version: BUILD_VERSION,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    });
  } catch (error) {
    console.error("Error getting version:", error);
    return NextResponse.json(
      { error: "Failed to get version" },
      { status: 500 },
    );
  }
}
