/**
 * Utility functions for normalizing names across the application
 */

/**
 * Normalizes seller names to handle variations like "Lawrence" and "Laurence"
 * @param name - The seller name to normalize
 * @returns The normalized seller name
 */
export function normalizeSellerName(name: string): string {
  if (!name) return name;

  // Normalizar "Lawrence" e "Laurence" para "Lawrence"
  const normalized = name.trim();
  if (
    normalized.toLowerCase() === "lawrence" ||
    normalized.toLowerCase() === "laurence"
  ) {
    return "Lawrence";
  }

  return normalized;
}

/**
 * Normalizes designer names to handle variations like "Vítor" and "Vitor"
 * @param name - The designer name to normalize
 * @returns The normalized designer name
 */
export function normalizeDesignerName(name: string): string {
  if (!name) return name;

  const normalized = name.trim().toLowerCase();

  // Normalizar variações do Vitor
  if (
    normalized === "vitor" ||
    normalized === "vítor" ||
    normalized === "vito"
  ) {
    return "Vitor";
  }

  // Normalizar variações do Felipe
  if (
    normalized === "felipe" ||
    normalized === "fel" ||
    normalized === "feli"
  ) {
    return "Felipe";
  }

  // Para outros nomes, manter primeira letra maiúscula e remover espaços extras
  return (
    name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase()
  );
}
