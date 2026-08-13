import type { GhlCustomFieldDef, GhlOpportunity } from "@/lib/ghl/api";
import { positiveQuantity, type ErpGradeItem } from "./product-rules";

export type GhlProductModel = {
  modelNumber: number;
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
  const models = new Map<number, GhlProductModel>();

  const getModel = (modelNumber: number) => {
    const current = models.get(modelNumber);
    if (current) return current;
    const created: GhlProductModel = {
      modelNumber,
      artUrl: null,
      grades: [],
      totalPairs: 0,
    };
    models.set(modelNumber, created);
    return created;
  };

  for (const definition of definitions) {
    const grade = gradeDefinition(definition);
    if (grade) {
      const entry = fieldsById.get(definition.id);
      const value = entry ? rawFieldValue(entry) : null;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;

      const optionLabels = new Map(
        (definition.picklistOptions ?? []).map((option) => [option.id, option.label]),
      );
      const model = getModel(grade.modelNumber);

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
      getModel(Number(artMatch[1])).artUrl = value.trim();
    }
  }

  return Array.from(models.values())
    .filter((model) => model.grades.length > 0)
    .map((model) => ({
      ...model,
      grades: model.grades.sort((a, b) => a.size.localeCompare(b.size, "pt-BR")),
    }))
    .sort((a, b) => a.modelNumber - b.modelNumber);
}
