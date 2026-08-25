import { NextRequest, NextResponse } from "next/server";
import { requireProducao } from "@/lib/security/route-guards";
import { createServiceClient } from "@/lib/supabase/service";
import { hashPin, isPinFraco, isValidPinFormat } from "@/lib/producao/pin";

/**
 * PIN da produção. O login já diz quem é a pessoa; este endpoint só cadastra ou
 * troca a assinatura de 4 dígitos que ela usa para concluir pedidos.
 *
 * A tabela producao_pins tem RLS sem policy permissiva: nenhum cliente lê o
 * hash. Tudo aqui passa pela chave de serviço.
 */

export async function GET() {
  const access = await requireProducao();
  if (!access.ok) return access.response;

  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("producao_pins")
    .select("user_id, bloqueado_ate")
    .eq("user_id", access.user.id)
    .maybeSingle();

  if (error) {
    console.error("Erro ao consultar PIN da produção:", error);
    return NextResponse.json({ error: "Erro ao consultar PIN" }, { status: 500 });
  }

  const bloqueadoAte = data?.bloqueado_ate ? new Date(data.bloqueado_ate) : null;

  return NextResponse.json(
    {
      temPin: Boolean(data),
      bloqueado: Boolean(bloqueadoAte && bloqueadoAte > new Date()),
      bloqueadoAte: bloqueadoAte?.toISOString() ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const access = await requireProducao();
  if (!access.ok) return access.response;

  let payload: { pin?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const { pin } = payload;

  if (!isValidPinFormat(pin)) {
    return NextResponse.json(
      { error: "O PIN precisa ter exatamente 4 números." },
      { status: 400 },
    );
  }

  if (isPinFraco(pin)) {
    return NextResponse.json(
      { error: "Escolha um PIN menos óbvio — evite 1234 ou dígitos repetidos." },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { error } = await (supabase as any).from("producao_pins").upsert(
    {
      user_id: access.user.id,
      pin_hash: hashPin(pin),
      tentativas_falhas: 0,
      bloqueado_ate: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("Erro ao gravar PIN da produção:", error);
    return NextResponse.json({ error: "Erro ao salvar PIN" }, { status: 500 });
  }

  return NextResponse.json(
    { success: true, temPin: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const runtime = "nodejs";
