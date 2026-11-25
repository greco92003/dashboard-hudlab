/**
 * Pedidos de empresa em que cada par tem dono (tabela erp_pares_identificados).
 * Tudo aqui é regra pura: a leitura do banco fica em pares-identificados-db.ts.
 */

import type { ErpGradeItem } from "./product-rules";
import type { ProductionLabel } from "./production-labels";
import { packVolumes, type PackedVolume, type PackingLine } from "./romaneio-packing";

export type ParIdentificado = {
  numeracao: string;
  /** null = par extra, sem dono: etiqueta normal. */
  nome: string | null;
  filial: string | null;
  setor: string | null;
};

export type Pessoa = { nome: string; filial: string; setor: string };

export type EtiquetaProducao = ProductionLabel & { pessoa?: Pessoa };

export type GrupoDoRomaneio = {
  /** null nas caixas de extras. */
  filial: string | null;
  setor: string | null;
  volumes: PackedVolume[];
};

function primeiroNumero(size: string) {
  const first = Number(size.match(/\d+/)?.[0]);
  return Number.isFinite(first) ? first : Number.MAX_SAFE_INTEGER;
}

function normalizarNumeracao(size: string) {
  return size.replace(/\s/g, "");
}

function comparar(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });
}

function pessoaDe(par: ParIdentificado): Pessoa | null {
  return par.nome && par.filial && par.setor
    ? { nome: par.nome, filial: par.filial, setor: par.setor }
    : null;
}

/** Ordem de impressão e de empacotamento: filial, setor e nome. */
export function compararPessoas(a: Pessoa, b: Pessoa) {
  return comparar(a.filial, b.filial) || comparar(a.setor, b.setor) || comparar(a.nome, b.nome);
}

type ModeloDaFicha = {
  modelNumber: number;
  audience: ErpGradeItem["audience"];
  soleColor: string | null;
  artUrl: string | null;
  grades: ErpGradeItem[];
  totalPairs: number;
};

/**
 * Com lista de pessoas, o pedido vira um modelo só (o 1 da ficha, adulto),
 * com a grade da lista. Arte e cor do solado da ficha são aproveitadas se
 * existirem; o solado cai para EVA Preto, a única sola EVA cadastrada.
 */
export function modelosComLista<T extends ModeloDaFicha>(modelosDaFicha: T[], pares: ParIdentificado[]): ModeloDaFicha[] {
  if (pares.length === 0) return modelosDaFicha;
  const daFicha = modelosDaFicha.find((model) => model.audience === "adulto") ?? modelosDaFicha[0];
  const grades = gradeDosPares(pares, "adulto");
  return [{
    modelNumber: daFicha?.modelNumber ?? 1,
    audience: "adulto",
    soleColor: daFicha?.soleColor ?? "EVA Preto",
    artUrl: daFicha?.artUrl ?? null,
    grades,
    totalPairs: grades.reduce((sum, grade) => sum + grade.quantity, 0),
  }];
}

/** Com lista de pessoas, a quantidade que vale é a da lista, não a do GHL. */
export function quantidadeEsperada(quantidadeGhl: number | null, pares: ParIdentificado[]) {
  return pares.length > 0 ? pares.length : quantidadeGhl;
}

/** Grade do pedido: quantos pares de cada numeração, inclusive os extras. */
export function gradeDosPares(
  pares: ParIdentificado[],
  audience: ErpGradeItem["audience"] = "adulto",
): ErpGradeItem[] {
  const totais = new Map<string, number>();
  for (const par of pares) {
    const size = normalizarNumeracao(par.numeracao);
    totais.set(size, (totais.get(size) ?? 0) + 1);
  }
  return [...totais.entries()]
    .sort(([a], [b]) => primeiroNumero(a) - primeiroNumero(b) || a.localeCompare(b))
    .map(([size, quantity]) => ({ size, quantity, audience }));
}

function pessoasPorNumeracao(pares: ParIdentificado[]) {
  const porNumeracao = new Map<string, Pessoa[]>();
  for (const par of pares) {
    const pessoa = pessoaDe(par);
    if (!pessoa) continue;
    const size = normalizarNumeracao(par.numeracao);
    porNumeracao.set(size, [...(porNumeracao.get(size) ?? []), pessoa]);
  }
  return porNumeracao;
}

function faltaNoPedido(sobras: Map<string, Pessoa[]>) {
  const faltas = [...sobras.entries()].filter(([, pessoas]) => pessoas.length > 0);
  if (faltas.length === 0) return;
  const detalhe = faltas.map(([size, pessoas]) => `${size}: faltam ${pessoas.length}`).join("; ");
  throw new Error(
    `O pedido no Tiny tem menos pares que a lista de pessoas deste negócio (${detalhe}). Confira as quantidades do pedido antes de imprimir.`,
  );
}

/**
 * Dá dono às etiquetas, numeração por numeração. Pares a mais no pedido
 * (os extras) saem com a etiqueta normal, no fim. Se o pedido tiver menos
 * pares do que pessoas, para: imprimir sem alguém seria pior do que avisar.
 */
export function etiquetasComPessoas(
  labels: ProductionLabel[],
  pares: ParIdentificado[],
): EtiquetaProducao[] {
  const disponiveis = pessoasPorNumeracao(pares);
  const comDono: EtiquetaProducao[] = [];
  const extras: EtiquetaProducao[] = [];
  for (const label of labels) {
    const fila = disponiveis.get(normalizarNumeracao(label.size));
    const pessoa = label.parsed ? fila?.shift() : undefined;
    if (pessoa) comDono.push({ ...label, pessoa });
    else extras.push(label);
  }
  faltaNoPedido(disponiveis);
  comDono.sort((a, b) => compararPessoas(a.pessoa!, b.pessoa!));
  return [...comDono, ...extras];
}

/**
 * Romaneio com uma filial + setor por caixa, para cada setor receber a sua.
 * As linhas do pedido (referência e numeração) são repartidas entre as
 * pessoas; o que sobra vai para as caixas de extras, no fim.
 */
export function romaneioPorSetor(
  linhas: PackingLine[],
  pares: ParIdentificado[],
  capacities?: readonly number[],
): GrupoDoRomaneio[] {
  const estoque = linhas
    .map((linha) => ({ ...linha, size: normalizarNumeracao(linha.size), quantity: Math.round(linha.quantity) }))
    .filter((linha) => linha.quantity > 0);
  const pessoas = pares
    .flatMap((par) => {
      const pessoa = pessoaDe(par);
      return pessoa ? [{ pessoa, size: normalizarNumeracao(par.numeracao) }] : [];
    })
    .sort((a, b) => compararPessoas(a.pessoa, b.pessoa));

  const setores = new Map<string, { filial: string; setor: string; linhas: PackingLine[] }>();
  const sobras = new Map<string, Pessoa[]>();
  for (const { pessoa, size } of pessoas) {
    const origem = estoque.find((linha) => linha.size === size && linha.quantity > 0);
    if (!origem) {
      sobras.set(size, [...(sobras.get(size) ?? []), pessoa]);
      continue;
    }
    origem.quantity -= 1;
    const chave = `${pessoa.filial}\u0000${pessoa.setor}`;
    const grupo = setores.get(chave) ?? { filial: pessoa.filial, setor: pessoa.setor, linhas: [] };
    const linha = grupo.linhas.find((item) => item.reference === origem.reference && item.size === size);
    if (linha) linha.quantity += 1;
    else grupo.linhas.push({ reference: origem.reference, size, quantity: 1 });
    setores.set(chave, grupo);
  }
  faltaNoPedido(sobras);

  const porNumeracao = (a: PackingLine, b: PackingLine) =>
    a.reference.localeCompare(b.reference, "pt-BR") || primeiroNumero(a.size) - primeiroNumero(b.size);
  const grupos: GrupoDoRomaneio[] = [...setores.values()].map((grupo) => ({
    filial: grupo.filial,
    setor: grupo.setor,
    volumes: packVolumes([...grupo.linhas].sort(porNumeracao), capacities),
  }));
  const restantes = estoque.filter((linha) => linha.quantity > 0).sort(porNumeracao);
  if (restantes.length > 0) {
    grupos.push({ filial: null, setor: null, volumes: packVolumes(restantes, capacities) });
  }
  return grupos;
}
