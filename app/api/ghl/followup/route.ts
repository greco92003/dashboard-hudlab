import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { createClient } from "@supabase/supabase-js";

/**
 * Cascata das réguas de follow-up automatizado do GHL.
 *
 * Toda a lógica mora na RPC `get_followup_regua` (ver migration homônima):
 * atribuição pelo último degrau recebido, avanço medido contra a foto diária
 * de etapas, e faturamento só no bloco de Negociação -- em Atendimento o
 * fechamento está longe demais para ser métrica.
 */
interface ReguaRow {
  bloco: "atendimento" | "negociacao";
  degrau: number;
  versao: number;
  rotulo: string;
  receberam: number;
  destravaram: number;
  vendas: number | null;
  faturamento: string | number | null;
  valor_em_negociacao: string | number | null;
}

export interface FollowUpDegrau {
  rotulo: string;
  degrau: number;
  versao: number;
  receberam: number;
  destravaram: number;
  taxa: number | null;
  vendas: number | null;
  faturamento: number | null;
  valorEmNegociacao: number | null;
}

/**
 * Campanhas de WhatsApp (ver migration get_campanhas_regra_por_tipo). Mesmo
 * princípio da régua: tudo vem de tag. O resultado depende do tipo --
 * fechamento conta a negociação ganha até o dia 01, recompra conta negócio
 * novo ganho em até 60 dias -- e cada venda vai só para a última campanha.
 */
type CampanhaTipo = "fechamento" | "recompra";

interface CampanhaRow {
  campanha: string;
  tipo: CampanhaTipo;
  inicio: string;
  fim: string;
  enviados: number;
  quero_ver: number;
  nao_quero: number;
  quero_pedido: number;
  agora_nao: number;
  /** Botão "Consultar prazo" da Black VIP (ver get_campanhas_black_vip). */
  consultar_prazo: number;
  novos_negocios: number;
  fecharam: number;
  faturamento: string | number | null;
}

export interface Campanha {
  campanha: string;
  tipo: CampanhaTipo;
  inicio: string;
  fim: string;
  enviados: number;
  queroVer: number;
  naoQuero: number;
  queroPedido: number;
  agoraNao: number;
  consultarPrazo: number;
  novosNegocios: number;
  fecharam: number;
  faturamento: number | null;
}

export interface FollowUpReguaResponse {
  atendimento: FollowUpDegrau[];
  negociacao: FollowUpDegrau[];
  campanhas: Campanha[];
  /**
   * Lista VIP permanente (tag lista_vip), criada na Black November de 2026.
   * null quando o sync ainda não viu a tag.
   */
  listaVip: { membros: number; vistoEm: string } | null;
  meta: {
    geradoEm: string;
    /** Nenhuma tag foi observada aparecendo ainda: tudo veio da carga inicial. */
    aguardandoPrimeiraObservacao: boolean;
  };
}

function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCampanha(row: CampanhaRow): Campanha {
  return {
    campanha: row.campanha,
    tipo: row.tipo,
    inicio: row.inicio,
    fim: row.fim,
    enviados: row.enviados,
    queroVer: row.quero_ver,
    naoQuero: row.nao_quero,
    queroPedido: row.quero_pedido,
    agoraNao: row.agora_nao,
    consultarPrazo: row.consultar_prazo ?? 0,
    novosNegocios: row.novos_negocios,
    fecharam: row.fecharam,
    faturamento: toNumber(row.faturamento),
  };
}

function toDegrau(row: ReguaRow): FollowUpDegrau {
  return {
    rotulo: row.rotulo,
    degrau: row.degrau,
    versao: row.versao,
    receberam: row.receberam,
    destravaram: row.destravaram,
    taxa: row.receberam > 0 ? (row.destravaram / row.receberam) * 100 : null,
    vendas: row.vendas,
    faturamento: toNumber(row.faturamento),
    valorEmNegociacao: toNumber(row.valor_em_negociacao),
  };
}

export async function GET() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = getSupabaseSecretKey();
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase service credentials are missing");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    /**
     * Tamanho ATUAL da Lista VIP. ghl_contact_tags é histórico (linha de tag
     * removida no GHL não é apagada), e da lista o contato pode sair pedindo
     * SAIR. Por isso conta só quem o sync viu na última passada: o sync regrava
     * ultimo_visto_em de todo contato que ainda tem a tag, e 2 h de folga cobrem
     * a passada inteira.
     */
    const contarListaVip = async (): Promise<{ membros: number; vistoEm: string } | null> => {
      const ultima = await supabase
        .from("ghl_contact_tags")
        .select("ultimo_visto_em")
        .eq("tag", "lista_vip")
        .order("ultimo_visto_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      const vistoEm = (ultima.data as { ultimo_visto_em?: string } | null)?.ultimo_visto_em;
      if (ultima.error || !vistoEm) return null;

      const corte = new Date(new Date(vistoEm).getTime() - 2 * 3_600_000).toISOString();
      const { count, error } = await supabase
        .from("ghl_contact_tags")
        .select("contact_id", { count: "exact", head: true })
        .eq("tag", "lista_vip")
        .gte("ultimo_visto_em", corte);
      if (error) return null;
      return { membros: count ?? 0, vistoEm };
    };

    const [regua, campanhas, observadas] = await Promise.all([
      supabase.rpc("get_followup_regua"),
      supabase.rpc("get_campanhas"),
      supabase
        .from("ghl_contact_tags")
        .select("contact_id", { count: "exact", head: true })
        .eq("origem_primeiro_visto", "observado"),
    ]);

    if (regua.error) throw new Error(regua.error.message);
    // Campanha é acessório da página: se ela falhar, a régua continua
    // aparecendo em vez de a tela inteira virar erro.
    if (campanhas.error) {
      console.error("[GHL Follow-up] Falha ao montar as campanhas", campanhas.error);
    }

    const rows = (regua.data ?? []) as ReguaRow[];
    const listaVip = await contarListaVip();

    const body: FollowUpReguaResponse = {
      atendimento: rows
        .filter((row) => row.bloco === "atendimento")
        .map(toDegrau),
      negociacao: rows.filter((row) => row.bloco === "negociacao").map(toDegrau),
      // Linha sem nome de campanha derruba a tela (23/10: tags de lote da
      // Black VIP viraram uma "campanha" NULL). A RPC já filtra; aqui é a
      // segunda trava.
      campanhas: ((campanhas.data ?? []) as CampanhaRow[])
        .filter((row) => typeof row.campanha === "string" && row.campanha !== "")
        .map(toCampanha),
      listaVip,
      meta: {
        geradoEm: new Date().toISOString(),
        aguardandoPrimeiraObservacao: (observadas.count ?? 0) === 0,
      },
    };

    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store", "X-Data-Source": "ghl-tags" },
    });
  } catch (error) {
    console.error("[GHL Follow-up] Falha ao montar a régua", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o follow-up",
      },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
