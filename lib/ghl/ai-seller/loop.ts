import type { EscalationReason, FunctionCall, ToolExecution } from "./types";

export interface ModelTurn {
  /** response.output do modelo, devolvido como entrada no passo seguinte. */
  outputItems: unknown[];
  functionCalls: FunctionCall[];
  usage: { input_tokens: number; output_tokens: number } | null;
}

export type CallModel = (input: unknown[]) => Promise<ModelTurn>;
export type ExecuteTool = (call: FunctionCall) => Promise<ToolExecution>;

export interface LoopResult {
  decision: NonNullable<ToolExecution["decision"]> | "erro";
  escalationReason: EscalationReason | null;
  sentMessageIds: string[];
  toolCalls: Array<{ name: string; arguments: string; output: string }>;
  usage: { input_tokens: number; output_tokens: number };
  error: string | null;
}

// Ferramentas que podem rodar duas vezes sem efeito visível para o cliente.
// Envio e escalonamento ficam de fora: repetir mandaria mensagem duplicada.
const RETRYABLE_TOOLS = new Set([
  "atualizar_orcamento",
  "solicitar_ajuste_arte",
  "mover_etapa",
  "nao_responder",
]);

async function retryOnce<T>(fn: () => Promise<T>, canRetry: () => boolean = () => true): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!canRetry()) throw err;
    return await fn();
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

class DeadlineExceeded extends Error {}

export async function runAgentLoop(opts: {
  initialInput: unknown[];
  callModel: CallModel;
  executeTool: ExecuteTool;
  maxSteps: number;
  /** Instante (em ms, no relógio de `now`) a partir do qual nenhum passo novo começa. */
  deadlineMs?: number;
  now?: () => number;
}): Promise<LoopResult> {
  const input = [...opts.initialInput];
  const toolCalls: LoopResult["toolCalls"] = [];
  const sentMessageIds: string[] = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  const now = opts.now ?? Date.now;
  const withinDeadline = () => opts.deadlineMs == null || now() < opts.deadlineMs;
  const fail = (error: string): LoopResult => ({
    decision: "erro",
    escalationReason: null,
    sentMessageIds,
    toolCalls,
    usage,
    error,
  });

  // Toda chamada ao modelo, inclusive a repetição, só começa dentro do prazo:
  // o que sobra dele é o tempo de escalar para humano.
  const callModel = async (): Promise<ModelTurn> => {
    if (!withinDeadline()) throw new DeadlineExceeded();
    const turn = await retryOnce(() => opts.callModel(input), withinDeadline);
    if (turn.usage) {
      usage.input_tokens += turn.usage.input_tokens;
      usage.output_tokens += turn.usage.output_tokens;
    }
    return turn;
  };

  for (let step = 0; step < opts.maxSteps; step++) {
    let turn: ModelTurn;
    try {
      turn = await callModel();
      // Turno só com texto (sem ferramenta) é raro com tool_choice "required";
      // mais uma tentativa costuma resolver.
      if (turn.functionCalls.length === 0) turn = await callModel();
    } catch (err) {
      if (err instanceof DeadlineExceeded || !withinDeadline()) return fail("tempo esgotado");
      return fail(`modelo: ${describe(err)}`);
    }
    if (turn.functionCalls.length === 0) {
      return fail("modelo respondeu sem chamar ferramenta");
    }
    input.push(...turn.outputItems);

    for (const call of turn.functionCalls) {
      let execution: ToolExecution;
      try {
        execution = RETRYABLE_TOOLS.has(call.name)
          ? await retryOnce(() => opts.executeTool(call))
          : await opts.executeTool(call);
      } catch (err) {
        return fail(`ferramenta ${call.name}: ${describe(err)}`);
      }
      toolCalls.push({ name: call.name, arguments: call.arguments, output: execution.output });
      sentMessageIds.push(...execution.sentMessageIds);
      input.push({ type: "function_call_output", call_id: call.call_id, output: execution.output });
      if (execution.terminal) {
        return {
          decision: execution.decision ?? "respondeu",
          escalationReason: execution.escalationReason ?? null,
          sentMessageIds,
          toolCalls,
          usage,
          error: null,
        };
      }
    }
  }
  return fail(`${opts.maxSteps} passos sem ação final`);
}
