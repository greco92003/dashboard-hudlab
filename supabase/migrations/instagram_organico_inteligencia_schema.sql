-- ============================================================
-- Instagram Orgânico - Inteligência (Auditor + Estrategista)
-- Ciclo semanal: Auditor avalia o que foi publicado (número +
-- imagem/legenda), Estrategista sugere a semana seguinte com base
-- na performance por trilha. Sem agente permanente, sem orquestrador
-- -- só 2 chamadas à API da Anthropic por semana, via edge function
-- ig-inteligencia (mesmo padrão de phase do sync-instagram).
-- ============================================================

-- Saída do Estrategista: 1 linha por peça sugerida pra semana.
-- Trilha é a unidade de decisão de mix (bastidores, colab/cliente,
-- humor/meme, CTA padrão, tendência) -- não "toda peça vem de uma
-- narrativa aprovada", a maioria vem de rotina validada por dado.
create table if not exists public.ig_calendario_semanal (
  id                  bigserial primary key,
  semana_inicio       date not null,
  dia_planejado       date not null,
  media_product_type  text not null,
  trilha              text not null,
  descricao_imagem    text,
  legenda             text,
  cta                 text,
  roteiro             text,
  justificativa       text not null,
  status              text not null default 'pendente',
  matched_media_id    text references public.ig_media(id),
  gerado_por          text,
  criado_em           timestamptz not null default now()
);

comment on table public.ig_calendario_semanal is
  'Calendário semanal sugerido pelo Estrategista. status: pendente|seguida|nao_seguida -- casamento com matched_media_id é decidido pelo Auditor por semelhança semântica, sem marcação manual.';

-- Saída do Auditor: 1 linha por mídia avaliada. trilha é atribuída
-- mesmo quando não há sugestão correspondente, pra sempre alimentar
-- o histórico de performance por trilha (v_ig_trilha_performance).
create table if not exists public.ig_auditorias (
  id                  bigserial primary key,
  media_id            text not null references public.ig_media(id),
  sugestao_id         bigint references public.ig_calendario_semanal(id),
  trilha              text not null,
  nota                numeric(4,2),
  resumo              text not null,
  pontos_fortes       text,
  pontos_fracos       text,
  gerado_por          text,
  criado_em           timestamptz not null default now(),
  unique (media_id)
);

comment on table public.ig_auditorias is
  'Auditoria por mídia (nota 0-10, evidência, trilha) -- gerada com legenda + imagem/thumbnail via Anthropic Messages API. Uma linha por media_id (upsert em re-execução).';

create index if not exists idx_ig_calendario_semana on public.ig_calendario_semanal (semana_inicio);
create index if not exists idx_ig_calendario_status on public.ig_calendario_semanal (status);
create index if not exists idx_ig_auditorias_trilha on public.ig_auditorias (trilha);

alter table public.ig_calendario_semanal enable row level security;
alter table public.ig_auditorias enable row level security;

drop policy if exists "read authenticated" on public.ig_calendario_semanal;
create policy "read authenticated" on public.ig_calendario_semanal
  for select to authenticated using (true);

drop policy if exists "read authenticated" on public.ig_auditorias;
create policy "read authenticated" on public.ig_auditorias
  for select to authenticated using (true);
