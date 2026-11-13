import "server-only";

import { loadSellerSettings } from "@/lib/ghl/ai-seller/settings";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { estadoDaLinha, type LinhaDoCard } from "./linha";
import { quandoTexto, rotuloDaSituacao, situacaoDoCard, type Cor } from "./regras";

export interface CardDoPainel {
  oportunidadeId: string;
  contatoId: string;
  nome: string;
  etapa: string;
  pares: number | null;
  valor: number | null;
  cor: Cor;
  ultimaChance: boolean;
  rotulo: string;
  prazoEm: string | null;
  janelaAberta: boolean;
  janelaTexto: string | null;
  ultimaMensagemCliente: string | null;
  combinado: string | null;
  pendencia: string | null;
  sinal: string | null;
  linkConversa: string | null;
}

export interface Painel {
  cards: CardDoPainel[];
  contagem: Record<Cor, number>;
  valorEmFechamento: number;
  atualizadoEm: string | null;
}

/** Os cards ativos com a cor e o prazo de agora (calculados na leitura, não na rotina). */
export async function carregarPainel(): Promise<Painel> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase.from("fechamento_cards").select("*").eq("ativo", true);
  if (error) throw new Error(`fechamento_cards: ${error.message}`);
  const { shifts } = await loadSellerSettings();
  const agora = Date.now();
  const location = process.env.GHL_LOCATION_ID ?? "";

  const lista = (data as LinhaDoCard[]).map((l) => {
    const s = situacaoDoCard(estadoDaLinha(l), agora, shifts);
    const card: CardDoPainel = {
      oportunidadeId: l.opportunity_id,
      contatoId: l.contact_id,
      nome: l.contact_name ?? "Cliente",
      etapa: l.stage_name,
      pares: l.qty_pares,
      valor: l.monetary_value == null ? null : Number(l.monetary_value),
      cor: s.cor,
      ultimaChance: s.ultimaChance,
      rotulo: rotuloDaSituacao(s, agora),
      prazoEm: s.prazoEm ? new Date(s.prazoEm).toISOString() : null,
      janelaAberta: s.janelaAberta,
      janelaTexto: s.janelaFechaEm
        ? s.janelaAberta
          ? `janela fecha ${quandoTexto(s.janelaFechaEm, agora)}`
          : "janela fechada"
        : "cliente nunca escreveu",
      ultimaMensagemCliente: l.ultima_cliente_texto,
      combinado: l.combinado,
      pendencia: l.pendencia,
      sinal: l.sinal,
      linkConversa: l.conversation_id
        ? `https://app.gohighlevel.com/v2/location/${location}/conversations/conversations/${l.conversation_id}`
        : null,
    };
    return { card, ordem: s.ordem };
  });
  lista.sort((a, b) => a.ordem - b.ordem);

  const contagem: Record<Cor, number> = { vermelho: 0, laranja: 0, amarelo: 0, verde: 0, cinza: 0, cami: 0 };
  let valorEmFechamento = 0;
  for (const { card } of lista) {
    contagem[card.cor]++;
    valorEmFechamento += card.valor ?? 0;
  }
  const atualizadoEm = (data as LinhaDoCard[]).reduce<string | null>(
    (max, l) => (!max || l.atualizado_em > max ? l.atualizado_em : max),
    null,
  );
  return { cards: lista.map((x) => x.card), contagem, valorEmFechamento, atualizadoEm };
}
