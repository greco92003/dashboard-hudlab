/**
 * Limite de rajada do GHL: 100 chamadas a cada 10 s por location, somando
 * todas as rotinas e telas que usam o mesmo token. Em 12/11/2026 o recálculo
 * da Cami (379 oportunidades a cada 15 min) e a fila de não lidas passavam
 * disso sozinhos, e quem abria uma conversa na CAMI Intelligence no meio da
 * rodada recebia 429. Cada instância usa no máximo metade da janela; o resto
 * fica para as outras rotinas, as telas, a Cami respondendo e o orçamento da
 * Black (que têm cliente próprio e não passam por aqui).
 */
export const JANELA_GHL_MS = 10_000;
export const MAX_CHAMADAS_POR_JANELA = 50;

type Dormir = (ms: number) => Promise<void>;

const dormirDeVerdade: Dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Janela deslizante: devolve quando a chamada pode sair sem passar de `max` na janela. */
export function criarLimitador(
  max: number = MAX_CHAMADAS_POR_JANELA,
  janelaMs: number = JANELA_GHL_MS,
  relogio: () => number = Date.now,
  dormir: Dormir = dormirDeVerdade,
): () => Promise<void> {
  const recentes: number[] = [];
  return async function aguardarVaga() {
    for (;;) {
      const agora = relogio();
      while (recentes.length && agora - recentes[0] >= janelaMs) recentes.shift();
      if (recentes.length < max) {
        recentes.push(agora);
        return;
      }
      await dormir(recentes[0] + janelaMs - agora);
    }
  };
}

/** Uma fila por instância para lib/ghl/api.ts e lib/ghl/negotiation-conversations.ts. */
export const aguardarVagaGhl = criarLimitador();

/** Tentativas de uma leitura: esperas de 1+2+4+8 s passam da janela de 10 s do limite. */
export const TENTATIVAS_LEITURA_GHL = 5;

/**
 * Espera antes de repetir uma chamada recusada (429/5xx/sem resposta): o
 * Retry-After do GHL quando vem em segundos; senão 1, 2, 4, 8 s. Sem o
 * cabeçalho, `Number(null)` dava 0 e a espera ficava sempre em 1 s.
 */
export function esperaParaRepetir(response: Response | null, tentativa: number): number {
  const cabecalho = response?.headers.get("retry-after");
  const segundos = cabecalho ? Number(cabecalho) : Number.NaN;
  return Number.isFinite(segundos) ? Math.max(1_000, segundos * 1_000) : 1_000 * 2 ** tentativa;
}
