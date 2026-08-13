-- ============================================================
-- Criado em 2026-08-13
--
-- Brainstorm de melhoria do Insights (item 2, retomado): visão de
-- criativo -- CTA, hook, padrões visuais que performam melhor.
-- Motivado pelo caso real "Seu Logo Aqui" (descoberto por tentativa e
-- erro em ~1 ano, sem nenhuma ferramenta ajudando a achar o padrão).
--
-- Guarda metadado bruto de criativo (imagem/vídeo/copy) de cada
-- anúncio ativo do Meta + a análise estruturada gerada pelo Claude
-- (atributos visuais/copy) e transcrição de áudio (Whisper) pra
-- vídeos. Sync de metadado bruto (sync-meta, fase 3) é separado do
-- passo de análise (edge function própria, meta-ghl-creative-analysis)
-- porque o segundo custa chamada de LLM/Whisper -- não precisa rodar
-- toda vez que o metadado é atualizado, só quando o criativo muda
-- (creative_id novo) ou ainda não foi analisado.
-- ============================================================

create table public.meta_ad_creative_analysis (
  ad_id text primary key,
  creative_id text,
  media_type text check (media_type in ('image', 'video')),
  body text,
  title text,
  call_to_action_type text,
  image_url text,
  video_id text,
  thumbnail_url text,
  video_length_seconds numeric,
  transcript text,
  analysis jsonb,
  analyzed_at timestamptz,
  synced_at timestamptz not null default now()
);

comment on table public.meta_ad_creative_analysis is
  'Dados de criativo (imagem/vídeo/copy) de cada anúncio ativo do Meta + '
  'análise estruturada gerada pelo Claude (atributos visuais/copy) e '
  'transcrição de áudio (Whisper) pra vídeos. Sync de metadado bruto '
  '(sync-meta) é separado do passo de análise (edge function própria) '
  'porque o segundo custa chamada de LLM/Whisper -- não precisa rodar '
  'toda vez que o metadado é atualizado, só quando o criativo muda '
  '(creative_id novo) ou ainda não foi analisado.';

alter table public.meta_ad_creative_analysis enable row level security;

create policy "approved_user_gate" on public.meta_ad_creative_analysis
  for all using (private.is_approved_user());

create policy "read authenticated" on public.meta_ad_creative_analysis
  for select using (true);
