// Supabase Edge Function: ig-inteligencia
// Ciclo semanal de Auditor + Estrategista do Instagram Orgânico.
// Sem agente permanente, sem orquestrador: só 2 chamadas à API da
// Anthropic por semana (Auditor avalia o que maturou, Estrategista
// sugere a semana seguinte), cada uma disparada por este cron.
//
// Body opcional {"phase": "auditor" | "estrategista"} -- sem phase
// roda os dois em sequência (Auditor primeiro, depois Estrategista
// já lendo o resultado atualizado).
//
// Secrets necessários:
//   ANTHROPIC_API_KEY - console.anthropic.com -> Chaves de API
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CONTEXTO_MARCA } from "./contexto-marca.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODELO = "claude-sonnet-5";
const TRILHAS_VALIDAS = new Set([
  "bastidores", "colab_cliente", "humor_meme", "cta_padrao", "tendencia", "outro",
]);
// Só audita o que já maturou (7+ dias) e ainda é relevante pro ciclo
// atual (últimos 90 dias) -- evita tanto avaliar cedo demais quanto
// reprocessar o acervo histórico inteiro (383 mídias desde 2023) toda
// semana. Sem limite superior de idade rígido (tipo "só 7-14 dias"):
// se uma semana não conseguir processar tudo, o item continua
// elegível na próxima em vez de cair fora da janela pra sempre.
const JANELA_MATURACAO_DIAS = 7;
const JANELA_RELEVANCIA_DIAS = 90;
const LOTE_MAXIMO = 30;
// Cada mídia envolve download de imagem + chamada ao modelo (~5-8s) --
// um lote de 30 já estourou o idle timeout de 150s do runtime numa
// execução só. TIME_BUDGET_MS processa o que couber e encadeia o
// resto via EdgeRuntime.waitUntil, mesmo padrão do sync-ghl. Como
// "já auditado" mora na própria tabela ig_auditorias, não precisa de
// cursor -- cada hop só refaz a mesma consulta e pega o que sobrou.
const TIME_BUDGET_MS = 100_000;
const MAX_HOPS = 15;

function normalizarTrilha(t: unknown): string {
  const s = typeof t === "string" ? t.trim().toLowerCase() : "";
  return TRILHAS_VALIDAS.has(s) ? s : "outro";
}

function subtrairDias(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() - n);
  return out;
}

function dataIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Dispara a próxima invocação sem esperar a resposta.
function chainNext(body: Record<string, unknown>) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ig-inteligencia`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = Deno.env.get("SYNC_SECRET");
  if (secret) headers["x-sync-secret"] = secret;
  EdgeRuntime.waitUntil(
    fetch(url, { method: "POST", headers, body: JSON.stringify(body) }).catch((e) =>
      console.error("chainNext falhou:", e)
    ),
  );
}

// deno-lint-ignore no-explicit-any
async function logSync(supabase: any, source: string, startedAt: Date, rows: number, status: string, error?: string) {
  await supabase.from("sync_log").insert({
    source,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    rows_upserted: rows,
    status,
    error: error ?? null,
  });
}

async function imageToBase64(url: string): Promise<{ data: string; media_type: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buf = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const media_type = contentType.startsWith("image/") ? contentType : "image/jpeg";
    return { data: btoa(binary), media_type };
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
async function callClaude(apiKey: string, system: string, content: any[], maxTokens = 1500): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  const textBlock = (data.content ?? []).find((b: any) => b.type === "text");
  if (!textBlock) throw new Error("Resposta do Claude sem bloco de texto");
  return textBlock.text as string;
}

function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch (err) {
    // Erro comum: resposta cortada por atingir max_tokens no meio do
    // JSON (roteiro detalhado de Reels é longo) -- mostrar o fim do
    // texto recebido facilita saber se foi truncamento ou formato
    // inválido, sem precisar adivinhar.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${msg} -- fim da resposta recebida: "...${t.slice(-200)}"`);
  }
}

const AUDITOR_INSTRUCOES = `Você é o Auditor de conteúdo do Instagram Orgânico da Hud Lab.

${CONTEXTO_MARCA}

Sua tarefa: avaliar UM post/reel com base na imagem fornecida (thumbnail pro Reels, imagem completa pro Post/Carrossel), na legenda e nas métricas reais -- comparando com a média histórica da própria conta (fornecida) pra dizer se performou acima ou abaixo do esperado.

Atribua:
- trilha: uma destas categorias -- "bastidores" (produção/rotina), "colab_cliente" (produzido para/colaboração), "humor_meme", "cta_padrao" (CTA recorrente tipo Amostra Digital), "tendencia" (gancho de atualidade), "outro".
- nota: de 0 a 10, baseada em evidência (métrica real vs. média da conta), não em gosto pessoal.
- resumo: 2-3 frases sobre o resultado.
- pontos_fortes: o que funcionou, citando número ou elemento visual/legenda concreto.
- pontos_fracos: o que não funcionou.
- sugestao_correspondente: se este post claramente cumpre uma das "sugestões pendentes" listadas abaixo (mesmo tema/formato/trilha, mesmo que a execução tenha variado um pouco), retorne o "id" dela. Se não corresponder a nenhuma com segurança, retorne null -- não force correspondência.

Responda APENAS com um objeto JSON válido, sem nenhum texto antes ou depois, exatamente neste formato:
{"trilha": "...", "nota": 0.0, "resumo": "...", "pontos_fortes": "...", "pontos_fracos": "...", "sugestao_correspondente": null}`;

const ESTRATEGISTA_INSTRUCOES = `Você é o Estrategista de conteúdo do Instagram Orgânico da Hud Lab.

${CONTEXTO_MARCA}

Sua tarefa: propor o calendário de publicações da semana com base na performance histórica por trilha e nas auditorias recentes fornecidas -- não em fórmula genérica de copywriting. Decida quantos Reels, Posts e Stories sugerir e a qual trilha cada um pertence, priorizando o que os dados mostram que funciona. Radar de tendências e roteiro multi-frame de vídeo NÃO fazem parte desta fase -- não assuma acesso a pesquisa de atualidade.

Pra cada peça sugerida, retorne um item com:
- dia_planejado (data YYYY-MM-DD dentro da semana)
- media_product_type ("REELS" | "FEED" | "STORY")
- trilha (mesma taxonomia do Auditor: bastidores | colab_cliente | humor_meme | cta_padrao | tendencia | outro)
- descricao_imagem (obrigatório se FEED: o que a imagem/composição deve mostrar)
- legenda (texto sugerido)
- cta
- roteiro (obrigatório se REELS: roteiro com direção de cena, detalhado o suficiente pra equipe filmar)
- justificativa (a evidência de dado -- trilha, nota, taxa -- que embasa essa sugestão)

Responda APENAS com um objeto JSON válido, sem nenhum texto antes ou depois, exatamente neste formato:
{"itens": [{"dia_planejado": "...", "media_product_type": "...", "trilha": "...", "descricao_imagem": "...", "legenda": "...", "cta": "...", "roteiro": "...", "justificativa": "..."}]}`;

// deno-lint-ignore no-explicit-any
async function baselinePorTipo(supabase: any): Promise<Record<string, number | null>> {
  const { data } = await supabase.from("v_ig_media_latest").select("media_product_type, engagement_rate");
  const soma: Record<string, { s: number; n: number }> = {};
  // deno-lint-ignore no-explicit-any
  for (const r of (data ?? []) as any[]) {
    if (r.engagement_rate == null) continue;
    soma[r.media_product_type] ??= { s: 0, n: 0 };
    soma[r.media_product_type].s += r.engagement_rate;
    soma[r.media_product_type].n += 1;
  }
  const out: Record<string, number | null> = {};
  for (const k in soma) out[k] = soma[k].n > 0 ? soma[k].s / soma[k].n : null;
  return out;
}

// deno-lint-ignore no-explicit-any
async function auditarMedia(supabase: any, apiKey: string, baseline: Record<string, number | null>, pendentes: any[], item: any) {
  const imgUrl = item.media_type === "VIDEO" ? item.thumbnail_url : item.media_url;
  const img = imgUrl ? await imageToBase64(imgUrl) : null;

  // deno-lint-ignore no-explicit-any
  const contentBlocks: any[] = [];
  if (img) {
    contentBlocks.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  }
  const contexto = {
    tipo: item.media_product_type,
    legenda: item.caption,
    publicado_em: item.timestamp,
    metricas: {
      views: item.views,
      reach: item.reach,
      likes: item.likes,
      comments: item.comments,
      saved: item.saved,
      shares: item.shares,
      engagement_rate: item.engagement_rate,
      save_rate: item.save_rate,
      share_rate: item.share_rate,
    },
    media_do_tipo_na_conta: { engagement_rate: baseline[item.media_product_type] ?? null },
    // deno-lint-ignore no-explicit-any
    sugestoes_pendentes: pendentes.map((p: any) => ({
      id: p.id,
      trilha: p.trilha,
      media_product_type: p.media_product_type,
      dia_planejado: p.dia_planejado,
      descricao_imagem: p.descricao_imagem,
      legenda: p.legenda,
      cta: p.cta,
      roteiro: p.roteiro,
    })),
  };
  contentBlocks.push({ type: "text", text: `Dados do post a avaliar:\n${JSON.stringify(contexto, null, 2)}` });

  const respostaTexto = await callClaude(apiKey, AUDITOR_INSTRUCOES, contentBlocks);
  // deno-lint-ignore no-explicit-any
  const json = extractJson(respostaTexto) as any;
  if (!json.resumo) throw new Error("Resposta incompleta do modelo (sem resumo)");

  const trilha = normalizarTrilha(json.trilha);
  const sugestaoId = typeof json.sugestao_correspondente === "number" ? json.sugestao_correspondente : null;

  const { error: upErr } = await supabase.from("ig_auditorias").upsert(
    {
      media_id: item.id,
      sugestao_id: sugestaoId,
      trilha,
      nota: typeof json.nota === "number" ? json.nota : null,
      resumo: json.resumo,
      pontos_fortes: json.pontos_fortes ?? null,
      pontos_fracos: json.pontos_fracos ?? null,
      gerado_por: MODELO,
    },
    { onConflict: "media_id" },
  );
  if (upErr) throw new Error(`Upsert ig_auditorias: ${upErr.message}`);

  if (sugestaoId != null) {
    await supabase
      .from("ig_calendario_semanal")
      .update({ status: "seguida", matched_media_id: item.id })
      .eq("id", sugestaoId);
  }
}

// deno-lint-ignore no-explicit-any
async function runAuditor(supabase: any, apiKey: string, deadline: number) {
  const baseline = await baselinePorTipo(supabase);

  const { data: pendentesRaw } = await supabase
    .from("ig_calendario_semanal")
    .select("id, trilha, media_product_type, dia_planejado, descricao_imagem, legenda, cta, roteiro")
    .eq("status", "pendente")
    .order("dia_planejado", { ascending: false })
    .limit(20);
  const pendentes = pendentesRaw ?? [];

  const hoje = new Date();
  const ateStr = dataIso(subtrairDias(hoje, JANELA_MATURACAO_DIAS));
  const deStr = dataIso(subtrairDias(hoje, JANELA_RELEVANCIA_DIAS));

  const { data: candidatos, error: candErr } = await supabase
    .from("v_ig_media_latest")
    .select(
      "id, media_type, media_product_type, caption, timestamp, media_url, thumbnail_url, reach, views, likes, comments, saved, shares, total_interactions, save_rate, share_rate, engagement_rate",
    )
    .in("media_product_type", ["REELS", "FEED"])
    .gte("timestamp", deStr)
    .lte("timestamp", `${ateStr}T23:59:59`)
    .order("timestamp", { ascending: true });
  if (candErr) throw new Error(`Buscar candidatos: ${candErr.message}`);

  const { data: jaAuditados } = await supabase.from("ig_auditorias").select("media_id");
  // deno-lint-ignore no-explicit-any
  const auditadosSet = new Set((jaAuditados ?? []).map((r: any) => r.media_id));
  // deno-lint-ignore no-explicit-any
  const fila = ((candidatos ?? []) as any[]).filter((c) => !auditadosSet.has(c.id)).slice(0, LOTE_MAXIMO);

  let rows = 0;
  let processados = 0;
  const skipped: string[] = [];
  for (const item of fila) {
    if (Date.now() >= deadline) break;
    processados++;
    try {
      await auditarMedia(supabase, apiKey, baseline, pendentes, item);
      rows++;
    } catch (err) {
      skipped.push(`${item.id} (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  const maisPendente = processados < fila.length;

  // Sugestões antigas (mais de 14 dias) que nunca foram reconhecidas
  // por nenhum post real -- consideradas não seguidas. Só roda quando
  // a fila desta rodada esgotou de verdade (não parcial por deadline).
  if (!maisPendente) {
    const limiteNaoSeguida = dataIso(subtrairDias(hoje, 14));
    await supabase
      .from("ig_calendario_semanal")
      .update({ status: "nao_seguida" })
      .eq("status", "pendente")
      .lt("semana_inicio", limiteNaoSeguida);
  }

  return { rows, skipped, maisPendente };
}

// deno-lint-ignore no-explicit-any
async function runEstrategista(supabase: any, apiKey: string) {
  const { data: trilhaPerf } = await supabase.from("v_ig_trilha_performance").select("*");
  const { data: auditoriasRecentes } = await supabase
    .from("ig_auditorias")
    .select("trilha, nota, resumo, pontos_fortes, pontos_fracos, criado_em")
    .order("criado_em", { ascending: false })
    .limit(20);

  const spNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const semanaInicio = dataIso(spNow);

  const contexto = {
    semana_inicio: semanaInicio,
    performance_por_trilha: trilhaPerf ?? [],
    auditorias_recentes: auditoriasRecentes ?? [],
  };

  const respostaTexto = await callClaude(
    apiKey,
    ESTRATEGISTA_INSTRUCOES,
    [{ type: "text", text: JSON.stringify(contexto, null, 2) }],
    8000,
  );
  // deno-lint-ignore no-explicit-any
  const json = extractJson(respostaTexto) as any;
  const itens = Array.isArray(json.itens) ? json.itens : [];

  // deno-lint-ignore no-explicit-any
  const linhas = itens.map((it: any) => ({
    semana_inicio: semanaInicio,
    dia_planejado: it.dia_planejado,
    media_product_type: (it.media_product_type ?? "FEED").toUpperCase(),
    trilha: normalizarTrilha(it.trilha),
    descricao_imagem: it.descricao_imagem ?? null,
    legenda: it.legenda ?? null,
    cta: it.cta ?? null,
    roteiro: it.roteiro ?? null,
    justificativa: it.justificativa ?? "",
    gerado_por: MODELO,
  }));

  if (linhas.length > 0) {
    const { error } = await supabase.from("ig_calendario_semanal").insert(linhas);
    if (error) throw new Error(`Insert ig_calendario_semanal: ${error.message}`);
  }
  return { rows: linhas.length };
}

type Phase = "auditor" | "estrategista" | "all";

Deno.serve(async (req: Request) => {
  const syncSecret = Deno.env.get("SYNC_SECRET");
  if (syncSecret && req.headers.get("x-sync-secret") !== syncSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let phase: Phase = "all";
  let hop = 0;
  try {
    const body = await req.json();
    if (body?.phase === "auditor" || body?.phase === "estrategista") phase = body.phase;
    if (typeof body?.hop === "number") hop = body.hop;
  } catch {
    /* sem body = "all", hop 0 */
  }

  if (hop > MAX_HOPS) {
    return new Response(JSON.stringify({ error: "max hops excedido" }), { status: 500 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY não configurado" }), { status: 500 });
  }

  const json = (obj: unknown) =>
    new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json" } });

  let auditorResult: { rows: number; skipped: string[]; maisPendente: boolean } | undefined;
  let auditorErr: string | undefined;
  if (phase === "auditor" || phase === "all") {
    const startedAt = new Date();
    try {
      auditorResult = await runAuditor(supabase, apiKey, Date.now() + TIME_BUDGET_MS);
      if (auditorResult.skipped.length > 0) {
        auditorErr = `${auditorResult.skipped.length} mídia(s) pulada(s): ${auditorResult.skipped.slice(0, 5).join("; ")}`;
      }
    } catch (err) {
      auditorErr = err instanceof Error ? err.message : String(err);
    } finally {
      await logSync(supabase, "ig_auditor", startedAt, auditorResult?.rows ?? 0, auditorErr ? "error" : "success", auditorErr);
    }

    // Ainda tem mídia madura sem auditar: encadeia mais um hop na mesma
    // fase e retorna já -- não avança pro Estrategista com dado
    // incompleto (a régua de "não seguida" também só fecha quando a
    // fila esgota de verdade, ver runAuditor).
    if (auditorResult?.maisPendente) {
      chainNext({ phase, hop: hop + 1 });
      return json({
        phase,
        auditor: { rows: auditorResult.rows, error: auditorErr },
        continua: true,
        hop,
      });
    }
  }

  let estrategistaResult: { rows: number } | undefined;
  let estrategistaErr: string | undefined;
  if (phase === "estrategista" || phase === "all") {
    const startedAt = new Date();
    try {
      estrategistaResult = await runEstrategista(supabase, apiKey);
    } catch (err) {
      estrategistaErr = err instanceof Error ? err.message : String(err);
    } finally {
      await logSync(
        supabase,
        "ig_estrategista",
        startedAt,
        estrategistaResult?.rows ?? 0,
        estrategistaErr ? "error" : "success",
        estrategistaErr,
      );
    }
  }

  return json({
    phase,
    auditor: phase === "auditor" || phase === "all"
      ? { rows: auditorResult?.rows ?? 0, error: auditorErr }
      : undefined,
    estrategista: phase === "estrategista" || phase === "all"
      ? { rows: estrategistaResult?.rows ?? 0, error: estrategistaErr }
      : undefined,
  });
});
