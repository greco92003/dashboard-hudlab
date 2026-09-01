import { NextResponse } from "next/server";
import { getResumoSolados } from "@/lib/estoque/solados-source";
import { requireApprovedUser } from "@/lib/security/route-guards";

// A leitura completa cruza ~20 buscas no GHL, ~45 leituras de oportunidade e
// ~40 chamadas no Tiny. Cabe folga.
export const maxDuration = 300;

export async function GET(request: Request) {
  const acesso = await requireApprovedUser();
  if (!acesso.ok) return acesso.response;

  const forcar = new URL(request.url).searchParams.get("refresh") === "1";

  try {
    const { resumo, lidoEm } = await getResumoSolados({ forcar });
    return NextResponse.json({ ...resumo, lidoEm });
  } catch (error) {
    console.error("Estoque de solados falhou", error);
    const mensagem = error instanceof Error ? error.message : "";
    const status = /OAuth|Token expirado|re-autorizar/i.test(mensagem)
      ? 503
      : 502;
    return NextResponse.json(
      {
        error: /OAuth|Token expirado|re-autorizar/i.test(mensagem)
          ? "O Tiny precisa ser reautorizado."
          : "Não foi possível montar o estoque de solados.",
        // A causa vai junto porque a tela é interna e atrás de login, e sem
        // isso a falha vira caça ao log: a mensagem genérica não diz se foi
        // GHL, Tiny ou saldo faltando, e o registro nem sempre aparece.
        detalhe: mensagem || undefined,
      },
      { status },
    );
  }
}
