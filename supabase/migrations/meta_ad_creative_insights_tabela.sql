-- ============================================================
-- Criado em 2026-08-13
--
-- Task #29 do brainstorm de Insights: cruzar atributos de criativo
-- (meta_ad_creative_analysis, já extraídos por visão/Whisper e em
-- CACHE por creative_id) com métricas de performance frescas
-- (get_funnel_por_anuncio) pra achar padrões sistematicamente --
-- motivado pelo caso real "Seu Logo Aqui" (achado só depois de ~1 ano
-- de tentativa e erro manual).
--
-- Diferente de meta_ad_creative_analysis (cache caro, por criativo),
-- essa tabela guarda o RESULTADO da síntese (padrões encontrados),
-- que é barato de recalcular (chamada de texto só, sem
-- imagem/áudio -- o trabalho caro já está em cache) e muda toda vez
-- que roda porque a métrica de performance é fresca. Cada rodada
-- SUBSTITUI o conteúdo anterior (delete+insert, sem histórico
-- acumulado) -- mesmo padrão de meta_ghl_ad_insights.
-- ============================================================

create table public.meta_ad_creative_insights (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text not null,
  metrica_chave text,
  forca_sinal text check (forca_sinal in ('forte', 'moderado', 'fraco')),
  anuncios_relacionados jsonb not null default '[]'::jsonb,
  periodo_inicio date not null,
  periodo_fim date not null,
  gerado_por text not null,
  gerado_em timestamptz not null default now()
);

comment on table public.meta_ad_creative_insights is
  'Padrões de criativo (formato, tom, estilo visual, copy) que '
  'correlacionam com melhor performance de funil, sintetizados pelo '
  'Claude cruzando meta_ad_creative_analysis (cache de atributos, '
  'caro) com get_funnel_por_anuncio (métrica fresca, barato). '
  'Substituído por completo a cada rodada -- sem histórico acumulado.';

alter table public.meta_ad_creative_insights enable row level security;

create policy "approved_user_gate" on public.meta_ad_creative_insights
  for all using (private.is_approved_user());

create policy "read authenticated" on public.meta_ad_creative_insights
  for select using (true);
