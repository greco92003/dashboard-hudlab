import "server-only";

import { getAuthMode } from "@/lib/tiny/auth";
import {
  assinaturaDaListagem,
  hojeEmSaoPaulo,
  mapearContaTiny,
  normalizarData,
  somarDias,
  type TinyContaBruta,
  type TipoConta,
} from "./regras";
import {
  concluirRun,
  iniciarRun,
  lerExistentes,
  podarContas,
  salvarContas,
  type LinhaConta,
} from "./repositorio";
import { listarContasTiny, obterContaTiny } from "./tiny";

const DIAS_PASSADO = 180;
const DIAS_FUTURO = 365;
// Detalhe = 1 chamada por conta. Na primeira carga são milhares, então cada
// sincronização busca um lote dentro do orçamento e o resto fica para a próxima.
const ORCAMENTO_MS = 200_000;
const MAX_DETALHES = 400;
const CONCORRENCIA = 2;
const SITUACOES_ABERTAS = ["aberto", "parcial", "atrasadas"];

export type ResultadoSync = {
  runId: number;
  contasLidas: number;
  contasRemovidas: number;
  detalhesPendentes: number;
};

type Listada = { tipo: TipoConta; bruta: TinyContaBruta };

async function listarJanela(janelaInicio: string, janelaFim: string) {
  const listadas: Listada[] = [];
  let completo = true;
  for (const tipo of ["pagar", "receber"] as const) {
    const vistas = new Set<number>();
    const consultas: Record<string, string>[] = [
      { dataInicialVencimento: janelaInicio, dataFinalVencimento: janelaFim },
      // Atrasadas antigas continuam no fluxo, qualquer que seja o vencimento.
      ...SITUACOES_ABERTAS.map((situacao) => ({
        situacao,
        dataFinalVencimento: somarDias(janelaInicio, -1),
      })),
    ];
    for (const filtros of consultas) {
      const resultado = await listarContasTiny(tipo, filtros);
      completo &&= resultado.completo;
      for (const bruta of resultado.itens) {
        if (vistas.has(bruta.id)) continue;
        vistas.add(bruta.id);
        listadas.push({ tipo, bruta });
      }
    }
  }
  return { listadas, completo };
}

export async function sincronizarFluxoCaixa(origem: "cron" | "manual"): Promise<ResultadoSync> {
  if (getAuthMode() !== "v3-oauth") {
    throw new Error("OAuth não configurado: conecte o Tiny (API v3) para sincronizar o fluxo de caixa.");
  }
  const comecou = Date.now();
  const runId = await iniciarRun(origem);

  try {
    const hoje = hojeEmSaoPaulo();
    const janelaInicio = somarDias(hoje, -DIAS_PASSADO);
    const janelaFim = somarDias(hoje, DIAS_FUTURO);
    const { listadas, completo } = await listarJanela(janelaInicio, janelaFim);
    const existentes = await lerExistentes();

    const pendentes = listadas
      .filter(
        ({ tipo, bruta }) =>
          existentes.get(`${tipo}:${bruta.id}`)?.detalhe_hash !== assinaturaDaListagem(bruta),
      )
      .sort((a, b) =>
        (normalizarData(b.bruta.dataVencimento) ?? "").localeCompare(normalizarData(a.bruta.dataVencimento) ?? ""),
      );

    const detalhes = new Map<string, TinyContaBruta>();
    const limite = Math.min(pendentes.length, MAX_DETALHES);
    let cursor = 0;
    await Promise.all(
      Array.from({ length: CONCORRENCIA }, async () => {
        while (cursor < limite && Date.now() - comecou < ORCAMENTO_MS) {
          const { tipo, bruta } = pendentes[cursor++];
          try {
            detalhes.set(`${tipo}:${bruta.id}`, await obterContaTiny(tipo, bruta.id));
          } catch (erro) {
            console.warn(
              `[fluxo-caixa] detalhe ${tipo} ${bruta.id} falhou:`,
              erro instanceof Error ? erro.message : erro,
            );
          }
        }
      }),
    );

    const agora = new Date().toISOString();
    const linhas: LinhaConta[] = [];
    for (const { tipo, bruta } of listadas) {
      const chave = `${tipo}:${bruta.id}`;
      const detalhe = detalhes.get(chave);
      const existente = existentes.get(chave);
      const conta = mapearContaTiny(tipo, bruta, detalhe);
      if (!conta) continue;
      if (!detalhe && existente) {
        // Sem detalhe novo: preserva o que só o detalhe traz.
        conta.categoria_id = existente.categoria_id;
        conta.categoria_nome = existente.categoria_nome;
        conta.data_pagamento = existente.data_pagamento;
        conta.forma_pagamento = existente.forma_pagamento;
      }
      const listagemHash = assinaturaDaListagem(bruta);
      linhas.push({
        ...conta,
        raw: detalhe ?? bruta,
        listagem_hash: listagemHash,
        detalhe_hash: detalhe ? listagemHash : existente?.detalhe_hash ?? null,
        ultima_run: runId,
        synced_at: agora,
      });
    }

    await salvarContas(linhas);
    // Listagem truncada não prova que uma conta sumiu: sem poda.
    const contasRemovidas = completo
      ? await podarContas(runId, janelaInicio, janelaFim, SITUACOES_ABERTAS)
      : 0;
    const resultado: ResultadoSync = {
      runId,
      contasLidas: linhas.length,
      contasRemovidas,
      detalhesPendentes: pendentes.length - detalhes.size,
    };
    await concluirRun(runId, {
      status: "ok",
      contas_lidas: resultado.contasLidas,
      contas_removidas: resultado.contasRemovidas,
      detalhes_pendentes: resultado.detalhesPendentes,
    });
    return resultado;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await concluirRun(runId, { status: "erro", erro: mensagem.slice(0, 1000) }).catch(() => undefined);
    throw erro;
  }
}

/** Relê uma conta no Tiny e grava no espelho (após baixa ou criação). */
export async function atualizarContaNoEspelho(tipo: TipoConta, id: number): Promise<void> {
  const detalhe = await obterContaTiny(tipo, id);
  const conta = mapearContaTiny(tipo, detalhe, detalhe);
  if (!conta) return;
  const hash = assinaturaDaListagem(detalhe);
  await salvarContas([
    { ...conta, raw: detalhe, listagem_hash: hash, detalhe_hash: hash, synced_at: new Date().toISOString() },
  ]);
}
