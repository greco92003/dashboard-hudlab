/**
 * Campos do negócio que a planilha de /deals deixa preencher e que são
 * gravados na oportunidade do GHL. A chave é a coluna do deals_cache; o
 * fieldKey é o do GHL (sem o prefixo "opportunity."), o mesmo de
 * OPPORTUNITY_FIELD_MAP em lib/ghl/api.ts.
 *
 * Sem dependência de servidor: a tela usa a lista e a validação para não
 * mandar valor que o servidor recusaria.
 */
export type DealFieldKind = "texto" | "uf" | "numero" | "data";

export interface DealEditableField {
  fieldKey: string;
  kind: DealFieldKind;
  label: string;
}

export const DEAL_EDITABLE_FIELDS = {
  data_embarque: { fieldKey: "data_de_embarque", kind: "data", label: "Data de Embarque" },
  estado: { fieldKey: "estado", kind: "uf", label: "Estado" },
  "quantidade-de-pares": {
    fieldKey: "nmero_quantidade_de_pares",
    kind: "numero",
    label: "Quantidade de Pares",
  },
  vendedor: { fieldKey: "vendedor", kind: "texto", label: "Vendedor" },
  designer: { fieldKey: "designer_responsvel", kind: "texto", label: "Designer" },
  "utm-source": { fieldKey: "utm_source_negcio", kind: "texto", label: "UTM Source" },
  "utm-medium": { fieldKey: "utm_medium_negcio", kind: "texto", label: "UTM Medium" },
  segmento_de_negocio: {
    fieldKey: "segmento_do_negcio",
    kind: "texto",
    label: "Segmento de Negócio",
  },
  intencao_de_compra: {
    fieldKey: "inteno_de_compra_negcio",
    kind: "texto",
    label: "Intenção de Compra",
  },
} as const satisfies Record<string, DealEditableField>;

export type DealEditableColumn = keyof typeof DEAL_EDITABLE_FIELDS;

export function isDealEditableColumn(value: unknown): value is DealEditableColumn {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(DEAL_EDITABLE_FIELDS, value)
  );
}

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

/** Maior valor da coluna integer onde os pares são gravados. */
const MAX_PARES = 2_147_483_647;
const MAX_TEXTO = 200;

export type DealFieldValue = string | number;

export type DealFieldParse =
  | { ok: true; value: DealFieldValue }
  | { ok: false; error: string };

function isValidDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Valor digitado -> valor gravado no GHL. Data volta como dd/mm/aaaa, o
 * formato que a equipe usa no campo de texto do GHL (aceita também o
 * aaaa-mm-dd do <input type="date">).
 */
export function parseDealFieldValue(
  column: DealEditableColumn,
  raw: unknown,
): DealFieldParse {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!text) return { ok: false, error: "Informe um valor." };

  switch (DEAL_EDITABLE_FIELDS[column].kind) {
    case "uf": {
      const uf = text.toUpperCase();
      return (UFS as readonly string[]).includes(uf)
        ? { ok: true, value: uf }
        : { ok: false, error: "Use a sigla do estado (ex.: MG)." };
    }
    case "numero": {
      if (!/^\d+$/.test(text)) return { ok: false, error: "Use um número inteiro de pares." };
      const pares = Number(text);
      return pares > 0 && pares <= MAX_PARES
        ? { ok: true, value: pares }
        : { ok: false, error: "Quantidade de pares inválida." };
    }
    case "data": {
      const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      const [year, month, day] = iso
        ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
        : br
          ? [Number(br[3]), Number(br[2]), Number(br[1])]
          : [NaN, NaN, NaN];
      if (!isValidDate(year, month, day)) return { ok: false, error: "Data inválida." };
      return {
        ok: true,
        value: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
      };
    }
    case "texto":
      return text.length <= MAX_TEXTO
        ? { ok: true, value: text }
        : { ok: false, error: `Use no máximo ${MAX_TEXTO} caracteres.` };
  }
}
