import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateOrderDocument } from "@/lib/erp/order-document-response";
import { findTinyOrderIdByDeal } from "@/lib/erp/tiny-order-documents";
import { createServiceClient } from "@/lib/supabase/service";

const TABELA = "producao_taloes";

type TalaoRow = {
  deal_id: string;
  pdf: string | null;
  numero_pedido: string | null;
  pedido_ausente: boolean;
  disponivel_apos: string;
  tentativa: number;
  token: string | null;
  reservado_ate: string | null;
};

type TalaosDatabase = {
  public: {
    Tables: {
      producao_taloes: {
        Row: TalaoRow;
        Insert: Pick<TalaoRow, "deal_id"> & Partial<Omit<TalaoRow, "deal_id">>;
        Update: Partial<TalaoRow>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      reservar_producao_talao: {
        Args: { p_token: string; p_deal_id: string | null };
        Returns: Pick<TalaoRow, "deal_id" | "tentativa">[];
      };
    };
  };
};

function banco() {
  return createServiceClient() as unknown as SupabaseClient<TalaosDatabase>;
}

export async function lerTalaoProducao(dealId: string) {
  const { data, error } = await banco()
    .from(TABELA)
    .select("pdf, numero_pedido, pedido_ausente, disponivel_apos, reservado_ate")
    .eq("deal_id", dealId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.numero_pedido) {
    if (!data.pdf?.startsWith("\\x")) throw new Error("Talão armazenado inválido");
    const pdf = Buffer.from(data.pdf.slice(2), "hex");
    if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("Talão armazenado inválido");
    return { estado: "pronto", pdf, orderNumber: data.numero_pedido } as const;
  }
  if (data.pedido_ausente) return { estado: "sem-pedido" } as const;

  const now = Date.now();
  const disponivel = Date.parse(data.disponivel_apos) <= now
    && (!data.reservado_ate || Date.parse(data.reservado_ate) <= now);
  return { estado: "pendente", disponivel } as const;
}

/** Reserva e processa um trabalho. O token impede uma execução antiga de
 * recriar o PDF depois que o negócio saiu da etapa ou depois de outra reserva. */
export async function processarTalaoProducao(dealId?: string) {
  const supabase = banco();
  const token = crypto.randomUUID();
  const { data, error } = await supabase
    .rpc("reservar_producao_talao", { p_token: token, p_deal_id: dealId ?? null });
  if (error) throw error;
  const reserva = data?.[0];
  if (!reserva) return "sem-trabalho";

  let pedidoAusente = false;
  try {
    const orderId = await findTinyOrderIdByDeal(reserva.deal_id);
    if (!orderId) {
      pedidoAusente = true;
    } else {
      const { pdf, orderNumber } = await generateOrderDocument(orderId, "talao", { dealId: reserva.deal_id });
      const resultado = await supabase.from(TABELA)
        .update({
          pdf: "\\x" + pdf.toString("hex"),
          numero_pedido: orderNumber,
          token: null,
          reservado_ate: null,
        })
        .eq("deal_id", reserva.deal_id)
        .eq("token", token)
        .select("deal_id");
      if (resultado.error) throw resultado.error;
      return resultado.data.length > 0 ? "gerado" : "descartado";
    }
  } catch (error) {
    console.error("Falha ao gerar talão em segundo plano", { dealId: reserva.deal_id, error });
  }

  const minutos = Math.min(30, 2 ** Math.min(reserva.tentativa - 1, 5));
  const reagendado = await supabase.from(TABELA).update({
    pedido_ausente: pedidoAusente,
    disponivel_apos: new Date(Date.now() + minutos * 60_000).toISOString(),
    token: null,
    reservado_ate: null,
  }).eq("deal_id", reserva.deal_id).eq("token", token);
  if (reagendado.error) throw reagendado.error;
  return "reagendado";
}
