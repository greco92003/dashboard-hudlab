import { NextResponse } from "next/server";
import { processarTalaoProducao } from "@/lib/producao/taloes";
import { requireCronSecret } from "@/lib/security/route-guards";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  try {
    const estado = await processarTalaoProducao();
    return NextResponse.json({ estado });
  } catch (error) {
    console.error("Falha na fila de talões de produção", error);
    return NextResponse.json({ error: "Não foi possível processar a fila de talões." }, { status: 500 });
  }
}
