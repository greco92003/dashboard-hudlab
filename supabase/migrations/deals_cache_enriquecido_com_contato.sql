-- ============================================================
-- v_deals_cache_enriquecido: tapa o buraco de "Não informado"
-- dos gráficos de pizza do /dashboard.
--
-- Contexto (investigado em 2026-09-14):
-- O sync do GHL (lib/ghl/api.ts, mapOpportunity) lê APENAS os custom
-- fields da *oportunidade*. Existe uma automação no GHL que copia
-- contato -> oportunidade, mas ela só dispara em parte dos fluxos
-- (cadastro manual, por exemplo, não dispara), então o dashboard
-- enxergava só a ponta que a automação alcançou.
--
-- O dado estava no *contato* o tempo todo. Nos 30 dias 14/08-14/09,
-- por faturamento:
--   estado    31,8% vazio -> 1,6%
--   segmento  64,5% vazio -> 12,5%
--   utm       66,1% vazio -> 14,6%
-- ghl_contacts tem 100% de cobertura dos negócios (162/162 em 90d) e
-- é sincronizada pela edge function sync-ghl, então o cruzamento não
-- custa nenhuma chamada extra na API do GHL.
--
-- Precedência: o CONTATO ganha, a oportunidade é só fallback. É o que
-- o cliente preencheu de próprio punho; a oportunidade recebe cópia
-- via automação e pode estar defasada.
--
-- estado passa por normalize_uf() dos DOIS lados. Sem isso o gráfico
-- fragmenta: no ano, os valores crus rendiam 66 grupos distintos
-- ("SP", "São Paulo", "são paulo", "Sao Paulo", "São Paulo (state)")
-- contra 20 depois de normalizar. normalize_uf também descarta lixo
-- de 2 letras que não é UF ("TS", "Ra", "Re", "OH").
-- ============================================================

create or replace view public.v_deals_cache_enriquecido
with (security_invoker = true) as
with contato as (
  select
    c.id,
    -- uf é mantida pelo trigger fill_uf -> normalize_uf(state), e state
    -- já cai no custom field "contact.estado" quando o endereço padrão
    -- do contato está vazio (ver mapContact na edge function sync-ghl).
    c.uf,
    nullif(btrim(c.utm_source), '') as utm_source,
    nullif(btrim(c.utm_medium), '') as utm_medium,
    -- IDs dos custom fields de contato desta location do GHL:
    --   7xF55enQ06nvEpDDqywG = contact.segmento_de_negcio
    --   ri4gOxiEIsePStfXaaa4 = contact.inteno_de_compra
    nullif(btrim((
      select f ->> 'value'
      from jsonb_array_elements(coalesce(c.raw -> 'customFields', '[]'::jsonb)) f
      where f ->> 'id' = '7xF55enQ06nvEpDDqywG'
      limit 1
    )), '') as segmento_de_negocio,
    nullif(btrim((
      select f ->> 'value'
      from jsonb_array_elements(coalesce(c.raw -> 'customFields', '[]'::jsonb)) f
      where f ->> 'id' = 'ri4gOxiEIsePStfXaaa4'
      limit 1
    )), '') as intencao_de_compra
  from public.ghl_contacts c
)
select
  d.id,
  d.deal_id,
  d.title,
  d.value,
  d.currency,
  d.status,
  d.stage_id,
  d.closing_date,
  d.created_date,
  d.custom_field_value,
  d.custom_field_id,
  d.contact_id,
  d.organization_id,
  d.last_synced_at,
  d.api_updated_at,
  d.sync_status,
  d.sync_error_message,
  d.created_at,
  d.updated_at,
  d."quantidade-de-pares",
  d.vendedor,
  d.designer,
  d.custom_field_54,
  d.last_change_source,
  d.last_request_id,
  d.source_system,
  d.source_id,
  d.pipeline_id,
  d.stage_title,
  d.data_embarque,
  d.assigned_to,
  d.provider_payload,
  d.tipo_pedido,
  d.data_embarque_date,

  -- Os quatro campos enriquecidos: contato primeiro, oportunidade como fallback
  coalesce(k.uf, public.normalize_uf(d.estado)) as estado,
  coalesce(k.segmento_de_negocio, nullif(btrim(d.segmento_de_negocio), '')) as segmento_de_negocio,
  coalesce(k.intencao_de_compra, nullif(btrim(d.intencao_de_compra), '')) as intencao_de_compra,
  coalesce(k.utm_source, nullif(btrim(d."utm-source"), '')) as "utm-source",
  coalesce(k.utm_medium, nullif(btrim(d."utm-medium"), '')) as "utm-medium",

  -- Valores crus da oportunidade, para auditar divergência sem
  -- precisar voltar na tabela.
  d.estado as estado_oportunidade,
  d.segmento_de_negocio as segmento_de_negocio_oportunidade,
  d.intencao_de_compra as intencao_de_compra_oportunidade
from public.deals_cache d
left join contato k on k.id = d.contact_id;

comment on view public.v_deals_cache_enriquecido is
  'deals_cache com estado/segmento/intenção/UTM preenchidos pelo contato (ghl_contacts) quando a oportunidade não tem o dado. Contato tem precedência; estado normalizado por normalize_uf. Ver /api/deals-cache.';
