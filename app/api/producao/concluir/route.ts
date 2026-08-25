import { NextRequest, NextResponse } from "next/server";
import { requireProducao } from "@/lib/security/route-guards";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyPin } from "@/lib/producao/pin";
import {
  findStageIdByName,
  getGhlDeal,
  updateGhlOpportunity,
} from "@/lib/ghl/api";
import { upsertGhlDeals } from "@/lib/ghl/deals-cache";
import {
  EXPEDICAO_STAGE_TITLE,
  isEtapaConcluivel,
} from "@/lib/ghl/programacao-stages";

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 10;

function semCache(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * A produção dá o pedido como concluído e ele avança para "Expedição" no GHL.
 * É o único movimento que o dashboard faz no CRM.
 *
 * Duas travas importam aqui:
 *
 * 1. A etapa é conferida contra o GHL AO VIVO, não contra o card na tela. O
 *    board pode estar velho — alguém pode ter movido o negócio há 30 segundos —
 *    e a checagem do cliente é só conforto visual.
 * 2. O PIN tem contagem de erro no banco. São 4 dígitos, e sem trava alguém já
 *    autenticado adivinharia o PIN de um colega e assinaria no nome dele.
 */
export async function POST(request: NextRequest) {
  const access = await requireProducao();
  if (!access.ok) return access.response;

  let payload: { dealId?: unknown; pin?: unknown };
  try {
    payload = await request.json();
  } catch {
    return semCache({ error: "Corpo inválido" }, 400);
  }

  const { dealId, pin } = payload;
  if (typeof dealId !== "string" || !dealId) {
    return semCache({ error: "Pedido não informado" }, 400);
  }
  if (typeof pin !== "string" || !/^[0-9]{4}$/.test(pin)) {
    return semCache({ error: "Digite os 4 números do seu PIN." }, 400);
  }

  const supabase = createServiceClient();

  // ── PIN ───────────────────────────────────────────────────────────────────
  const { data: registro, error: pinError } = await (supabase as any)
    .from("producao_pins")
    .select("pin_hash, tentativas_falhas, bloqueado_ate")
    .eq("user_id", access.user.id)
    .maybeSingle();

  if (pinError) {
    console.error("Erro ao ler PIN da produção:", pinError);
    return semCache({ error: "Erro ao validar PIN" }, 500);
  }
  if (!registro) {
    return semCache(
      { error: "Você ainda não cadastrou um PIN.", precisaCadastrarPin: true },
      403,
    );
  }

  const bloqueadoAte = registro.bloqueado_ate
    ? new Date(registro.bloqueado_ate)
    : null;
  if (bloqueadoAte && bloqueadoAte > new Date()) {
    const minutos = Math.ceil((bloqueadoAte.getTime() - Date.now()) / 60000);
    return semCache(
      { error: `PIN bloqueado por ${minutos} min após erros seguidos.` },
      429,
    );
  }

  if (!verifyPin(pin, registro.pin_hash)) {
    const tentativas = (registro.tentativas_falhas ?? 0) + 1;
    const bloquear = tentativas >= MAX_TENTATIVAS;
    await (supabase as any)
      .from("producao_pins")
      .update({
        tentativas_falhas: bloquear ? 0 : tentativas,
        bloqueado_ate: bloquear
          ? new Date(Date.now() + BLOQUEIO_MINUTOS * 60000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", access.user.id);

    return semCache(
      {
        error: bloquear
          ? `PIN incorreto. Bloqueado por ${BLOQUEIO_MINUTOS} minutos.`
          : `PIN incorreto. Restam ${MAX_TENTATIVAS - tentativas} tentativas.`,
      },
      401,
    );
  }

  // ── Estado real do negócio no GHL ─────────────────────────────────────────
  let deal;
  try {
    deal = await getGhlDeal(dealId);
  } catch (error) {
    console.error("Erro ao ler oportunidade no GHL:", error);
    return semCache({ error: "Não consegui ler o pedido no GHL." }, 502);
  }

  if (!isEtapaConcluivel(deal.stage_title)) {
    return semCache(
      {
        error: `Este pedido está em "${deal.stage_title ?? "etapa desconhecida"}" e não pode ser concluído daqui.`,
        etapaAtual: deal.stage_title,
        desatualizado: true,
      },
      409,
    );
  }

  if (!deal.pipeline_id) {
    return semCache({ error: "Pedido sem pipeline no GHL." }, 422);
  }

  const destinoId = await findStageIdByName(
    deal.pipeline_id,
    EXPEDICAO_STAGE_TITLE,
  );
  if (!destinoId) {
    return semCache(
      { error: `O pipeline deste pedido não tem a etapa "${EXPEDICAO_STAGE_TITLE}".` },
      422,
    );
  }

  // ── Movimento ─────────────────────────────────────────────────────────────
  const etapaAnterior = deal.stage_title;
  const requestId = request.headers.get("x-vercel-id") || crypto.randomUUID();

  try {
    await updateGhlOpportunity(dealId, { pipelineStageId: destinoId });
  } catch (error) {
    console.error("Erro ao mover oportunidade no GHL:", error);
    return semCache({ error: "Não consegui mover o pedido no GHL." }, 502);
  }

  // Relê e grava no cache na hora: não dá para depender do webhook do GHL
  // disparar em mudança feita pela própria API.
  let atualizado = deal;
  try {
    atualizado = await getGhlDeal(dealId);
    await upsertGhlDeals([atualizado], "manual", requestId);
  } catch (error) {
    // O movimento no CRM já aconteceu; o cache se corrige no próximo sync.
    console.error("Pedido movido, mas o cache não atualizou:", error);
  }

  const { error: logError } = await (supabase as any)
    .from("producao_conclusoes")
    .insert({
      deal_id: dealId,
      deal_title: deal.title,
      user_id: access.user.id,
      user_email: access.user.email ?? null,
      pipeline_id: deal.pipeline_id,
      from_stage: etapaAnterior,
      to_stage: EXPEDICAO_STAGE_TITLE,
    });

  if (logError) {
    console.error("Conclusão registrada no GHL mas não no log:", logError);
  }

  return semCache({
    success: true,
    dealId,
    title: deal.title,
    de: etapaAnterior,
    para: atualizado.stage_title ?? EXPEDICAO_STAGE_TITLE,
  });
}

export const runtime = "nodejs";
