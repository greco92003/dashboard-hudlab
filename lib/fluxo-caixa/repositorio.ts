import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { ContaEspelho, SaldoInicial, TipoConta, UltimaSync } from "./regras";

const PAGINA = 1000;
const LOTE_UPSERT = 500;
const SYNC_TRAVADA_MS = 10 * 60_000;

export type LinhaConta = ContaEspelho & {
  raw: unknown;
  listagem_hash: string;
  detalhe_hash: string | null;
  ultima_run?: number;
  synced_at: string;
};

export type ContaExistente = Pick<
  ContaEspelho,
  "categoria_id" | "categoria_nome" | "data_pagamento" | "forma_pagamento"
> & { detalhe_hash: string | null };

export class SyncEmAndamentoError extends Error {}

// As tabelas fin_* não estão nos tipos gerados do Supabase.
function tabela(nome: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as unknown as { from: (table: string) => any }).from(nome);
}

function falha(contexto: string, error: { message: string }): never {
  throw new Error(`[fluxo-caixa] ${contexto}: ${error.message}`);
}

async function lerTodasAsContas<T>(colunas: string): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await tabela("fin_contas")
      .select(colunas)
      .order("tipo")
      .order("tiny_id")
      .range(de, de + PAGINA - 1);
    if (error) falha("ler fin_contas", error);
    linhas.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) return linhas;
  }
}

const idOuNulo = (valor: unknown) => (valor === null || valor === undefined ? null : Number(valor));

export async function lerContas(): Promise<ContaEspelho[]> {
  const linhas = await lerTodasAsContas<ContaEspelho>(
    "tipo, tiny_id, situacao, data_emissao, data_vencimento, data_pagamento, valor, saldo, historico, numero_documento, contato_id, contato_nome, contato_cpf_cnpj, categoria_id, categoria_nome, forma_pagamento",
  );
  return linhas.map((l) => ({
    ...l,
    tiny_id: Number(l.tiny_id),
    valor: Number(l.valor),
    saldo: Number(l.saldo),
    contato_id: idOuNulo(l.contato_id),
    categoria_id: idOuNulo(l.categoria_id),
  }));
}

export async function lerExistentes(): Promise<Map<string, ContaExistente>> {
  const linhas = await lerTodasAsContas<ContaExistente & { tipo: TipoConta; tiny_id: number }>(
    "tipo, tiny_id, categoria_id, categoria_nome, data_pagamento, forma_pagamento, detalhe_hash",
  );
  return new Map(linhas.map((l) => [`${l.tipo}:${l.tiny_id}`, { ...l, categoria_id: idOuNulo(l.categoria_id) }]));
}

export async function salvarContas(linhas: LinhaConta[]): Promise<void> {
  for (let i = 0; i < linhas.length; i += LOTE_UPSERT) {
    const { error } = await tabela("fin_contas").upsert(linhas.slice(i, i + LOTE_UPSERT), {
      onConflict: "tipo,tiny_id",
    });
    if (error) falha("gravar fin_contas", error);
  }
}

/**
 * Apaga do espelho o que a sincronização `runId` não viu: contas da janela
 * de vencimento e contas antigas ainda em aberto (que foram consultadas).
 */
export async function podarContas(
  runId: number,
  janelaInicio: string,
  janelaFim: string,
  situacoesAbertas: string[],
): Promise<number> {
  const dentro = await tabela("fin_contas")
    .delete()
    .neq("ultima_run", runId)
    .gte("data_vencimento", janelaInicio)
    .lte("data_vencimento", janelaFim)
    .select("tiny_id");
  if (dentro.error) falha("podar janela", dentro.error);
  const antigas = await tabela("fin_contas")
    .delete()
    .neq("ultima_run", runId)
    .lt("data_vencimento", janelaInicio)
    .in("situacao", situacoesAbertas)
    .select("tiny_id");
  if (antigas.error) falha("podar antigas", antigas.error);
  return (dentro.data?.length ?? 0) + (antigas.data?.length ?? 0);
}

export async function iniciarRun(origem: "cron" | "manual"): Promise<number> {
  const desde = new Date(Date.now() - SYNC_TRAVADA_MS).toISOString();
  const rodando = await tabela("fin_sync_runs")
    .select("id")
    .eq("status", "rodando")
    .gte("iniciado_em", desde)
    .limit(1);
  if (rodando.error) falha("ler fin_sync_runs", rodando.error);
  if (rodando.data?.length) {
    throw new SyncEmAndamentoError("Já existe uma sincronização em andamento. Tente de novo em alguns minutos.");
  }
  const { data, error } = await tabela("fin_sync_runs").insert({ origem }).select("id").single();
  if (error) falha("criar fin_sync_runs", error);
  return Number(data.id);
}

export async function concluirRun(
  id: number,
  dados: {
    status: "ok" | "erro";
    contas_lidas?: number;
    contas_removidas?: number;
    detalhes_pendentes?: number;
    erro?: string;
  },
): Promise<void> {
  const { error } = await tabela("fin_sync_runs")
    .update({ ...dados, terminado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) falha("concluir fin_sync_runs", error);
}

export async function lerUltimasSyncs(): Promise<{ ultima: UltimaSync | null; ultimaOk: string | null }> {
  const [ultima, ok] = await Promise.all([
    tabela("fin_sync_runs").select("*").order("iniciado_em", { ascending: false }).limit(1).maybeSingle(),
    tabela("fin_sync_runs")
      .select("terminado_em")
      .eq("status", "ok")
      .order("iniciado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (ultima.error) falha("ler última sync", ultima.error);
  if (ok.error) falha("ler última sync ok", ok.error);
  return { ultima: (ultima.data as UltimaSync | null) ?? null, ultimaOk: ok.data?.terminado_em ?? null };
}

export async function lerSaldoInicial(): Promise<SaldoInicial | null> {
  const { data, error } = await tabela("fin_config")
    .select("saldo_inicial, saldo_inicial_data")
    .eq("id", 1)
    .maybeSingle();
  if (error) falha("ler fin_config", error);
  if (!data) return null;
  return { valor: Number(data.saldo_inicial), data: String(data.saldo_inicial_data) };
}

export async function salvarSaldoInicial(saldo: SaldoInicial, email: string | null): Promise<void> {
  const { error } = await tabela("fin_config").upsert({
    id: 1,
    saldo_inicial: saldo.valor,
    saldo_inicial_data: saldo.data,
    updated_at: new Date().toISOString(),
    updated_by_email: email,
  });
  if (error) falha("gravar fin_config", error);
}
