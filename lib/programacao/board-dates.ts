/**
 * Datas da Programação/Expedição.
 *
 * A Data de Embarque vem do GHL como texto em dd/mm/aaaa (campo TEXT no CRM),
 * mas registros antigos migrados do ActiveCampaign ainda aparecem em aaaa-mm-dd.
 * Todo o board fala dd/mm — os helpers aqui aceitam os dois formatos na entrada
 * e sempre devolvem dd/mm/aaaa na saída.
 */

/** Normaliza para dd/mm/aaaa. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  if (value.includes("-")) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  return value;
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parts = value.includes("-")
    ? value.split("-").map(Number)
    : value.split("/").map(Number).reverse();
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Converte a Data de Embarque para aaaa-mm-dd, o formato que o Postgres aceita
 * numa coluna DATE. Devolve null quando o texto não é uma data — o campo no GHL
 * é livre e já apareceu preenchido com espaço na frente.
 */
export function toIsoDate(value: string | null | undefined): string | null {
  const parsed = parseDate(value?.trim());
  if (!parsed) return null;
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
}

/** Hoje em Brasília (UTC-3), zerado, para comparar com a data de embarque. */
export function getCurrentDateBrasilia(): Date {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const brasiliaTime = new Date(utcTime - 3 * 60 * 60000);
  brasiliaTime.setHours(0, 0, 0, 0);
  return brasiliaTime;
}

export function getDaysDifference(target: Date, current: Date): number {
  return Math.ceil((target.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
}

/** Dias até o embarque; negativo = atrasado. null quando não há data. */
export function getDaysUntilShipping(
  dataEmbarque: string | null | undefined,
): number | null {
  const shippingDate = parseDate(dataEmbarque);
  if (!shippingDate) return null;
  return getDaysDifference(shippingDate, getCurrentDateBrasilia());
}

export function isOverdue(dataEmbarque: string | null | undefined): boolean {
  const days = getDaysUntilShipping(dataEmbarque);
  return days !== null && days < 0;
}

export type ShippingStatus = {
  message: string;
  colorClass: string;
};

/** Selo de urgência do card, a partir da distância até o embarque. */
export function getShippingStatus(
  dataEmbarque: string | null | undefined,
): ShippingStatus | null {
  const days = getDaysUntilShipping(dataEmbarque);
  if (days === null) return null;

  if (days < 0) {
    const atraso = Math.abs(days);
    return {
      message: `⚠ Atrasado ${atraso} ${atraso === 1 ? "dia" : "dias"}`,
      colorClass: "text-red-700 dark:text-red-400 font-semibold",
    };
  }
  if (days === 0) {
    return {
      message: "🚨 Embarque HOJE",
      colorClass: "text-yellow-700 dark:text-yellow-400 font-bold",
    };
  }
  if (days <= 3) {
    return {
      message: `⏰ Faltam ${days} ${days === 1 ? "dia" : "dias"}`,
      colorClass: "text-yellow-700 dark:text-yellow-400 font-semibold",
    };
  }
  if (days <= 7) {
    return {
      message: `📅 Faltam ${days} dias`,
      colorClass: "text-orange-700 dark:text-orange-400 font-medium",
    };
  }
  return {
    message: `📅 Faltam ${days} dias`,
    colorClass: "text-muted-foreground",
  };
}

/** Fundo do card por urgência do embarque. */
export function getUrgencyBackgroundClass(
  dataEmbarque: string | null | undefined,
): string {
  const days = getDaysUntilShipping(dataEmbarque);
  if (days === null) return "";
  if (days < 0) {
    return "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800";
  }
  if (days <= 3) {
    return "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800";
  }
  if (days <= 7) {
    return "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800";
  }
  return "";
}
