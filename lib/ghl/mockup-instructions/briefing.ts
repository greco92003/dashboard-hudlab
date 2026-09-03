export type BriefingReference = {
  id: string;
  url: string;
  isImage: boolean;
};

export type BriefingParagraph = {
  texto: string;
  referencias: Array<{ id: string; legenda: string }>;
};

export function shouldSkipMockupInstruction(
  instructionType: "initial" | "alteration",
  choice: unknown,
) {
  const normalized = String(choice ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return instructionType === "initial" && normalized === "nao";
}

/** URLs come from the conversation/catalog, never from generated text. */
export function formatBriefing(
  paragraphs: BriefingParagraph[],
  references: BriefingReference[],
) {
  const byId = new Map(references.map((reference) => [reference.id, reference]));
  const used = new Set<string>();
  return paragraphs.flatMap((paragraph) => {
    const blocks = [paragraph.texto.trim()];
    for (const item of paragraph.referencias) {
      const reference = byId.get(item.id);
      if (!reference || !/^https?:\/\//i.test(reference.url)) continue;
      if (used.has(reference.url)) continue;
      used.add(reference.url);
      const label = item.legenda.replace(/[\[\]\\\r\n]/g, " ").trim() || "Referência";
      // Angle brackets preserve parentheses and signed query strings in URLs.
      const url = reference.url.replace(/</g, "%3C").replace(/>/g, "%3E");
      blocks.push(`${reference.isImage ? "!" : ""}[${label}](<${url}>)`);
    }
    return blocks;
  }).filter(Boolean).join("\n\n");
}

export function formatGhlBriefing(summary: string, headline: string) {
  const linkedReferences = summary.replace(
    /!\[([^\]]+)\]\(<(https?:\/\/[^>]+)>\)/g,
    (_match, label: string, url: string) => `[${label}]\n${url}`,
  );
  return `ALTERAÇÃO RESUMIDA\n${headline.trim()}\n\n${linkedReferences.trim()}`;
}

export function alterationHeadline(result: {
  pedidoAtual?: unknown;
  alteracoesDestaRodada?: unknown;
}) {
  const changes = Array.isArray(result.alteracoesDestaRodada)
    ? result.alteracoesDestaRodada.filter(
        (item): item is string => typeof item === "string" && Boolean(item.trim()),
      )
    : [];
  if (changes.length) return changes.slice(0, 2).join(" ");
  return typeof result.pedidoAtual === "string" && result.pedidoAtual.trim()
    ? result.pedidoAtual.trim()
    : "Consultar o briefing completo abaixo.";
}

export function previousBriefingReferences(summary: string | null): BriefingReference[] {
  if (!summary) return [];
  return Array.from(summary.matchAll(/(!?)\[[^\]]*\]\(<(https?:\/\/[^>]+)>\)/g))
    .map((match, index) => ({
      id: `previous-${index + 1}`,
      url: match[2],
      isImage: match[1] === "!",
    }));
}

export function briefingPreview(summary: string) {
  return summary.replace(/!?\[([^\]]*)\]\(<?https?:\/\/[^\s]+>?\)/g, "$1");
}

export function mockupStageStyle(stage: string) {
  const normalized = stage.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized === "mockup prioridade") {
    return { accent: "border-l-emerald-500", badge: "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" };
  }
  if (normalized === "alteracao prioridade") {
    return { accent: "border-l-rose-500", badge: "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-400" };
  }
  return { accent: "border-l-amber-500", badge: "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400" };
}
