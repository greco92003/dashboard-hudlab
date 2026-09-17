-- ============================================================
-- Funil das campanhas de WhatsApp para a base de clientes (2026-09-17)
--
-- Primeira: "Política" -- convite com vídeo de Willian e Greco para quem já
-- teve pedido ganho. O fluxo medido é o mesmo para qualquer campanha:
--
--   enviado -> quero_ver | nao_quero -> quero_pedido | agora_nao
--           -> fechou pedido novo -> faturamento
--
-- TAGS: campanha_<nome>_<etapa>, aplicadas pelo workflow do GHL e trazidas
-- pela fase `tags` do sync-ghl (busca filtrada no GHL, não varredura).
-- Campanha nova aparece sozinha trocando <nome>.
--
-- MEDIDO PELO CONTATO: pedido novo gera oportunidade NOVA, então o
-- resultado é "oportunidades do contato criadas depois do envio". A
-- oportunidade do pedido antigo (motivo de o cliente estar na lista) nunca
-- entra.
--
-- MARCO DO ENVIO: a tag não tem data no GHL; `primeiro_visto_em` é quando o
-- sync a viu, até ~24 h DEPOIS do disparo. Usar esse instante perderia
-- justamente quem clicou "Quero fazer pedido" e fechou no mesmo dia. O
-- marco é a execução anterior da fase tags -- o último momento em que a tag
-- comprovadamente ainda não existia. Sem execução anterior, 24 h antes.
-- Limitado a 3 dias para trás: se o sync ficar parado, pedido antigo não
-- vira resultado de campanha.
--
-- SEM FILTRO DE IMPORTADOS: v_vendas exclui contatos migrados do CRM antigo
-- para descartar as vendas da rajada de importação. Aqui só contam
-- oportunidades criadas depois do envio, e o público da campanha é
-- justamente a base antiga -- aplicar o filtro apagaria o resultado. A
-- sanidade de valor (dado_par_plausivel) continua valendo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_campanhas()
RETURNS TABLE (
  campanha TEXT,
  inicio DATE,
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
  resultado AS (
    SELECT
      a.campanha,
      a.contact_id,
      COUNT(o.id) > 0 AS abriu_negocio,
      COUNT(o.id) FILTER (WHERE o.status = 'won' AND o.monetary_value > 0) > 0 AS fechou,
      COALESCE(SUM(o.monetary_value) FILTER (
        WHERE o.status = 'won'
          AND o.monetary_value > 0
          AND dado_par_plausivel(COALESCE(o.qty_pares, gc.qty_pares), o.monetary_value)
      ), 0) AS faturamento
    FROM ancorado a
    LEFT JOIN public.ghl_opportunities o
      ON o.contact_id = a.contact_id
     AND o.created_at >= a.enviado_desde
    LEFT JOIN public.ghl_contacts gc ON gc.id = a.contact_id
    GROUP BY 1, 2
  )
  SELECT
    a.campanha,
    (MIN(a.enviado_desde) AT TIME ZONE 'America/Sao_Paulo')::DATE AS inicio,
    COUNT(*) FILTER (WHERE a.enviado) AS enviados,
    COUNT(*) FILTER (WHERE a.quero_ver) AS quero_ver,
    COUNT(*) FILTER (WHERE a.nao_quero) AS nao_quero,
    COUNT(*) FILTER (WHERE a.quero_pedido) AS quero_pedido,
    COUNT(*) FILTER (WHERE a.agora_nao) AS agora_nao,
    COUNT(*) FILTER (WHERE r.abriu_negocio) AS novos_negocios,
    COUNT(*) FILTER (WHERE r.fechou) AS fecharam,
    SUM(r.faturamento) AS faturamento
  FROM ancorado a
  JOIN resultado r USING (campanha, contact_id)
  GROUP BY a.campanha
  ORDER BY MIN(a.enviado_desde) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_campanhas() TO authenticated;
