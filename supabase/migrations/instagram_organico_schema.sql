-- ============================================================
-- Instagram Orgânico - Schema base (avaliador de criativos)
-- Dimensão de mídia (post/reel/story) + fato de snapshot diário
-- de insights. Fonte: Instagram Graph API (/media, /stories).
-- ============================================================

-- Dimensão: metadados de cada post/reel/story do Instagram orgânico.
-- media_url/thumbnail_url são links CDN assinados com expiração de
-- poucos dias -- sempre re-sincronizados; permalink nunca expira e
-- é o fallback pra "ver no Instagram" quando o link direto falhar.
create table if not exists public.ig_media (
  id                 text primary key,
  media_type         text not null,
  media_product_type text not null,
  caption            text,
  permalink          text not null,
  media_url          text,
  thumbnail_url      text,
  timestamp          timestamptz not null,
  synced_at          timestamptz default now()
);

comment on table public.ig_media is
  'Dimensão: metadados de post/reel/story do Instagram orgânico (HUD LAB). media_type: IMAGE|VIDEO|CAROUSEL_ALBUM. media_product_type: FEED|REELS|STORY. Fonte: Graph API /media e /stories.';

-- Fato: snapshot diário das métricas lifetime de cada mídia.
-- reach/views/saved/shares crescem ao longo do tempo, então guardamos
-- 1 linha por dia por mídia pra enxergar a curva de crescimento em vez
-- de só o total atual. Pra stories (efêmeros, 24h), captura o que
-- estiver ativo no momento do sync -- não dá pra buscar retroativo.
create table if not exists public.ig_media_insights_daily (
  date                date not null,
  media_id            text not null references public.ig_media(id),
  reach               bigint,
  views               bigint,
  saved               bigint,
  shares              bigint,
  likes               bigint,
  comments            bigint,
  total_interactions  bigint,
  avg_watch_time_ms   bigint,
  total_watch_time_ms bigint,
  navigation          bigint,
  replies             bigint,
  synced_at           timestamptz default now(),
  primary key (date, media_id)
);

comment on table public.ig_media_insights_daily is
  'Snapshot diário de insights por mídia (reach, views, saved, shares, likes, comments, total_interactions; avg_watch_time_ms/total_watch_time_ms só reels; navigation/replies só stories). PK (date, media_id) permite ver a curva de crescimento.';

-- Índices de filtro/ordenação
create index if not exists idx_ig_media_timestamp on public.ig_media (timestamp desc);
create index if not exists idx_ig_media_product_type on public.ig_media (media_product_type);
create index if not exists idx_ig_insights_media on public.ig_media_insights_daily (media_id, date desc);

-- RLS: leitura para authenticated, escrita apenas service_role (edge function)
alter table public.ig_media enable row level security;
alter table public.ig_media_insights_daily enable row level security;

drop policy if exists "read authenticated" on public.ig_media;
create policy "read authenticated" on public.ig_media
  for select to authenticated using (true);

drop policy if exists "read authenticated" on public.ig_media_insights_daily;
create policy "read authenticated" on public.ig_media_insights_daily
  for select to authenticated using (true);
