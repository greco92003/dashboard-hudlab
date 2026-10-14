-- ============================================================
-- Campanhas: regra de resultado por tipo de campanha (2026-10-14)
--
-- Substitui a regra única de get_campanhas.sql ("oportunidade criada depois
-- do envio, sem prazo"), que escondia o resultado do Fecha Mês: 10 das 11
-- vendas de quem recebeu eram negociações abertas antes do disparo.
-- Decidido com o usuário em 14/10/2026:
--
--   FECHAMENTO (campanha_fecha*, ex.: Fecha Mês) -- disparo para negociações
--     em fase final, para fechar o mês. Conta a venda do contato ganha entre
--     o disparo e o dia 01 que fecha o mês (fechamento 02 -> 01). A
--     negociação já existia: não precisa ser oportunidade nova.
--
--   RECOMPRA (qualquer outra: Redenção, Política) -- base de clientes. Conta
--     oportunidade criada depois do disparo e ganha em até 60 dias (ciclo de
--     venda ~35 dias). Quem já negociava antes do disparo não conta.
--
--   ÚLTIMA CAMPANHA -- contato que recebeu mais de uma: cada oportunidade
--     vai só para a campanha mais recente cuja regra ela cumpre. Sem isso a
--     mesma venda somava em Política e Redenção.
--
-- FONTE: deals_cache, a mesma base de faturamento do resto do dashboard
-- (atualizada por webhook e sem os negócios apagados no GHL;
-- ghl_opportunities sincroniza 1x/dia e guarda até os apagados). Ganho =
-- ghl_deal_ganho. Sem dado_par_plausivel: venda ganha não passa por filtro
-- de pares.
--
-- Marco do envio e ausência do filtro de importados: ver get_campanhas.sql.
-- ============================================================

-- O LIKE varria as 135 mil tags (0,6 s); só ~2,5 mil são de campanha.
CREATE INDEX IF NOT EXISTS idx_ghl_contact_tags_campanha
  ON public.ghl_contact_tags (tag text_pattern_ops)
  WHERE tag LIKE 'campanha\_%';

-- O retorno ganhou colunas (tipo, fim): CREATE OR REPLACE não troca a
-- assinatura de saída.
DROP FUNCTION IF EXISTS public.get_campanhas();

CREATE FUNCTION public.get_campanhas()
RETURNS TABLE (
  campanha TEXT,
  tipo TEXT,
  inicio DATE,
  fim DATE,
  enviados BIGINT,
  quero_ver BIGINT,
  nao_quero BIGINT,
  quero_pedido BIGINT,
  agora_nao BIGINT,
  novos_negocios BIGINT,
  fecharam BIGINT,
  faturamento NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH tags AS (
    SELECT t.contact_id, m[1] AS campanha, m[2] AS etapa, t.primeiro_visto_em
    FROM public.ghl_contact_tags t
    CROSS JOIN LATERAL regexp_match(
      t.tag,
      '^campanha_(.+)_(enviado|quero_ver|nao_quero|quero_pedido|agora_nao)$'
    ) AS m
    WHERE t.tag LIKE 'campanha\_%'
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
      BOOL_OR(etapa = 'agora_nao') AS agora_nao
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
          -- A execução que viu a tag leva segundos; 10 min separa com folga
          -- a execução atual (e seus hops) da anterior.
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
      CASE WHEN a.campanha LIKE 'fecha%' THEN 'fechamento' ELSE 'recompra' END AS tipo,
      (a.enviado_desde AT TIME ZONE 'America/Sao_Paulo')::date AS dia_envio
    FROM ancorado a
  ),
  com_fim AS (
    SELECT
      j.*,
      CASE
        WHEN j.tipo = 'recompra' THEN j.dia_envio + 60
        -- Dia 01 que fecha o mês do disparo (mês = dia 02 ao dia 01).
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
  -- Cada par (campanha, oportunidade) que cumpre a regra da campanha.
  candidatos AS (
    SELECT
      c.campanha,
      c.contact_id,
      c.enviado_desde,
      n.deal_id,
      n.valor,
      n.created_date >= c.enviado_desde AND n.dia_criado <= c.dia_fim AS abriu,
      -- A venda também tem que ser depois do disparo: pedido desmembrado
      -- (oportunidade criada em 06/10 para venda de 14/09) não é resultado.
      n.ganho AND n.valor > 0
        AND n.dia_venda BETWEEN c.dia_envio AND c.dia_fim
        AND (c.tipo = 'fechamento' OR n.created_date >= c.enviado_desde) AS vendeu
    FROM com_fim c
    JOIN negocios n USING (contact_id)
  ),
  -- Última campanha: a oportunidade fica só com o disparo mais recente.
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
    (SELECT COUNT(DISTINCT a.contact_id) FROM aberturas a WHERE a.campanha = p.campanha) AS novos_negocios,
    (SELECT COUNT(DISTINCT v.contact_id) FROM vendas v WHERE v.campanha = p.campanha) AS fecharam,
    COALESCE((SELECT SUM(v.valor) FROM vendas v WHERE v.campanha = p.campanha), 0) AS faturamento
  FROM por_campanha p
  ORDER BY p.ordem DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_campanhas() TO authenticated;
