import type { AiMovableStage, ModelEscalationReason } from "./config";

export type EscalationReason =
  | ModelEscalationReason
  | "falha_tecnica"
  | "limite_mensagens";

export type RunDecision =
  | "respondeu"
  | "nao_respondeu"
  | "escalou"
  | "humano_assumiu"
  | "pulou:sem_tag"
  | "pulou:agrupando"
  | "pulou:ja_respondido"
  | "pulou:limite"
  | "erro";

export interface FunctionCall {
  call_id: string;
  name: string;
  arguments: string;
}

export interface ToolExecution {
  /** Texto devolvido ao modelo como function_call_output. */
  output: string;
  /** true encerra a rodada (enviar_mensagens, nao_responder, escalar_para_humano). */
  terminal: boolean;
  sentMessageIds: string[];
  decision?: "respondeu" | "nao_respondeu" | "escalou";
  escalationReason?: EscalationReason;
}

export interface BudgetWrite {
  pares: number;
  unitario: number;
  subtotal: number;
  /** null = frete ainda desconhecido (falta CEP); os campos de frete não são tocados. */
  frete: number | null;
}

/** Efeitos colaterais de uma rodada, já presos ao contato e à oportunidade. */
export interface SellerActions {
  sendMessages(messages: string[]): Promise<string[]>;
  escalate(input: {
    motivo: EscalationReason;
    resumo: string;
    mensagemCliente: string;
  }): Promise<string[]>;
  quoteFreight(input: {
    cep: string;
    pares: number;
    valorNf: number;
  }): Promise<number | null>;
  writeBudget(input: BudgetWrite): Promise<void>;
  requestArtChange(resumo: string): Promise<"movido" | "ja_em_alteracao">;
  moveStage(
    etapa: AiMovableStage,
  ): Promise<"movido" | "sem_mudanca" | "fora_do_atendimento">;
}
