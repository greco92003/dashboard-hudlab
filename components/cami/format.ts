// Textos e formatos da CAMI Intelligence. Tudo que é "sem dado" vira "—".

export const GHL_LOCATION_ID = "dhz2q752HHI3xw2jHkrv";

export const ghlContactUrl = (contactId: string) =>
  `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${contactId}`;

export const SITUACAO_LABEL: Record<string, string> = {
  atendendo: "Cami atendendo",
  esperando_cliente: "Esperando o cliente",
  passou: "Passou para humano",
  humano_assumiu: "Time assumiu",
  ganhou: "Ganhou",
  perdeu: "Perdeu",
};

export const SITUACAO_CLASS: Record<string, string> = {
  atendendo: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  esperando_cliente: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  passou: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  humano_assumiu: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  ganhou: "bg-green-600/20 text-green-700 dark:text-green-300 border-green-600/40",
  perdeu: "bg-muted text-muted-foreground border-border",
};

export const SIGNAL_LABEL: Record<string, string> = {
  sumiu: "Cliente sumiu",
  pediu_pessoa_ou_reclamou: "Pediu pessoa ou reclamou",
  passagem_sem_resposta: "Passagem sem resposta",
  resposta_lenta: "Resposta lenta",
  falha: "Falha técnica",
};

export const MOTIVO_LABEL: Record<string, string> = {
  pronto_para_pagar: "Pronto para pagar",
  desconto_ou_excecao: "Desconto ou exceção",
  reclamacao: "Reclamação",
  cliente_pediu_pessoa: "Pediu uma pessoa",
  pedido_grande: "Pedido grande",
  outro: "Outro",
  falha_tecnica: "Falha técnica",
  limite_mensagens: "Limite de mensagens",
  sem_oportunidade: "Sem oportunidade aberta",
  cami_desligada: "Cami desligada",
};

export const FORA_LABEL: Record<string, string> = {
  cami_pausada: "Cami pausada",
  ja_com_a_ia: "Já estava com a Cami",
  ja_passou_para_humano: "Já foi passado para humano antes",
  sem_oportunidade: "Sem oportunidade aberta",
  fora_do_atendimento: "Fora do pipeline Atendimento",
  fora_da_faixa_de_pares: "Fora da faixa de pares",
  time_ja_conversando: "Time já conversando",
};

export const DECISION_LABEL: Record<string, string> = {
  respondeu: "Respondeu",
  nao_respondeu: "Não precisou responder",
  escalou: "Passou para humano",
  humano_assumiu: "Time assumiu",
  erro: "Erro",
  "pulou:sem_tag": "Fora da Cami",
  "pulou:ja_respondido": "Já respondido",
  "pulou:limite": "Limite atingido",
  "pulou:em_andamento": "Outra rodada em andamento",
  "pulou:mensagem_nova": "Cliente escreveu de novo",
  "pulou:aguardando_cliente": "Esperou o cliente terminar",
  "pulou:desligada": "Cami desligada",
};

export const ESTADO_LABEL: Record<string, string> = {
  ligada: "Ligada",
  nao_pega_novos: "Não pega clientes novos",
  desligada: "Desligada",
};

export const label = (map: Record<string, string>, key: string | null | undefined) =>
  key ? map[key] ?? key : "—";

export const fmtPct = (pct: number | null | undefined) =>
  pct == null ? "—" : `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));

export const fmtMoney = (value: number | null | undefined, digits = 0) =>
  value == null
    ? "—"
    : value.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

/** 42 s · 3 min · 1h20 · 2 dias */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = minutes % 60;
    return rest && hours < 10 ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
  }
  return `${Math.round(hours / 24)} dias`;
}

export const fmtAgo = (iso: string | null | undefined) =>
  iso ? `há ${fmtDuration((Date.now() - Date.parse(iso)) / 1000)}` : "—";

export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
