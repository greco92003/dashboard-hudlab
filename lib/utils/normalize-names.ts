/**
 * Utility functions for normalizing names across the application
 */

/**
 * Normalizes seller names to handle variations like "Lawrence" and "Laurence"
 * @param name - The seller name to normalize
 * @returns The normalized seller name
 */
export function normalizeSellerName(name: string): string {
  if (!name) return "";

  // Remover espaços extras e converter para lowercase para comparação
  const normalized = name.trim().toLowerCase();

  // Normalizar "Lawrence" e "Laurence" para "Lawrence"
  if (normalized === "lawrence" || normalized === "laurence") {
    return "Lawrence";
  }

  // Normalizar variações de "Willian"
  if (
    normalized === "willian" ||
    normalized === "wilian" ||
    normalized === "william"
  ) {
    return "Willian";
  }

  // Normalizar variações de "Schay"
  if (normalized === "schay" || normalized === "schaiany") {
    return "Schay";
  }

  // Normalizar variações de "Raisa"
  if (normalized === "raisa" || normalized === "raísa") {
    return "Raisa";
  }

  // Para outros nomes, manter primeira letra maiúscula e remover espaços extras
  return (
    name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase()
  );
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

  // Normalizar variações do Pedro
  if (normalized === "pedro" || normalized === "ped") {
    return "Pedro";
  }

  // Para outros nomes, manter primeira letra maiúscula e remover espaços extras
  return (
    name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase()
  );
}
