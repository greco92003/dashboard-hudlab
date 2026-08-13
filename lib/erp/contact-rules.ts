import type { GhlContactDetail, GhlCustomFieldDef } from "@/lib/ghl/api";

export const TINY_CONTRIBUTOR_VALUES = ["0", "1", "2", "9"] as const;
export type TinyContributor = (typeof TINY_CONTRIBUTOR_VALUES)[number];

export type ErpContactDraft = {
  ghlContactId: string;
  name: string;
  fantasy: string;
  personType: "F" | "J";
  document: string;
  stateRegistration: string;
  municipalRegistration: string;
  contributor: TinyContributor;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  postalCode: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  emailNfe: string;
};

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^(contact|opportunity)\./, "")
    .replace(/[^a-z0-9]/g, "");
}

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ").trim();
  return String(value).trim();
}

export function mapGhlContactToErpDraft(
  contact: GhlContactDetail,
  definitions: GhlCustomFieldDef[],
): ErpContactDraft {
  const definitionById = new Map(definitions.map((item) => [item.id, item]));
  const values = new Map<string, string>();

  for (const field of contact.customFields ?? []) {
    const value = asText(field.value);
    if (!value) continue;
    const definition = definitionById.get(field.id);
    if (!definition) continue;
    values.set(normalizeKey(definition.fieldKey), value);
    values.set(normalizeKey(definition.name), value);
  }

  const get = (...aliases: string[]) => {
    for (const alias of aliases) {
      const value = values.get(normalizeKey(alias));
      if (value) return value;
    }
    return "";
  };

  // A regra comercial é intencionalmente baseada no campo CNPJ. Um campo
  // combinado CPF/CNPJ não deve transformar uma pessoa física em jurídica.
  const cnpj = get("cnpj", "cnpj da empresa");
  const cpf = get("cpf");
  const isCompany = Boolean(onlyDigits(cnpj));
  const fullName =
    contact.contactName?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  const company = contact.companyName?.trim() || get("empresa", "razao social");
  const email = contact.email?.trim() || "";

  return {
    ghlContactId: contact.id,
    name: isCompany ? company || fullName : fullName || company,
    fantasy: isCompany ? company : "",
    personType: isCompany ? "J" : "F",
    document: isCompany ? cnpj : cpf,
    stateRegistration: get("inscricao estadual", "ie"),
    municipalRegistration: get("inscricao municipal", "im"),
    contributor: "0",
    address: contact.address1?.trim() || get("endereco", "endereco rua avenida", "logradouro"),
    number: get("numero", "numero endereco"),
    complement: get("complemento"),
    neighborhood: get("bairro"),
    postalCode: contact.postalCode?.trim() || get("cep", "cep favor verificar no google se esta apontando para o endereco correto"),
    city: contact.city?.trim() || get("cidade"),
    state: (contact.state?.trim() || get("estado", "uf")).toUpperCase(),
    country: contact.country?.trim() || get("pais") || "Brasil",
    phone: contact.phone?.trim() || "",
    email,
    emailNfe: email,
  };
}

export function isValidCpfCnpj(value: string, personType: "F" | "J") {
  const digits = onlyDigits(value);
  const expected = personType === "J" ? 14 : 11;
  if (digits.length !== expected || /^(\d)\1+$/.test(digits)) return false;

  const calculate = (base: string, weights: number[]) => {
    const sum = base
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  if (personType === "F") {
    const first = calculate(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const second = calculate(digits.slice(0, 9) + first, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digits.endsWith(`${first}${second}`);
  }

  const first = calculate(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculate(digits.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
}
