import { after, NextResponse } from "next/server";
import {
  atualizarTinySolados,
  getResumoSolados,
} from "@/lib/estoque/solados-source";
import { requireApprovedUser } from "@/lib/security/route-guards";

// A tela lê do banco. O tempo é para o botão Atualizar e a primeira abertura,
// que refazem a leitura completa: ~20 buscas no GHL, ~45 leituras de
// oportunidade e ~40 chamadas no Tiny.
export const maxDuration = 300;

export async function GET(request: Request) {
  const acesso = await requireApprovedUser();
  if (!acesso.ok) return acesso.response;

  const forcar = new URL(request.url).searchParams.get("refresh") === "1";

  try {
    const { resumo, lidoEm, atualizando, revalidar } = await getResumoSolados({
      forcar,
    });
    if (revalidar) {
      // Serve a leitura gravada agora e relê o Tiny depois da resposta.
      after(() =>
        atualizarTinySolados().catch((error) =>
          console.error("Estoque de solados: releitura do Tiny falhou", error),
        ),
      );
    }
    return NextResponse.json({ ...resumo, lidoEm, atualizando });
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
