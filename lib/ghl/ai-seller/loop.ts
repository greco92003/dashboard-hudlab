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
  decision: "respondeu" | "nao_respondeu" | "escalou" | "erro";
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

async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runAgentLoop(opts: {
  initialInput: unknown[];
  callModel: CallModel;
  executeTool: ExecuteTool;
  maxSteps: number;
}): Promise<LoopResult> {
  const input = [...opts.initialInput];
  const toolCalls: LoopResult["toolCalls"] = [];
  const sentMessageIds: string[] = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  const fail = (error: string): LoopResult => ({
    decision: "erro",
    escalationReason: null,
    sentMessageIds,
    toolCalls,
    usage,
    error,
  });

  for (let step = 0; step < opts.maxSteps; step++) {
    let turn: ModelTurn;
    try {
      turn = await retryOnce(() => opts.callModel(input));
    } catch (err) {
      return fail(`modelo: ${describe(err)}`);
    }
    if (turn.usage) {
      usage.input_tokens += turn.usage.input_tokens;
      usage.output_tokens += turn.usage.output_tokens;
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
