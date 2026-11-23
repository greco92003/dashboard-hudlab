import "server-only";

import {
  extractOpportunityFieldValue,
  fetchCustomFieldDefs,
  fetchGhlContactById,
  fetchOpportunityById,
  type GhlCustomFieldDef,
} from "@/lib/ghl/api";
import { ufDoTexto } from "@/lib/fechamento/mensagens";

// O que a aba Mensagens do Fechamento preenche sozinha quando é aberta pelo
// card: CEP e estado de entrega do cadastro. Primeiro a oportunidade (o
// cadastro completo grava lá), depois os campos do contato e, por último, o
// endereço padrão do contato. Três leituras no GHL por abertura.

export interface DadosDoCliente {
  cep: string | null;
  uf: string | null;
  pares: number | null;
}

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

function valorDoContato(entrada: Record<string, unknown> | undefined): unknown {
  if (!entrada) return null;
  if ("value" in entrada && entrada.value != null) return entrada.value;
  for (const [chave, valor] of Object.entries(entrada)) if (chave.startsWith("fieldValue") && valor != null) return valor;
  return null;
}

function idDoCampo(defs: GhlCustomFieldDef[], teste: (chave: string) => boolean): string | null {
  return defs.find((d) => teste(d.fieldKey))?.id ?? null;
}

export async function dadosDoClienteParaMensagens(opportunityId: string): Promise<DadosDoCliente> {
  const [oportunidade, defsOp, defsContato] = await Promise.all([
    fetchOpportunityById(opportunityId),
    fetchCustomFieldDefs("opportunity"),
    fetchCustomFieldDefs("contact"),
  ]);
  const campoDaOp = (teste: (chave: string) => boolean) => {
    const id = idDoCampo(defsOp, teste);
    const entrada = id ? oportunidade.customFields?.find((c) => c.id === id) : undefined;
    return entrada ? extractOpportunityFieldValue(entrada) : null;
  };

  let cep = soDigitos(campoDaOp((k) => k === "opportunity.cep"));
  let uf = ufDoTexto(campoDaOp((k) => k === "opportunity.estado"));
  const paresOp = Number(campoDaOp((k) => k === "opportunity.nmero_quantidade_de_pares"));
  let pares = Number.isFinite(paresOp) && paresOp > 0 ? Math.round(paresOp) : null;

  if ((cep.length !== 8 || !uf || !pares) && oportunidade.contactId) {
    const contato = await fetchGhlContactById(oportunidade.contactId);
    const campo = (teste: (chave: string) => boolean) => {
      const id = idDoCampo(defsContato, teste);
      return id ? valorDoContato(contato.customFields?.find((c) => c.id === id) as Record<string, unknown> | undefined) : null;
    };
    if (cep.length !== 8) {
      const doCadastro = soDigitos(campo((k) => k.startsWith("contact.cep")));
      cep = doCadastro.length === 8 ? doCadastro : soDigitos(contato.postalCode);
    }
    uf ??= ufDoTexto(campo((k) => k === "contact.estado")) ?? ufDoTexto(contato.state);
    if (!pares) {
      const doContato = Number(campo((k) => k === "contact.qntd_pares"));
      pares = Number.isFinite(doContato) && doContato > 0 ? Math.round(doContato) : null;
    }
  }

  return { cep: cep.length === 8 ? cep : null, uf, pares };
}
