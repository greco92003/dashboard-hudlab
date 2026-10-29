export const GHL_FUNNEL_STAGES = {
  lead: "Lead",
  commockautomatico: "Com Mockup Automático",
  semmockautomatico: "Sem Mockup Automático",
  atendimentoladob: "Atendimento Lado B",
  blacknovember: "Black November",
  solicitouorcamento: "Solicitou Orçamento",
  solicitoumockupoficial: "Solicitou Mockup Oficial",
  emnegociacao: "Em Negociação",
  negociofechado: "Negócio Fechado",
} as const;

export type GhlFunnelStageSlug = keyof typeof GHL_FUNNEL_STAGES;
export type GhlFunnelVariant =
  | "with_mockup"
  | "without_mockup"
  | "lado_b"
  | "black_november";

export const GHL_FUNNEL_TITLES: Record<GhlFunnelVariant, string> = {
  with_mockup: "Com Mockup Automático",
  without_mockup: "Sem Mockup Automático",
  lado_b: "Atendimento Lado B",
  black_november: "Black November",
};

/**
 * Ordem em que os braços aparecem na tela. O braço aposentado fica por
 * último: ele continua na página pelo histórico, e o selo Ativo/Desativado
 * (calculado pela data do último webhook) mostra sozinho que parou.
 */
export const GHL_FUNNEL_VARIANTS: readonly GhlFunnelVariant[] = [
  "black_november",
  "lado_b",
  "without_mockup",
  "with_mockup",
];

/**
 * Braços aposentados, com a data em que pararam de receber lead novo.
 *
 * Aposentadoria é DECISÃO, não silêncio: sem isso o braço só cairia para
 * "Desativado" depois de dois dias sem webhook, e nesse meio-tempo a página
 * afirmaria que ele segue rodando. O funil continua na tela pelo histórico.
 */
export const GHL_FUNNEL_RETIRED: Partial<Record<GhlFunnelVariant, string>> = {
  // Substituído pelo "Atendimento Lado B".
  with_mockup: "2026-08-26",
  // Em novembro de 2026 todo lead novo vai para o fluxo da Black November, e
  // a partir de 01/12 o Atendimento Inicial volta 100% Sem Mockup (decisão de
  // 29/10/2026). O Sem Mockup não é aposentado: ele volta em dezembro.
  lado_b: "2026-11-01",
};

export const GHL_FUNNEL_PATHS: Record<
  GhlFunnelVariant,
  readonly GhlFunnelStageSlug[]
> = {
  with_mockup: [
    "lead",
    "commockautomatico",
    "solicitouorcamento",
    "solicitoumockupoficial",
    "emnegociacao",
    "negociofechado",
  ],
  without_mockup: [
    "lead",
    "semmockautomatico",
    "solicitouorcamento",
    "solicitoumockupoficial",
    "emnegociacao",
    "negociofechado",
  ],
  lado_b: [
    "lead",
    "atendimentoladob",
    "solicitouorcamento",
    "solicitoumockupoficial",
    "emnegociacao",
    "negociofechado",
  ],
  // Fluxo de entrada da Black November (01/11 a 30/11/2026), com webhook
  // próprio no GHL ("[webhook] blacknovember").
  black_november: [
    "lead",
    "blacknovember",
    "solicitouorcamento",
    "solicitoumockupoficial",
    "emnegociacao",
    "negociofechado",
  ],
};

/**
 * Braços identificados por TAG do contato, e não por webhook próprio.
 *
 * O "Atendimento Lado B" substituiu o "Com Mockup Automático" em 26/08/2026
 * sem ganhar um webhook dedicado: a tag só viaja no array `tags` dos eventos
 * das outras etapas e no sync de contatos. Sem este mapa o braço novo seria
 * invisível no funil, mesmo com os leads circulando normalmente.
 */
export const GHL_FUNNEL_VARIANT_TAGS: Record<string, GhlFunnelVariant> = {
  atendimento_lado_b: "lado_b",
};

/** Etapa marcadora do braço, usada para o evento sintético da tag. */
export const GHL_FUNNEL_VARIANT_MARKER: Record<
  GhlFunnelVariant,
  GhlFunnelStageSlug
> = {
  with_mockup: "commockautomatico",
  without_mockup: "semmockautomatico",
  lado_b: "atendimentoladob",
  black_november: "blacknovember",
};

const STAGE_ALIASES: Record<string, GhlFunnelStageSlug> = {
  solicitoumockoficial: "solicitoumockupoficial",
};

export function normalizeGhlFunnelStage(
  value: unknown,
): GhlFunnelStageSlug | null {
  if (typeof value !== "string") return null;

  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (normalized in GHL_FUNNEL_STAGES) {
    return normalized as GhlFunnelStageSlug;
  }

  return STAGE_ALIASES[normalized] ?? null;
}

export function getGhlFunnelVariant(
  stage: GhlFunnelStageSlug,
): GhlFunnelVariant | null {
  if (stage === "commockautomatico") return "with_mockup";
  if (stage === "semmockautomatico") return "without_mockup";
  if (stage === "atendimentoladob") return "lado_b";
  if (stage === "blacknovember") return "black_november";
  return null;
}
