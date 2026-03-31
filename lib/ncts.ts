// NCT - Narrativas, Compromissos, Tarefas
// Constantes e utilitários compartilhados

export type Setor = "design" | "comercial" | "financeiro" | "marketing" | "rh";

export const SETORES: {
  id: Setor;
  nome: string;
  cor: string;
  bg: string;
}[] = [
  { id: "design", nome: "Design", cor: "#EF4444", bg: "bg-red-500" },
  { id: "comercial", nome: "Comercial", cor: "#EC4899", bg: "bg-pink-500" },
  {
    id: "financeiro",
    nome: "Financeiro",
    cor: "#10B981",
    bg: "bg-emerald-500",
  },
  { id: "marketing", nome: "Marketing", cor: "#3B82F6", bg: "bg-blue-500" },
  { id: "rh", nome: "RH", cor: "#EAB308", bg: "bg-yellow-500" },
];

export function getSetor(id: string | null | undefined) {
  return SETORES.find((s) => s.id === id) ?? null;
}

export type StatusNarrativa =
  | "em_andamento"
  | "concluida"
  | "pausada"
  | "cancelada";
export type StatusCompromisso =
  | "em_andamento"
  | "concluido"
  | "pausado"
  | "cancelado";
export type StatusTarefa =
  | "nao_iniciada"
  | "em_andamento"
  | "em_revisao"
  | "concluida"
  | "atrasada"
  | "bloqueada";
export type PrioridadeTarefa = "baixa" | "media" | "alta" | "critica";

export const STATUS_NARRATIVA: Record<
  StatusNarrativa,
  { label: string; color: string }
> = {
  em_andamento: { label: "Em andamento", color: "bg-blue-500" },
  concluida: { label: "Concluída", color: "bg-emerald-500" },
  pausada: { label: "Pausada", color: "bg-amber-500" },
  cancelada: { label: "Cancelada", color: "bg-red-500" },
};

export const STATUS_COMPROMISSO: Record<
  StatusCompromisso,
  { label: string; color: string }
> = {
  em_andamento: { label: "Em andamento", color: "bg-blue-500" },
  concluido: { label: "Concluído", color: "bg-emerald-500" },
  pausado: { label: "Pausado", color: "bg-amber-500" },
  cancelado: { label: "Cancelado", color: "bg-red-500" },
};

export const STATUS_TAREFA: Record<
  StatusTarefa,
  { label: string; color: string; textColor: string }
> = {
  nao_iniciada: {
    label: "Não iniciada",
    color: "bg-slate-500",
    textColor: "text-slate-700 dark:text-slate-300",
  },
  em_andamento: {
    label: "Em andamento",
    color: "bg-blue-500",
    textColor: "text-blue-700 dark:text-blue-300",
  },
  em_revisao: {
    label: "Em revisão",
    color: "bg-purple-500",
    textColor: "text-purple-700 dark:text-purple-300",
  },
  concluida: {
    label: "Concluída",
    color: "bg-emerald-500",
    textColor: "text-emerald-700 dark:text-emerald-300",
  },
  atrasada: {
    label: "Atrasada",
    color: "bg-red-500",
    textColor: "text-red-700 dark:text-red-300",
  },
  bloqueada: {
    label: "Bloqueada",
    color: "bg-orange-500",
    textColor: "text-orange-700 dark:text-orange-300",
  },
};

export const PRIORIDADE_TAREFA: Record<
  PrioridadeTarefa,
  { label: string; color: string }
> = {
  baixa: { label: "Baixa", color: "text-slate-500" },
  media: { label: "Média", color: "text-blue-500" },
  alta: { label: "Alta", color: "text-amber-500" },
  critica: { label: "Crítica", color: "text-red-500" },
};

export function calcularNivel(xpTotal: number): {
  nivel: number;
  xpAtual: number;
  xpProximo: number;
  progresso: number;
} {
  let nivel = 1;
  let xpAcumulado = 0;
  while (true) {
    const xpProximo = Math.round(100 * Math.pow(nivel, 1.4));
    if (xpAcumulado + xpProximo > xpTotal) {
      return {
        nivel,
        xpAtual: xpTotal - xpAcumulado,
        xpProximo,
        progresso: Math.round(((xpTotal - xpAcumulado) / xpProximo) * 100),
      };
    }
    xpAcumulado += xpProximo;
    nivel++;
    if (nivel > 100) break;
  }
  return { nivel: 100, xpAtual: 0, xpProximo: 0, progresso: 100 };
}

export function formatarData(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

export function diasRestantes(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const hoje = new Date();
  const prazo = new Date(dateStr);
  const diff = prazo.getTime() - hoje.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
