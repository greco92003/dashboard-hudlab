import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { aguardarVagaGhl, esperaParaRepetir, TENTATIVAS_LEITURA_GHL } from "@/lib/ghl/rate-limit";
import { avisarTime, TAG_AVISOS_POS_VENDA } from "@/lib/ghl/team-alerts/send";
import { montarAviso } from "@/lib/ghl/team-alerts/text";
import {
  avaliarChegada,
  avaliarFechamento,
  gerarCodigo,
  lerSatisfacao,
  linkDoCodigo,
  normalizarCodigo,
  numerosDoPrograma,
  primeiroNome,
  type IndicacaoResumo,
  type NumerosDoPrograma,
  type Satisfacao,
  type StatusIndicacao,
} from "@/lib/hud-indica/regras";

// Servidor do Hud Indica: os webhooks chamados pelos workflows do GHL
// (resposta da pesquisa, chegada do indicado, fechamento e pagamento
// integral) e as ações da página /indica (marcar Pix pago, invalidar).
// O dashboard nunca faz Pix: só registra, avisa a Amanda e inscreve quem
// indicou nos workflows das mensagens M3b, M4 e M5.

const GHL_BASE_URL = process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";

/** Campos do GHL (criados em 23/11/2026). */
export const CAMPOS = {
  contato: {
    afiliado: "sDj7pZY6pokWdQVOERHe",
    codigo: "90qHrdSqk9rBGhbzpdcF",
    link: "ZImxuPbboeREk4DkERGm",
    satisfacao: "WoQ12OYVhVNlVr35v6SA",
    satisfacaoData: "ZiDaWgsFt3dt33CtJZR5",
    indicadoPor: "rp7lrvvZXZbLrQFGltn4",
    indicadoPorId: "Vb1CY3mYf4VKzDwBHU7k",
    ultimoIndicado: "Yf5e3ogqQveLTCiOWsaN",
    ultimaEmpresa: "0fSyeNZVG7vhY3HCpEjw",
    indicacoes: "iXcL3oDGwgKE4wTHScmi",
    chavePix: "FM0HDgAf2iqulHAsvWTG",
    cnpj: "iLKaEWwcK0AfgJ1wpdxr",
    cpf: "dj3miDybcgkU4tW7I7pk",
    razaoSocial: "dhKu17x5e7tSr3Lle3IP",
    empresa: "EuEEXar7CqXJtDJhdh1w",
  },
  oportunidade: {
    cnpj: "KKRoygXEJL27UhQcERex",
    cpf: "H7qMN9NKQgbmAIKGIOrf",
    razaoSocial: "onmWZAO6zf6cEChgFuMV",
    formaDePagamento: "Bjm2VR6pLqnZjdshrV7C",
    pares: "TFp4L5VxK9mHBaAMXyo7",
    indicadoPor: "RWzQdNQC7XsTqPpL4HfY",
    comoNosConheceu: "gZUFzf10LsPya5Qmu2BL",
  },
} as const;

export const TAGS = {
  nota10: "hud_nota10",
  ficouOk: "hud_ficou_ok",
  problema: "hud_problema",
  indicador: "hud_indicador",
  indicado: "hud_indicado",
} as const;

/**
 * Workflows só de mensagem (sem gatilho, com reentrada), em que o dashboard
 * inscreve quem indicou. Achados pelo nome: se o nome mudar no GHL, mudar aqui.
 */
export const WORKFLOWS = {
  avisoChegada: "Hud Indica | M3b para quem indicou (chegou indicado)",
  indicadoFechou: "Hud Indica | M4 para quem indicou (indicado fechou)",
  pixEnviado: "Hud Indica | M5 para quem indicou (Pix enviado)",
} as const;

type Metodo = "GET" | "POST" | "PUT";

async function ghl<T>(caminho: string, metodo: Metodo, versao: string, corpo?: unknown): Promise<T> {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  if (!token) throw new Error("GHL_PRIVATE_INTEGRATION_TOKEN não configurado");
  const idempotente = metodo !== "POST";
  for (let tentativa = 0; tentativa < TENTATIVAS_LEITURA_GHL; tentativa++) {
    const ultima = tentativa === TENTATIVAS_LEITURA_GHL - 1;
    await aguardarVagaGhl();
    let resposta: Response;
    try {
      resposta = await fetch(new URL(caminho, GHL_BASE_URL), {
        method: metodo,
        headers: {
          Authorization: `Bearer ${token}`,
          Version: versao,
          Accept: "application/json",
          ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (erro) {
      if (ultima || !idempotente) throw erro;
      await new Promise((r) => setTimeout(r, esperaParaRepetir(null, tentativa)));
      continue;
    }
    if (!ultima && (resposta.status === 429 || (idempotente && resposta.status >= 500))) {
      await new Promise((r) => setTimeout(r, esperaParaRepetir(resposta, tentativa)));
      continue;
    }
    const texto = await resposta.text();
    if (!resposta.ok) throw new Error(`GHL ${resposta.status} em ${metodo} ${caminho}: ${texto.slice(0, 200)}`);
    return (texto ? JSON.parse(texto) : {}) as T;
  }
  throw new Error(`GHL sem resposta em ${metodo} ${caminho}`);
}

interface ContatoGhl {
  id: string;
  nome: string;
  primeiroNome: string;
  telefone: string | null;
  email: string | null;
  campos: Map<string, unknown>;
}

async function lerContato(contactId: string): Promise<ContatoGhl> {
  const { contact } = await ghl<{
    contact?: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      contactName?: string | null;
      name?: string | null;
      phone?: string | null;
      email?: string | null;
      customFields?: Array<{ id: string; value?: unknown }>;
    };
  }>(`/contacts/${contactId}`, "GET", "2021-07-28");
  if (!contact) throw new Error(`contato ${contactId} não encontrado`);
  const nome = (contact.contactName || contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(" ")).trim();
  return {
    id: contact.id,
    nome,
    primeiroNome: primeiroNome(contact.firstName || nome),
    telefone: contact.phone ?? null,
    email: contact.email ?? null,
    campos: new Map((contact.customFields ?? []).map((c) => [c.id, c.value])),
  };
}

async function gravarCampos(contactId: string, campos: Record<string, string | number>): Promise<void> {
  await ghl(`/contacts/${contactId}`, "PUT", "2021-07-28", {
    customFields: Object.entries(campos).map(([id, field_value]) => ({ id, field_value })),
  });
}

async function adicionarTags(contactId: string, tags: string[]): Promise<void> {
  await ghl(`/contacts/${contactId}/tags`, "POST", "2021-07-28", { tags });
}

interface OportunidadeGhl {
  id: string;
  contactId: string | null;
  valor: number | null;
  campos: Map<string, unknown>;
}

async function lerOportunidade(opportunityId: string): Promise<OportunidadeGhl> {
  const { opportunity } = await ghl<{
    opportunity?: {
      id: string;
      contactId?: string | null;
      monetaryValue?: number | null;
      customFields?: Array<Record<string, unknown> & { id: string }>;
    };
  }>(`/opportunities/${opportunityId}`, "GET", "2021-07-28");
  if (!opportunity) throw new Error(`oportunidade ${opportunityId} não encontrada`);
  const valorDoCampo = (c: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(c)) if (k.startsWith("fieldValue") && v != null) return v;
    return c.value ?? null;
  };
  return {
    id: opportunity.id,
    contactId: opportunity.contactId ?? null,
    valor: typeof opportunity.monetaryValue === "number" ? opportunity.monetaryValue : null,
    campos: new Map((opportunity.customFields ?? []).map((c) => [c.id, valorDoCampo(c)])),
  };
}

const texto = (v: unknown) => (v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v)).trim();

let workflowsCache: { em: number; lista: Array<{ id: string; name: string; status?: string }> } | null = null;

/**
 * Inscreve o contato no workflow de mensagem. O GHL aceita a inscrição (201)
 * mesmo em rascunho e não manda nada; por isso confere o status antes.
 */
async function inscreverPorNome(contactId: string, nome: string): Promise<"inscrito" | "rascunho" | "nao_existe"> {
  if (!workflowsCache || Date.now() - workflowsCache.em > 5 * 60 * 1000) {
    const locationId = encodeURIComponent(process.env.GHL_LOCATION_ID ?? "");
    const data = await ghl<{ workflows?: Array<{ id: string; name: string; status?: string }> }>(
      `/workflows/?locationId=${locationId}`,
      "GET",
      "2021-07-28",
    );
    workflowsCache = { em: Date.now(), lista: data.workflows ?? [] };
  }
  const wf = workflowsCache.lista.find((w) => w.name.trim() === nome);
  if (!wf) return "nao_existe";
  if (wf.status !== "published") return "rascunho";
  await ghl(`/contacts/${contactId}/workflow/${wf.id}`, "POST", "2021-07-28", {});
  return "inscrito";
}

function supabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is not configured");
  return createClient(url, getSupabaseSecretKey(), { auth: { autoRefreshToken: false, persistSession: false } });
}

interface LinhaIndicador {
  id: string;
  contact_id: string;
  nome: string | null;
  codigo: string;
  link: string;
  satisfacao: Satisfacao | null;
  satisfacao_em: string | null;
  origem: string;
  criado_em: string;
}

interface LinhaIndicacao {
  id: string;
  indicador_id: string;
  indicado_contact_id: string;
  indicado_nome: string | null;
  origem: string;
  status: StatusIndicacao;
  motivo: string | null;
  oportunidade_id: string | null;
  empresa: string | null;
  cnpj: string | null;
  pares: number | null;
  valor_centavos: number | null;
  forma_pagamento: string | null;
  frete_gratis: boolean;
  premio_centavos: number;
  aviso_chegada_em: string | null;
  fechou_em: string | null;
  liberado_em: string | null;
  pago_em: string | null;
  pago_por: string | null;
  expira_em: string;
  criado_em: string;
}

const hojeBrt = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

async function avisarAmanda(titulo: string, linhas: Array<string | null>): Promise<void> {
  // Testes locais com contatos de teste: não manda WhatsApp para a Amanda.
  if (process.env.HUD_INDICA_SEM_AVISO === "1") {
    console.log("[Hud Indica] aviso para a Amanda (desligado no teste):", titulo, linhas.filter(Boolean).join(" "));
    return;
  }
  try {
    await avisarTime(montarAviso({ titulo, linhas, link: "https://dashboard-hudlab.vercel.app/indica" }), undefined, TAG_AVISOS_POS_VENDA);
  } catch (erro) {
    console.error("[Hud Indica] aviso para a Amanda não enviado", erro);
  }
}

// ---------------------------------------------------------------------------
// 1. Resposta da pesquisa (M0): grava a nota e, em "Nota 10!", cria o link.

export interface ResultadoResposta {
  satisfacao: Satisfacao | null;
  codigo: string | null;
  link: string | null;
}

export async function registrarResposta(contactId: string, resposta: unknown): Promise<ResultadoResposta> {
  const satisfacao = lerSatisfacao(resposta);
  if (!satisfacao) return { satisfacao: null, codigo: null, link: null };
  const contato = await lerContato(contactId);
  const db = supabase();
  const tag = satisfacao === "Nota 10" ? TAGS.nota10 : satisfacao === "Ficou ok" ? TAGS.ficouOk : TAGS.problema;

  let codigo: string | null = null;
  let link: string | null = null;
  const { data: existente, error: erroLeitura } = await db
    .from("hud_indica_indicadores")
    .select("id, codigo, link")
    .eq("contact_id", contactId)
    .maybeSingle();
  if (erroLeitura) throw new Error(`hud_indica_indicadores: ${erroLeitura.message}`);

  if (existente) {
    codigo = existente.codigo;
    link = existente.link;
    await db
      .from("hud_indica_indicadores")
      .update({ satisfacao, satisfacao_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
      .eq("id", existente.id);
  } else if (satisfacao === "Nota 10") {
    for (let tentativa = 0; tentativa < 6 && !codigo; tentativa++) {
      const candidato = gerarCodigo(contato.primeiroNome || contato.nome);
      const { error } = await db.from("hud_indica_indicadores").insert({
        contact_id: contactId,
        nome: contato.nome || null,
        codigo: candidato,
        link: linkDoCodigo(candidato),
        satisfacao,
        satisfacao_em: new Date().toISOString(),
      });
      if (!error) codigo = candidato;
      else if (error.code !== "23505") throw new Error(`hud_indica_indicadores: ${error.message}`);
    }
    if (!codigo) throw new Error("não consegui gerar um código único");
    link = linkDoCodigo(codigo);
  }

  const campos: Record<string, string> = { [CAMPOS.contato.satisfacao]: satisfacao, [CAMPOS.contato.satisfacaoData]: hojeBrt() };
  if (codigo && link) {
    campos[CAMPOS.contato.codigo] = codigo;
    campos[CAMPOS.contato.link] = link;
  }
  await gravarCampos(contactId, campos);
  await adicionarTags(contactId, codigo && satisfacao === "Nota 10" ? [tag, TAGS.indicador] : [tag]);
  return { satisfacao, codigo, link };
}

// ---------------------------------------------------------------------------
// 2. Chegada do indicado: lê o código do campo "Afiliado", valida e registra.

export interface ResultadoChegada {
  registrada: boolean;
  valida: boolean;
  motivo: string | null;
  indicador: string | null;
  avisoM3b: "inscrito" | "rascunho" | "nao_existe" | "nao_enviado" | null;
}

/** Pedido ganho no contato ou em outro contato com o mesmo telefone ou e-mail (base sincronizada). */
async function jaComprou(db: SupabaseClient, contato: ContatoGhl): Promise<boolean> {
  const ids = new Set<string>([contato.id]);
  const filtros: string[] = [];
  if (contato.telefone) filtros.push(`phone.eq.${contato.telefone}`);
  if (contato.email) filtros.push(`email.eq.${contato.email.toLowerCase()}`);
  if (filtros.length > 0) {
    const { data } = await db.from("ghl_contacts").select("id").or(filtros.join(",")).limit(20);
    for (const c of (data ?? []) as Array<{ id: string }>) ids.add(c.id);
  }
  const { data: ganhos, error } = await db
    .from("ghl_opportunities")
    .select("id")
    .in("contact_id", [...ids])
    .eq("status", "won")
    .limit(1);
  if (error) throw new Error(`ghl_opportunities: ${error.message}`);
  return (ganhos ?? []).length > 0;
}

export async function registrarChegada(contactId: string): Promise<ResultadoChegada> {
  const db = supabase();
  const vazio = { registrada: false, valida: false, indicador: null, avisoM3b: null };
  const { data: jaExiste } = await db
    .from("hud_indica_indicacoes")
    .select("status, motivo, indicador_id")
    .eq("indicado_contact_id", contactId)
    .maybeSingle();
  if (jaExiste) {
    return { ...vazio, registrada: true, valida: jaExiste.status !== "invalida", motivo: "Indicação já registrada." };
  }

  const indicado = await lerContato(contactId);
  const codigo = normalizarCodigo(indicado.campos.get(CAMPOS.contato.afiliado));
  if (!codigo) return { ...vazio, motivo: "Sem código de indicação no campo Afiliado." };

  const { data: indicador } = await db
    .from("hud_indica_indicadores")
    .select("id, contact_id, nome")
    .eq("codigo", codigo)
    .maybeSingle();
  if (!indicador) return { ...vazio, motivo: `Código ${codigo} não pertence a nenhum indicador.` };

  const contatoIndicador = await lerContato(indicador.contact_id);
  const avaliacao = avaliarChegada({
    indicador: { contactId: contatoIndicador.id, telefone: contatoIndicador.telefone, email: contatoIndicador.email },
    indicado: { contactId: indicado.id, telefone: indicado.telefone, email: indicado.email },
    indicadoJaComprou: await jaComprou(db, indicado),
  });

  const { error } = await db.from("hud_indica_indicacoes").insert({
    indicador_id: indicador.id,
    indicado_contact_id: contactId,
    indicado_nome: indicado.nome || null,
    origem: "link",
    status: avaliacao.valida ? "recebida" : "invalida",
    motivo: avaliacao.motivo,
  });
  if (error && error.code === "23505") return { ...vazio, registrada: true, valida: true, motivo: "Indicação já registrada." };
  if (error) throw new Error(`hud_indica_indicacoes: ${error.message}`);

  const nomeIndicador = contatoIndicador.nome || indicador.nome || "";
  if (!avaliacao.valida) {
    await avisarAmanda("Indicação não validada no Hud Indica", [
      `${indicado.nome || "Um lead"} chegou pelo link de ${nomeIndicador}.`,
      `Motivo: ${avaliacao.motivo}`,
    ]);
    return { registrada: true, valida: false, motivo: avaliacao.motivo, indicador: nomeIndicador, avisoM3b: null };
  }

  await gravarCampos(contactId, { [CAMPOS.contato.indicadoPor]: nomeIndicador, [CAMPOS.contato.indicadoPorId]: indicador.contact_id });
  await adicionarTags(contactId, [TAGS.indicado]);

  const { count } = await db
    .from("hud_indica_indicacoes")
    .select("id", { count: "exact", head: true })
    .eq("indicador_id", indicador.id)
    .neq("status", "invalida");
  await gravarCampos(indicador.contact_id, {
    [CAMPOS.contato.ultimoIndicado]: indicado.primeiroNome || "Um cliente",
    [CAMPOS.contato.indicacoes]: count ?? 1,
  });

  let avisoM3b: ResultadoChegada["avisoM3b"] = "nao_enviado";
  try {
    avisoM3b = await inscreverPorNome(indicador.contact_id, WORKFLOWS.avisoChegada);
    if (avisoM3b === "inscrito") {
      await db.from("hud_indica_indicacoes").update({ aviso_chegada_em: new Date().toISOString() }).eq("indicado_contact_id", contactId);
    }
  } catch (erro) {
    console.error("[Hud Indica] M3b não enviada", { contactId, erro });
  }
  return { registrada: true, valida: true, motivo: null, indicador: nomeIndicador, avisoM3b };
}

// ---------------------------------------------------------------------------
// 3. Fechamento: o card do indicado entrou em Cadastro ERP.

export interface ResultadoFechamento {
  status: StatusIndicacao | null;
  motivo: string | null;
  avisoM4: "inscrito" | "rascunho" | "nao_existe" | "nao_enviado" | null;
}

export async function registrarFechamento(contactId: string, opportunityId: string | null): Promise<ResultadoFechamento> {
  const db = supabase();
  const { data: linha } = await db
    .from("hud_indica_indicacoes")
    .select("*")
    .eq("indicado_contact_id", contactId)
    .maybeSingle<LinhaIndicacao>();
  if (!linha) return { status: null, motivo: "Contato sem indicação registrada.", avisoM4: null };
  if (linha.status !== "recebida") return { status: linha.status, motivo: "A indicação já passou do fechamento.", avisoM4: null };

  const { data: indicador } = await db
    .from("hud_indica_indicadores")
    .select("contact_id, nome")
    .eq("id", linha.indicador_id)
    .single<{ contact_id: string; nome: string | null }>();
  if (!indicador) throw new Error("indicador da indicação não encontrado");

  const [indicado, contatoIndicador, oportunidade] = await Promise.all([
    lerContato(contactId),
    lerContato(indicador.contact_id),
    opportunityId ? lerOportunidade(opportunityId) : Promise.resolve(null),
  ]);
  const campoOp = (id: string) => texto(oportunidade?.campos.get(id));
  const documento = campoOp(CAMPOS.oportunidade.cnpj) || campoOp(CAMPOS.oportunidade.cpf) ||
    texto(indicado.campos.get(CAMPOS.contato.cnpj)) || texto(indicado.campos.get(CAMPOS.contato.cpf));
  const forma = campoOp(CAMPOS.oportunidade.formaDePagamento);
  const avaliacao = avaliarFechamento({
    status: linha.status,
    expiraEmMs: Date.parse(linha.expira_em),
    agoraMs: Date.now(),
    documentoIndicado: documento,
    documentosIndicador: [texto(contatoIndicador.campos.get(CAMPOS.contato.cnpj)), texto(contatoIndicador.campos.get(CAMPOS.contato.cpf))],
    formaDePagamento: forma,
  });

  const empresa = campoOp(CAMPOS.oportunidade.razaoSocial) || texto(indicado.campos.get(CAMPOS.contato.razaoSocial)) ||
    texto(indicado.campos.get(CAMPOS.contato.empresa)) || indicado.nome;
  const pares = Number(campoOp(CAMPOS.oportunidade.pares));
  const agora = new Date().toISOString();
  await db
    .from("hud_indica_indicacoes")
    .update({
      status: avaliacao.status,
      motivo: avaliacao.motivo,
      oportunidade_id: opportunityId,
      empresa: empresa || null,
      cnpj: documento || null,
      pares: Number.isFinite(pares) && pares > 0 ? Math.round(pares) : null,
      valor_centavos: oportunidade?.valor != null ? Math.round(oportunidade.valor * 100) : null,
      forma_pagamento: forma || null,
      fechou_em: avaliacao.status === "fechou" || avaliacao.status === "liberada" ? agora : null,
      liberado_em: avaliacao.status === "liberada" ? agora : null,
      atualizado_em: agora,
    })
    .eq("id", linha.id);

  const nomeIndicador = contatoIndicador.nome || indicador.nome || "";
  if (avaliacao.status !== "fechou" && avaliacao.status !== "liberada") {
    await avisarAmanda("Indicação não vale prêmio no Hud Indica", [`${empresa} fechou, indicada por ${nomeIndicador}.`, `Motivo: ${avaliacao.motivo}`]);
    return { status: avaliacao.status, motivo: avaliacao.motivo, avisoM4: null };
  }

  await gravarCampos(indicador.contact_id, { [CAMPOS.contato.ultimaEmpresa]: empresa || "a empresa indicada" });
  let avisoM4: ResultadoFechamento["avisoM4"] = "nao_enviado";
  try {
    avisoM4 = await inscreverPorNome(indicador.contact_id, WORKFLOWS.indicadoFechou);
  } catch (erro) {
    console.error("[Hud Indica] M4 não enviada", { contactId, erro });
  }
  if (avaliacao.status === "liberada") {
    await avisarAmanda("Pix do Hud Indica liberado", [
      `${empresa} fechou (${forma}), indicada por ${nomeIndicador}.`,
      "R$ 100 para pagar: a chave Pix chega na conversa de quem indicou (M4).",
    ]);
  }
  return { status: avaliacao.status, motivo: null, avisoM4 };
}

// ---------------------------------------------------------------------------
// 4. Pagamento integral (Pix 50/50 e boleto): o card passou por
// "Aprovar Financeiro Pedido Total".

export async function registrarPagamentoIntegral(contactId: string): Promise<{ status: StatusIndicacao | null; motivo: string | null }> {
  const db = supabase();
  const { data: linha } = await db
    .from("hud_indica_indicacoes")
    .select("id, status, empresa, indicador_id")
    .eq("indicado_contact_id", contactId)
    .maybeSingle<{ id: string; status: StatusIndicacao; empresa: string | null; indicador_id: string }>();
  if (!linha) return { status: null, motivo: "Contato sem indicação registrada." };
  if (linha.status !== "fechou") return { status: linha.status, motivo: "A indicação não estava aguardando o pagamento integral." };
  const agora = new Date().toISOString();
  await db.from("hud_indica_indicacoes").update({ status: "liberada", liberado_em: agora, atualizado_em: agora }).eq("id", linha.id);
  const { data: indicador } = await db.from("hud_indica_indicadores").select("nome").eq("id", linha.indicador_id).maybeSingle();
  await avisarAmanda("Pix do Hud Indica liberado", [
    `${linha.empresa ?? "O pedido indicado"} foi pago por completo, indicado por ${indicador?.nome ?? "um cliente"}.`,
    "R$ 100 para pagar na página do Hud Indica.",
  ]);
  return { status: "liberada", motivo: null };
}

// ---------------------------------------------------------------------------
// 5. Ações da página /indica.

export class ErroHudIndica extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function marcarPixPago(indicacaoId: string, userId: string): Promise<{ avisoM5: string }> {
  const db = supabase();
  const { data: linha } = await db
    .from("hud_indica_indicacoes")
    .select("id, status, indicador_id")
    .eq("id", indicacaoId)
    .maybeSingle<{ id: string; status: StatusIndicacao; indicador_id: string }>();
  if (!linha) throw new ErroHudIndica("Indicação não encontrada", 404);
  if (linha.status !== "liberada") throw new ErroHudIndica("Só dá para marcar como pago um Pix liberado", 409);
  const agora = new Date().toISOString();
  const { error } = await db
    .from("hud_indica_indicacoes")
    .update({ status: "paga", pago_em: agora, pago_por: userId, atualizado_em: agora })
    .eq("id", linha.id)
    .eq("status", "liberada");
  if (error) throw new Error(`hud_indica_indicacoes: ${error.message}`);
  const { data: indicador } = await db.from("hud_indica_indicadores").select("contact_id").eq("id", linha.indicador_id).single();
  let avisoM5 = "nao_enviado";
  try {
    if (indicador) avisoM5 = await inscreverPorNome(indicador.contact_id, WORKFLOWS.pixEnviado);
  } catch (erro) {
    console.error("[Hud Indica] M5 não enviada", { indicacaoId, erro });
  }
  return { avisoM5 };
}

export async function cancelarIndicacao(indicacaoId: string, motivo: string): Promise<void> {
  const db = supabase();
  const { data: linha } = await db.from("hud_indica_indicacoes").select("status").eq("id", indicacaoId).maybeSingle();
  if (!linha) throw new ErroHudIndica("Indicação não encontrada", 404);
  if (linha.status === "paga") throw new ErroHudIndica("Pix já pago: não dá para cancelar", 409);
  await db
    .from("hud_indica_indicacoes")
    .update({ status: "cancelada", motivo: motivo.trim() || "Cancelada pela Amanda.", atualizado_em: new Date().toISOString() })
    .eq("id", indicacaoId);
}

// ---------------------------------------------------------------------------
// 6. Dados da página /indica.

export interface IndicacaoDoPainel {
  id: string;
  status: StatusIndicacao;
  motivo: string | null;
  indicado: string | null;
  empresa: string | null;
  pares: number | null;
  valorCentavos: number | null;
  formaDePagamento: string | null;
  indicador: string | null;
  indicadorContato: string | null;
  chavePix: string | null;
  criadoEm: string;
  fechouEm: string | null;
  liberadoEm: string | null;
  pagoEm: string | null;
  expiraEm: string;
}

export interface IndicadorDoPainel {
  nome: string | null;
  codigo: string;
  link: string;
  satisfacao: Satisfacao | null;
  criadoEm: string;
  indicacoes: number;
}

export interface PainelHudIndica {
  numeros: NumerosDoPrograma;
  pedidosDoMes: number;
  indicadosDoMes: number;
  pctVendasPorIndicacao: number | null;
  indicacoes: IndicacaoDoPainel[];
  indicadores: IndicadorDoPainel[];
  podeAdministrar: boolean;
}

export async function carregarPainel(podeAdministrar: boolean): Promise<PainelHudIndica> {
  const db = supabase();
  const [{ data: indicadores, error: e1 }, { data: indicacoes, error: e2 }] = await Promise.all([
    db.from("hud_indica_indicadores").select("*").order("criado_em", { ascending: false }).limit(1000),
    db.from("hud_indica_indicacoes").select("*").order("criado_em", { ascending: false }).limit(1000),
  ]);
  if (e1 || e2) throw new Error(`Hud Indica: ${(e1 ?? e2)?.message}`);
  const listaIndicadores = (indicadores ?? []) as LinhaIndicador[];
  const listaIndicacoes = (indicacoes ?? []) as LinhaIndicacao[];
  const porId = new Map(listaIndicadores.map((i) => [i.id, i]));

  // Chave Pix só para quem administra, e só dos Pix liberados (lida na hora, do contato no GHL).
  const chaves = new Map<string, string | null>();
  if (podeAdministrar) {
    for (const i of listaIndicacoes.filter((x) => x.status === "liberada")) {
      const contato = porId.get(i.indicador_id)?.contact_id;
      if (!contato || chaves.has(contato)) continue;
      try {
        chaves.set(contato, texto((await lerContato(contato)).campos.get(CAMPOS.contato.chavePix)) || null);
      } catch {
        chaves.set(contato, null);
      }
    }
  }

  const inicioDoMes = `${hojeBrt().slice(0, 7)}-01`;
  const { count: pedidosDoMes } = await db
    .from("deals_cache")
    .select("deal_id", { count: "exact", head: true })
    .eq("source_system", "ghl")
    .eq("status", "won")
    .gte("closing_date", inicioDoMes);
  const indicadosDoMes = listaIndicacoes.filter(
    (i) => i.fechou_em && i.fechou_em.slice(0, 10) >= inicioDoMes && (i.status === "fechou" || i.status === "liberada" || i.status === "paga"),
  ).length;

  const contagem = new Map<string, number>();
  for (const i of listaIndicacoes) if (i.status !== "invalida") contagem.set(i.indicador_id, (contagem.get(i.indicador_id) ?? 0) + 1);

  return {
    numeros: numerosDoPrograma(listaIndicadores.length, listaIndicacoes as IndicacaoResumo[]),
    pedidosDoMes: pedidosDoMes ?? 0,
    indicadosDoMes,
    pctVendasPorIndicacao: pedidosDoMes ? Math.round((1000 * indicadosDoMes) / pedidosDoMes) / 10 : null,
    indicacoes: listaIndicacoes.map((i) => {
      const ind = porId.get(i.indicador_id);
      return {
        id: i.id,
        status: i.status,
        motivo: i.motivo,
        indicado: i.indicado_nome,
        empresa: i.empresa,
        pares: i.pares,
        valorCentavos: i.valor_centavos,
        formaDePagamento: i.forma_pagamento,
        indicador: ind?.nome ?? null,
        indicadorContato: podeAdministrar ? (ind?.contact_id ?? null) : null,
        chavePix: ind ? (chaves.get(ind.contact_id) ?? null) : null,
        criadoEm: i.criado_em,
        fechouEm: i.fechou_em,
        liberadoEm: i.liberado_em,
        pagoEm: i.pago_em,
        expiraEm: i.expira_em,
      };
    }),
    indicadores: listaIndicadores.map((i) => ({
      nome: i.nome,
      codigo: i.codigo,
      link: i.link,
      satisfacao: i.satisfacao,
      criadoEm: i.criado_em,
      indicacoes: contagem.get(i.id) ?? 0,
    })),
    podeAdministrar,
  };
}
