-- ============================================================
-- Instagram Orgânico - Views
-- ============================================================

-- Último snapshot de insights por mídia + taxas calculadas
-- (save_rate, share_rate, engagement_rate sobre reach). Fonte
-- principal do frontend do avaliador.
create or replace view public.v_ig_media_latest
with (security_invoker = true) as
select distinct on (m.id)
  m.id,
  m.media_type,
  m.media_product_type,
  m.caption,
  m.permalink,
  m.media_url,
  m.thumbnail_url,
  m.timestamp,
  i.date as insights_date,
  i.reach,
  i.views,
  i.saved,
  i.shares,
  i.likes,
  i.comments,
  i.total_interactions,
  i.avg_watch_time_ms,
  i.total_watch_time_ms,
  i.navigation,
  i.replies,
  case when i.reach > 0 then round(i.saved::numeric / i.reach, 4) end as save_rate,
  case when i.reach > 0 then round(i.shares::numeric / i.reach, 4) end as share_rate,
  case when i.reach > 0 then round(i.total_interactions::numeric / i.reach, 4) end as engagement_rate
from public.ig_media m
join public.ig_media_insights_daily i on i.media_id = m.id
order by m.id, i.date desc;

comment on view public.v_ig_media_latest is
  'Último snapshot de insights por mídia (post/reel/story) + taxas sobre reach. Fonte principal do módulo /instagram-organico.';
