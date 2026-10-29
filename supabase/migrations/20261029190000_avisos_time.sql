-- ============================================================
-- Avisos do time no WhatsApp (29/10/2026).
--
-- avisos_time_enviados: cada clique de campanha (Quero Aproveitar, Ver
--   Tabela, Fazer Pedido, Consultar Prazo, aceite da Lista VIP) que já virou
--   aviso. A chave é a mensagem do cliente no GHL: o cron roda a cada 5 min
--   com sobreposição e não pode avisar o mesmo clique duas vezes.
-- avisos_time_estado: quando o cron rodou pela última vez (de onde a próxima
--   busca começa; a primeira do dia pega a noite).
--
-- Só o servidor lê e escreve (service role): RLS ligado e sem política.
-- ============================================================

create table if not exists public.avisos_time_enviados (
  message_id text primary key,
  contact_id text not null,
  status text not null default 'avisado',
  criado_em timestamptz not null default now()
);

create table if not exists public.avisos_time_estado (
  id smallint primary key default 1 check (id = 1),
  ultima_execucao timestamptz
);

alter table public.avisos_time_enviados enable row level security;
alter table public.avisos_time_estado enable row level security;
