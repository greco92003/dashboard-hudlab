import type { AiMovableStage, ModelEscalationReason } from "./config";

export type EscalationReason =
  | ModelEscalationReason
  | "falha_tecnica"
  | "limite_mensagens"
  | "sem_oportunidade";

export type RunDecision =
  | "respondeu"
  | "nao_respondeu"
  | "escalou"
  | "humano_assumiu"
  | "pulou:sem_tag"
  | "pulou:ja_respondido"
  | "pulou:limite"
  /** Outra rodada do mesmo contato está em andamento (trava no banco). */
  | "pulou:em_andamento"
  /** O cliente escreveu de novo antes do envio; a chamada da mensagem nova responde tudo. */
  | "pulou:mensagem_nova"
  /** Linha da trava enquanto a rodada roda; a gravação final a substitui. */
  | "rodando"
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
  decision?: "respondeu" | "nao_respondeu" | "escalou" | "pulou:mensagem_nova";
  escalationReason?: EscalationReason;
}

export interface BudgetWrite {
  pares: number;
  unitario: number;
  subtotal: number;
  /** null = frete ainda desconhecido (falta CEP ou sem cotação); frete e total do contato são limpos. */
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
  /** true se o cliente mandou mensagem depois do retrato da conversa que a rodada leu. */
  hasNewClientMessage(): Promise<boolean>;
}
