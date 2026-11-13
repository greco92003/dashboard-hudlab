import "server-only";

import { aguardarVagaGhl, esperaParaRepetir, TENTATIVAS_LEITURA_GHL } from "@/lib/ghl/rate-limit";

// Escritas do painel de fechamento no GHL: tarefa de follow-up, nota, status e
// inscrição no workflow do modelo. Passa pela fila de rajada (lib/ghl/rate-limit).

const GHL_BASE_URL = process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
const VERSAO = "2021-07-28";

type Metodo = "GET" | "POST" | "PUT" | "DELETE";

/**
 * 429 nunca foi processado, então repete em qualquer método. 5xx e falta de
 * resposta só repetem no que é idempotente (POST pode ter sido gravado).
 */
async function ghl<T>(caminho: string, metodo: Metodo, corpo?: unknown): Promise<T> {
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
          Version: VERSAO,
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

export interface TarefaDeFollowUp {
  titulo: string;
  corpo: string;
  prazoEm: number;
  responsavel: string | null;
}

/** Cria a tarefa e devolve o id. */
export async function criarTarefa(contatoId: string, t: TarefaDeFollowUp): Promise<string> {
  const data = await ghl<{ task?: { id: string } }>(`/contacts/${contatoId}/tasks`, "POST", {
    title: t.titulo,
    body: t.corpo,
    dueDate: new Date(t.prazoEm).toISOString(),
    completed: false,
    ...(t.responsavel ? { assignedTo: t.responsavel } : {}),
  });
  if (!data.task?.id) throw new Error("GHL não devolveu o id da tarefa");
  return data.task.id;
}

export async function atualizarTarefa(contatoId: string, tarefaId: string, t: TarefaDeFollowUp): Promise<void> {
  await ghl(`/contacts/${contatoId}/tasks/${tarefaId}`, "PUT", {
    title: t.titulo,
    body: t.corpo,
    dueDate: new Date(t.prazoEm).toISOString(),
    completed: false,
    ...(t.responsavel ? { assignedTo: t.responsavel } : {}),
  });
}

/** A tarefa como está no GHL: null se foi apagada. */
export async function lerTarefa(contatoId: string, tarefaId: string): Promise<{ completed: boolean } | null> {
  try {
    const data = await ghl<{ task?: { completed?: boolean } }>(`/contacts/${contatoId}/tasks/${tarefaId}`, "GET");
    return data.task ? { completed: Boolean(data.task.completed) } : null;
  } catch (erro) {
    if (erro instanceof Error && /GHL (400|404)/.test(erro.message)) return null;
    throw erro;
  }
}

export async function concluirTarefa(contatoId: string, tarefaId: string): Promise<void> {
  await ghl(`/contacts/${contatoId}/tasks/${tarefaId}/completed`, "PUT", { completed: true });
}

export async function adicionarNota(contatoId: string, texto: string): Promise<void> {
  await ghl(`/contacts/${contatoId}/notes`, "POST", { body: texto });
}

export async function marcarPerdida(oportunidadeId: string): Promise<void> {
  await ghl(`/opportunities/${oportunidadeId}`, "PUT", { status: "lost" });
}

export async function moverEtapa(oportunidadeId: string, pipelineId: string, etapaId: string): Promise<void> {
  await ghl(`/opportunities/${oportunidadeId}`, "PUT", { pipelineId, pipelineStageId: etapaId, status: "open" });
}

/** O GHL aceita a inscrição (201) mesmo com o workflow em rascunho e não manda nada; confere antes. */
export async function workflowPublicado(workflowId: string): Promise<boolean> {
  const locationId = encodeURIComponent(process.env.GHL_LOCATION_ID ?? "");
  const data = await ghl<{ workflows?: Array<{ id: string; status?: string }> }>(
    `/workflows/?locationId=${locationId}`,
    "GET",
  );
  return data.workflows?.find((w) => w.id === workflowId)?.status === "published";
}

export async function inscreverNoWorkflow(contatoId: string, workflowId: string): Promise<void> {
  await ghl(`/contacts/${contatoId}/workflow/${workflowId}`, "POST", {});
}
