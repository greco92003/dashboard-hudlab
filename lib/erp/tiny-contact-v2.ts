import { getTinyV2Token } from "@/lib/tiny/auth";
import { onlyDigits, type ErpContactDraft } from "./contact-rules";

const BASE_URL = process.env.TINY_BASE_URL ?? "https://api.tiny.com.br/api2";

function formatDocument(document: string): string {
  const digits = onlyDigits(document);
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return document.trim();
}

export type TinyContactMatch = {
  id: number;
  name: string;
  fantasy: string;
  document: string;
};

type TinyResponse = {
  retorno?: {
    status_processamento?: number | string;
    status?: string;
    codigo_erro?: number | string;
    erros?: Array<{ erro?: string }>;
    contatos?: Array<{
      contato?: {
        id?: number | string;
        nome?: string;
        fantasia?: string;
        cpf_cnpj?: string;
      };
    }>;
    contato?: {
      id?: number | string;
      nome?: string;
      fantasia?: string | null;
      tipo_pessoa?: string | null;
      cpf_cnpj?: string;
      ie?: string | null;
      im?: string | null;
      endereco?: string | null;
      numero?: string | null;
      complemento?: string | null;
      bairro?: string | null;
      cep?: string | null;
      cidade?: string | null;
      uf?: string | null;
      pais?: string | null;
      fone?: string | null;
      celular?: string | null;
      email?: string | null;
      email_nfe?: string | null;
    };
    registros?: Array<{
      registro?: {
        id?: number | string;
        status?: string;
        sequencia?: number | string;
        erros?: Array<{ erro?: string }>;
      };
    }>;
  };
};

function tinyErrors(retorno: NonNullable<TinyResponse["retorno"]>, fallback: string) {
  const messages = [
    ...(retorno.erros ?? []),
    ...(retorno.registros ?? []).flatMap((item) => item.registro?.erros ?? []),
  ].map((item) => item.erro).filter((message): message is string => Boolean(message));
  return messages.join("; ") || fallback;
}

function tinySucceeded(retorno: NonNullable<TinyResponse["retorno"]>) {
  return retorno.status === "OK" && !(retorno.registros ?? []).some(
    (item) => item.registro?.status?.toLowerCase() === "erro",
  );
}

async function tinyV2Post(path: string, params: Record<string, string>) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({
      token: getTinyV2Token(),
      formato: "JSON",
      ...params,
    }),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Tiny API v2 respondeu HTTP ${response.status}.`);

  let data: TinyResponse;
  try {
    data = JSON.parse(text) as TinyResponse;
  } catch {
    throw new Error("O Tiny retornou uma resposta inválida.");
  }

  const retorno = data.retorno;
  if (!retorno) throw new Error("Resposta sem o campo retorno do Tiny.");
  return retorno;
}

export async function findTinyContactByDocument(
  document: string,
): Promise<TinyContactMatch | null> {
  const digits = onlyDigits(document);
  if (!digits) return null;
  // Searching only by the document is intentional. Tiny combines `pesquisa`
  // and `cpf_cnpj` as filters; including the GHL name causes false negatives
  // when the same document is registered under a different spelling/name.
  const retorno = await tinyV2Post("/contatos.pesquisa.php", {
    cpf_cnpj: formatDocument(document),
  });

  // Código 20 significa que a pesquisa não encontrou registros.
  if (String(retorno.codigo_erro ?? "") === "20") return null;
  if (retorno.status !== "OK") {
    throw new Error(tinyErrors(retorno, "Falha ao consultar contato no Tiny."));
  }

  const exact = retorno.contatos
    ?.map((item) => item.contato)
    .find((item) => onlyDigits(item?.cpf_cnpj ?? "") === digits);
  if (!exact?.id) return null;
  return {
    id: Number(exact.id),
    name: exact.nome ?? "Contato sem nome",
    fantasy: exact.fantasia ?? "",
    document: exact.cpf_cnpj ?? digits,
  };
}

export async function getTinyContactById(
  tinyContactId: number,
  ghlContactId: string,
): Promise<ErpContactDraft> {
  const retorno = await tinyV2Post("/contato.obter.php", {
    id: String(tinyContactId),
  });
  if (retorno.status !== "OK" || !retorno.contato) {
    throw new Error(
      tinyErrors(retorno, "Falha ao obter o cadastro completo no Tiny."),
    );
  }
  const contact = retorno.contato;
  const email = contact.email?.trim() ?? "";
  return {
    ghlContactId,
    name: contact.nome?.trim() ?? "",
    fantasy: contact.fantasia?.trim() ?? "",
    personType: contact.tipo_pessoa === "J" ? "J" : "F",
    document: contact.cpf_cnpj?.trim() ?? "",
    stateRegistration: contact.ie?.trim() ?? "",
    municipalRegistration: contact.im?.trim() ?? "",
    // The public obtain endpoint does not return the existing contributor code.
    contributor: "0",
    address: contact.endereco?.trim() ?? "",
    number: contact.numero?.trim() ?? "",
    complement: contact.complemento?.trim() ?? "",
    neighborhood: contact.bairro?.trim() ?? "",
    postalCode: contact.cep?.trim() ?? "",
    city: contact.cidade?.trim() ?? "",
    state: contact.uf?.trim().toUpperCase() ?? "",
    country: contact.pais?.trim() || "Brasil",
    phone: contact.celular?.trim() || contact.fone?.trim() || "",
    email,
    emailNfe: contact.email_nfe?.trim() || email,
  };
}

export async function getTinyContactFiscalData(document: string) {
  const existing = await findTinyContactByDocument(document);
  if (!existing) return null;

  const retorno = await tinyV2Post("/contato.obter.php", {
    id: String(existing.id),
  });
  if (retorno.status !== "OK" || !retorno.contato) {
    throw new Error(
      tinyErrors(retorno, "Falha ao obter o cadastro fiscal no Tiny."),
    );
  }

  const stateRegistration = retorno.contato.ie?.trim() ?? "";
  const municipalRegistration = retorno.contato.im?.trim() ?? "";
  return {
    tinyContactId: existing.id,
    stateRegistration,
    municipalRegistration,
    state: retorno.contato.uf?.trim().toUpperCase() ?? "",
    hasFiscalData: Boolean(stateRegistration || municipalRegistration),
  };
}

function toTinyPayload(draft: ErpContactDraft, tinyId?: number) {
  const payload: Record<string, string | number> = {
    ...(tinyId ? { id: tinyId } : { sequencia: 1 }),
    nome: draft.name.trim(),
    fantasia: draft.fantasy.trim(),
    tipo_pessoa: draft.personType,
    cpf_cnpj: onlyDigits(draft.document),
    ie: draft.stateRegistration.trim(),
    im: draft.municipalRegistration.trim(),
    endereco: draft.address.trim(),
    numero: draft.number.trim(),
    complemento: draft.complement.trim(),
    bairro: draft.neighborhood.trim(),
    cep: draft.postalCode.trim(),
    cidade: draft.city.trim(),
    uf: draft.state.trim().toUpperCase(),
    pais: draft.country.trim(),
    fone: draft.phone.trim(),
    email: draft.email.trim(),
    email_nfe: draft.emailNfe.trim(),
    situacao: "A",
  };
  // The official V2 contract exposes `contribuinte` only on inclusion. The
  // alteration endpoint does not accept it, so preserve the current Tiny value.
  if (!tinyId) payload.contribuinte = draft.contributor;
  return payload;
}

export async function saveTinyContact(draft: ErpContactDraft) {
  let existing = await findTinyContactByDocument(draft.document);
  const contact = toTinyPayload(draft, existing?.id);
  let retorno = await tinyV2Post(
    existing ? "/contato.alterar.php" : "/contato.incluir.php",
    { contato: JSON.stringify({ contatos: [{ contato: contact }] }) },
  );

  // A contact can be created between the preview and this write, or Tiny may
  // detect a legacy duplicate that was not returned before. Resolve it by CPF/
  // CNPJ and update that exact record instead of asking the user to duplicate it.
  if (!existing && !tinySucceeded(retorno)) {
    existing = await findTinyContactByDocument(draft.document);
    if (existing) {
      retorno = await tinyV2Post("/contato.alterar.php", {
        contato: JSON.stringify({ contatos: [{ contato: toTinyPayload(draft, existing.id) }] }),
      });
    }
  }

  if (!tinySucceeded(retorno)) {
    throw new Error(tinyErrors(retorno, "O Tiny recusou o cadastro do contato."));
  }
  const createdId = retorno.registros?.[0]?.registro?.id;
  return {
    id: existing?.id ?? (createdId ? Number(createdId) : null),
    action: existing ? ("updated" as const) : ("created" as const),
    contributorApplied: !existing,
  };
}
