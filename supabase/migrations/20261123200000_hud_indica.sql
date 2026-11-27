-- ============================================================
-- Hud Indica (23/11/2026): programa de indicação do pós-venda.
-- hud_indica_indicadores: quem recebeu o link pessoal (tocou em "Nota 10!" na
-- pesquisa pós-entrega ou foi incluído à mão). hud_indica_indicacoes: cada lead
-- que chegou pelo código (ou com "Indicado por" preenchido) e o caminho até o
-- prêmio de R$ 100 no Pix: recebida → fechou → liberada → paga.
-- A chave Pix fica no contato do GHL (contact.chave_pix); aqui só o status.
-- Só o servidor do dashboard lê e grava (chave secreta): RLS ligado sem
-- políticas e sem acesso para anon/authenticated.
-- ============================================================

create table if not exists public.hud_indica_indicadores (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null unique,
  nome text,
  codigo text not null unique,
  link text not null,
  -- Resposta da pesquisa de 3 botões: 'Nota 10', 'Ficou ok' ou 'Tive um problema'.
  satisfacao text check (satisfacao in ('Nota 10', 'Ficou ok', 'Tive um problema')),
  satisfacao_em timestamptz,
  origem text not null default 'pesquisa' check (origem in ('pesquisa', 'manual')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.hud_indica_indicacoes (
  id uuid primary key default gen_random_uuid(),
  indicador_id uuid not null references public.hud_indica_indicadores (id),
  -- Um indicado conta uma vez só (o primeiro código que trouxe o contato).
  indicado_contact_id text not null unique,
  indicado_nome text,
  origem text not null default 'link' check (origem in ('link', 'manual')),
  status text not null default 'recebida'
    check (status in ('recebida', 'invalida', 'fechou', 'liberada', 'paga', 'expirada', 'cancelada')),
  motivo text,
  oportunidade_id text,
  empresa text,
  cnpj text,
  pares integer,
  valor_centavos bigint,
  forma_pagamento text,
  frete_gratis boolean not null default true,
  premio_centavos integer not null default 10000,
  -- Aviso para quem indicou (M3b) já inscrito no workflow.
  aviso_chegada_em timestamptz,
  fechou_em timestamptz,
  liberado_em timestamptz,
  pago_em timestamptz,
  pago_por uuid,
  -- A indicação vale por 60 dias a partir do primeiro contato do indicado.
  expira_em timestamptz not null default (now() + interval '60 days'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists hud_indica_indicacoes_indicador_idx on public.hud_indica_indicacoes (indicador_id, criado_em);
create index if not exists hud_indica_indicacoes_status_idx on public.hud_indica_indicacoes (status);
create index if not exists hud_indica_indicacoes_oportunidade_idx on public.hud_indica_indicacoes (oportunidade_id);

alter table public.hud_indica_indicadores enable row level security;
alter table public.hud_indica_indicacoes enable row level security;

revoke all on table public.hud_indica_indicadores from anon, authenticated;
revoke all on table public.hud_indica_indicacoes from anon, authenticated;
