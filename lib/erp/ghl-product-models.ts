import type { GhlCustomFieldDef, GhlOpportunity } from "@/lib/ghl/api";
import { positiveQuantity, type ErpGradeItem } from "./product-rules";

export type GhlProductModel = {
  modelNumber: number;
  audience: "adulto" | "infantil";
  soleColor: string | null;
  artUrl: string | null;
  grades: ErpGradeItem[];
  totalPairs: number;
};

function rawFieldValue(entry: Record<string, unknown>): unknown {
  if ("fieldValue" in entry) return entry.fieldValue;
  for (const [key, value] of Object.entries(entry)) {
    if (key.startsWith("fieldValue")) return value;
  }
  return null;
}

function gradeDefinition(definition: GhlCustomFieldDef): {
  modelNumber: number;
  audience: "adulto" | "infantil";
} | null {
  const match = definition.fieldKey.match(/grade_modelo_(\d+)(?:_(adulto|infantil))?$/i);
  if (!match) return null;
  return {
    modelNumber: Number(match[1]),
    audience:
      match[2]?.toLowerCase() === "infantil" || /infantil/i.test(definition.name)
        ? "infantil"
        : "adulto",
  };
}

export function extractGhlProductModels(
  opportunity: GhlOpportunity,
  definitions: GhlCustomFieldDef[],
): GhlProductModel[] {
  const fieldsById = new Map(
    (opportunity.customFields ?? []).map((field) => [field.id, field]),
  );
  const models = new Map<string, GhlProductModel>();
  const artUrls = new Map<number, string>();
  const soleColors = new Map<number, string>();

  const getModel = (modelNumber: number, audience: "adulto" | "infantil") => {
    const key = `${modelNumber}:${audience}`;
    const current = models.get(key);
    if (current) return current;
    const created: GhlProductModel = {
      modelNumber,
      soleColor: null,
      artUrl: null,
      audience,
      grades: [],
      totalPairs: 0,
    };
    models.set(key, created);
    return created;
  };

  for (const definition of definitions) {
    const soleMatch =
      definition.name.match(/^Solado Modelo (\d+)$/i) ??
      definition.fieldKey.match(/\.solado_modelo_(\d+)$/i);
    if (soleMatch) {
      const entry = fieldsById.get(definition.id);
      const value = entry ? rawFieldValue(entry) : null;
      if (typeof value === "string" && value.trim()) {
        soleColors.set(Number(soleMatch[1]), value.trim());
      }
      continue;
    }

    const grade = gradeDefinition(definition);
    if (grade) {
      const entry = fieldsById.get(definition.id);
      const value = entry ? rawFieldValue(entry) : null;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;

      const optionLabels = new Map<string, string>();
      for (const option of definition.picklistOptions ?? []) {
        if (typeof option !== "string") {
          optionLabels.set(option.id, option.label);
        }
      }
      const model = getModel(grade.modelNumber, grade.audience);

      for (const [optionId, rawQuantity] of Object.entries(
        value as Record<string, unknown>,
      )) {
        const quantity = positiveQuantity(rawQuantity);
        const size = optionLabels.get(optionId);
        if (!quantity || !size) continue;
        model.grades.push({ size, quantity, audience: grade.audience });
        model.totalPairs += quantity;
      }
      continue;
    }

    const artMatch = definition.fieldKey.match(/artes_aprovadas_modelo_(\d+)$/i);
    if (!artMatch) continue;
    const entry = fieldsById.get(definition.id);
    const value = entry ? rawFieldValue(entry) : null;
    if (typeof value === "string" && value.trim()) {
      artUrls.set(Number(artMatch[1]), value.trim());
    }
  }

  return Array.from(models.values())
    .filter((model) => model.grades.length > 0)
    .map((model) => ({
      ...model,
      grades: model.grades.sort((a, b) => a.size.localeCompare(b.size, "pt-BR")),
      artUrl: artUrls.get(model.modelNumber) ?? null,
      soleColor: soleColors.get(model.modelNumber) ?? null,
    }))
    .sort((a, b) => a.modelNumber - b.modelNumber || a.audience.localeCompare(b.audience));
}
