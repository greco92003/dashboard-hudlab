-- Negócio que não conta como "abriu negócio novo" em nenhuma campanha.
--
-- Caso de origem (23/10/2026): a cliente VIP "Le Gratidao ?" aceitou o convite
-- da Black e perguntou "o que tem além de chinelos". A palavra "chinelos"
-- disparou o workflow Atendimento Inicial do GHL, que trata quem não tem a
-- tag `lead` como lead novo e abriu um card em Cadastro Inicial com o robô de
-- orçamento. Não foi a cliente abrindo pedido. O gatilho foi corrigido no
-- mesmo dia (filtro "Não tem tag" campanha_blackvip_enviado).
--
-- Só sai da contagem de aberturas: se o negócio virar venda, a venda continua
-- contando para a campanha.
CREATE TABLE IF NOT EXISTS public.campanha_abertura_ignorada (
  deal_id text PRIMARY KEY,
  motivo text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campanha_abertura_ignorada ENABLE ROW LEVEL SECURITY;

INSERT INTO public.campanha_abertura_ignorada (deal_id, motivo)
VALUES (
  'brNQCLd9qV0oyGPzlPE2',
  'Card aberto pelo robô do Atendimento Inicial quando a cliente VIP respondeu o convite da Black com "chinelos" (23/10/2026)'
)
ON CONFLICT (deal_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_campanhas()
 RETURNS TABLE(campanha text, tipo text, inicio date, fim date, enviados bigint, quero_ver bigint, nao_quero bigint, quero_pedido bigint, agora_nao bigint, consultar_prazo bigint, novos_negocios bigint, fecharam bigint, faturamento numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH tags AS (
    SELECT t.contact_id, m[1] AS campanha, m[2] AS etapa, t.primeiro_visto_em
    FROM public.ghl_contact_tags t
    CROSS JOIN LATERAL regexp_match(
      t.tag,
      '^campanha_(.+)_(enviado|quero_ver|nao_quero|quero_pedido|agora_nao|consultar_prazo)$'
    ) AS m
    WHERE t.tag LIKE 'campanha\_%'
      AND m IS NOT NULL
  ),
  contato AS (
    SELECT
      campanha,
      contact_id,
      MIN(primeiro_visto_em) AS visto_em,
      BOOL_OR(etapa = 'enviado') AS enviado,
      BOOL_OR(etapa = 'quero_ver') AS quero_ver,
      BOOL_OR(etapa = 'nao_quero') AS nao_quero,
      BOOL_OR(etapa = 'quero_pedido') AS quero_pedido,
      BOOL_OR(etapa = 'agora_nao') AS agora_nao,
      BOOL_OR(etapa = 'consultar_prazo') AS consultar_prazo
    FROM tags
    GROUP BY 1, 2
  ),
  execucoes AS (
    SELECT started_at
    FROM public.sync_log
    WHERE source = 'ghl_contact_tags'
  ),
  ancorado AS (
    SELECT
      c.*,
      GREATEST(
        COALESCE(
          (SELECT MAX(e.started_at) FROM execucoes e
            WHERE e.started_at < c.visto_em - INTERVAL '10 minutes'),
          c.visto_em - INTERVAL '24 hours'
        ),
        c.visto_em - INTERVAL '3 days'
      ) AS enviado_desde
    FROM contato c
  ),
  janela AS (
    SELECT
      a.*,
      CASE
        WHEN a.campanha LIKE 'fecha%' OR a.campanha LIKE 'black%' THEN 'fechamento'
        ELSE 'recompra'
      END AS tipo,
      (a.enviado_desde AT TIME ZONE 'America/Sao_Paulo')::date AS dia_envio
    FROM ancorado a
  ),
  com_fim AS (
    SELECT
      j.*,
      CASE
        WHEN j.tipo = 'recompra' THEN j.dia_envio + 60
        WHEN extract(day FROM j.dia_envio) = 1 THEN j.dia_envio
        ELSE (date_trunc('month', j.dia_envio) + INTERVAL '1 month')::date
      END AS dia_fim
    FROM janela j
  ),
  negocios AS (
    SELECT
      d.deal_id,
      d.contact_id,
      d.created_date,
      (d.created_date AT TIME ZONE 'America/Sao_Paulo')::date AS dia_criado,
      d.value / 100.0 AS valor,
      (d.closing_date AT TIME ZONE 'UTC')::date AS dia_venda,
      public.ghl_deal_ganho(d.status, d.pipeline_id, d.stage_id, d.value) AS ganho
    FROM public.deals_cache d
    WHERE d.source_system = 'ghl'
      AND d.sync_status = 'synced'
      AND d.contact_id IN (SELECT contact_id FROM contato)
  ),
  candidatos AS (
    SELECT
      c.campanha,
      c.contact_id,
      c.enviado_desde,
      n.deal_id,
      n.valor,
      n.created_date >= c.enviado_desde AND n.dia_criado <= c.dia_fim
        AND n.deal_id NOT IN (SELECT deal_id FROM public.campanha_abertura_ignorada) AS abriu,
      n.ganho AND n.valor > 0
        AND n.dia_venda BETWEEN c.dia_envio AND c.dia_fim
        AND (c.tipo = 'fechamento' OR n.created_date >= c.enviado_desde) AS vendeu
    FROM com_fim c
    JOIN negocios n USING (contact_id)
  ),
  aberturas AS (
    SELECT DISTINCT ON (deal_id) campanha, contact_id
    FROM candidatos
    WHERE abriu
    ORDER BY deal_id, enviado_desde DESC
  ),
  vendas AS (
    SELECT DISTINCT ON (deal_id) campanha, contact_id, valor
    FROM candidatos
    WHERE vendeu
    ORDER BY deal_id, enviado_desde DESC
  ),
  por_campanha AS (
    SELECT
      c.campanha,
      MIN(c.tipo) AS tipo,
      MIN(c.dia_envio) AS inicio,
      MIN(c.dia_fim) AS fim,
      COUNT(*) FILTER (WHERE c.enviado) AS enviados,
      COUNT(*) FILTER (WHERE c.quero_ver) AS quero_ver,
      COUNT(*) FILTER (WHERE c.nao_quero) AS nao_quero,
      COUNT(*) FILTER (WHERE c.quero_pedido) AS quero_pedido,
      COUNT(*) FILTER (WHERE c.agora_nao) AS agora_nao,
      COUNT(*) FILTER (WHERE c.consultar_prazo) AS consultar_prazo,
      MIN(c.enviado_desde) AS ordem
    FROM com_fim c
    GROUP BY c.campanha
  )
  SELECT
    p.campanha,
    p.tipo,
    p.inicio,
    p.fim,
    p.enviados,
    p.quero_ver,
    p.nao_quero,
    p.quero_pedido,
    p.agora_nao,
    p.consultar_prazo,
    (SELECT COUNT(DISTINCT a.contact_id) FROM aberturas a WHERE a.campanha = p.campanha) AS novos_negocios,
    (SELECT COUNT(DISTINCT v.contact_id) FROM vendas v WHERE v.campanha = p.campanha) AS fecharam,
    COALESCE((SELECT SUM(v.valor) FROM vendas v WHERE v.campanha = p.campanha), 0) AS faturamento
  FROM por_campanha p
  ORDER BY p.ordem DESC;
$function$;
