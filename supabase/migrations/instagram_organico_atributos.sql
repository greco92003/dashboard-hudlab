-- Atributos derivados (Camada 1, sem IA) pra correlacionar com performance:
-- dia da semana, período do dia, tamanho de legenda, hashtag, @menção,
-- CTA recorrente "Amostra Digital". Construída em cima de v_ig_media_latest
-- (reaproveita os *_rate já calculados). Fonte da aba Insights.
create or replace view public.v_ig_atributos
with (security_invoker = true) as
select
  l.id,
  l.media_type,
  l.media_product_type,
  l.timestamp,
  l.caption,
  extract(dow from l.timestamp at time zone 'America/Sao_Paulo')::int as dia_semana,
  case
    when extract(hour from l.timestamp at time zone 'America/Sao_Paulo') between 6 and 11 then 'manha'
    when extract(hour from l.timestamp at time zone 'America/Sao_Paulo') between 12 and 17 then 'tarde'
    when extract(hour from l.timestamp at time zone 'America/Sao_Paulo') between 18 and 23 then 'noite'
    else 'madrugada'
  end as periodo_dia,
  to_char(l.timestamp, 'YYYY-MM') as mes,
  case
    when coalesce(length(l.caption), 0) = 0 then 'sem_legenda'
    when length(l.caption) <= 100 then 'curta'
    when length(l.caption) <= 300 then 'media'
    else 'longa'
  end as legenda_bucket,
  coalesce(l.caption ilike '%#%', false) as tem_hashtag,
  coalesce(l.caption ~ '@[a-zA-Z0-9_.]+', false) as tem_mencao,
  coalesce(
    l.caption ilike '%amostra digital%' or l.caption ilike '%comenta hud%' or l.caption ilike '%comente hud%',
    false
  ) as tem_cta_amostra,
  l.reach,
  l.views,
  l.likes,
  l.comments,
  l.saved,
  l.shares,
  l.total_interactions,
  l.save_rate,
  l.share_rate,
  l.engagement_rate
from public.v_ig_media_latest l;

comment on view public.v_ig_atributos is
  'Atributos derivados sem IA (dia/hora/legenda/hashtag/menção/CTA) + métricas, pra aba Insights correlacionar padrão com performance na conta inteira.';
