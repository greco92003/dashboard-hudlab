export const GHL_FUNNEL_STAGES = {
  lead: "Lead",
  commockautomatico: "Com Mockup Automático",
  semmockautomatico: "Sem Mockup Automático",
  solicitouorcamento: "Solicitou Orçamento",
  solicitoumockupoficial: "Solicitou Mockup Oficial",
  emnegociacao: "Em Negociação",
  negociofechado: "Negócio Fechado",
} as const;

export type GhlFunnelStageSlug = keyof typeof GHL_FUNNEL_STAGES;
export type GhlFunnelVariant = "with_mockup" | "without_mockup";

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
  return null;
}
