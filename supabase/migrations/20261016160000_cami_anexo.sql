-- ============================================================
-- Anexo de atendimento da Cami ("Ensinar a Cami", parte 2).
--
-- ai_seller_annex: cada versão do anexo. Toda segunda (ou na hora, com
--   feedback urgente) a IA reescreve o anexo inteiro a partir dos feedbacks
--   pendentes e grava um rascunho; o dono aprova (publicado) ou descarta.
--   Em vigor = o último publicado.
--
-- O anexo substitui as Regras da casa: as regras ligadas viram o anexo
-- inicial, já publicado, para a Cami não perder nada do que o dono aprovou.
-- As tabelas ai_seller_rules e ai_seller_references ficam como estão (sem uso).
--
-- Leitura: aprovados. Escrita: só pelo servidor, depois de conferir o dono.
-- ============================================================

create table if not exists public.ai_seller_annex (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'publicado', 'descartado', 'substituido')),
  origem text not null check (origem in ('semanal', 'urgente', 'manual', 'inicial')),
  -- [{texto, estado: novo|ajustado|mantido|removido, antes, motivo, feedbackIds, exemplo}]
  itens jsonb not null default '[]',
  -- política comercial apontada nos feedbacks (preço, frete, prazo): muda no manual, não no anexo
  para_o_manual text[] not null default '{}',
  resumo text,
  feedback_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  published_at timestamptz
);

create index if not exists ai_seller_annex_status_idx on public.ai_seller_annex (status, published_at desc, created_at desc);

alter table public.ai_seller_annex enable row level security;
drop policy if exists "read authenticated" on public.ai_seller_annex;
create policy "read authenticated" on public.ai_seller_annex for select to authenticated using (true);
drop policy if exists approved_user_gate on public.ai_seller_annex;
create policy approved_user_gate on public.ai_seller_annex as restrictive for all to authenticated
  using ((select private.is_approved_user())) with check ((select private.is_approved_user()));
revoke all on table public.ai_seller_annex from anon;

-- Anexo inicial: as regras da casa ligadas hoje, na ordem em que foram criadas.
insert into public.ai_seller_annex (status, origem, itens, resumo, published_at, decided_at)
select
  'publicado',
  'inicial',
  jsonb_agg(
    jsonb_build_object('texto', texto, 'estado', 'mantido', 'antes', null, 'motivo', null, 'feedbackIds', '[]'::jsonb)
    order by created_at
  ),
  'Regras da casa que estavam ligadas quando o anexo começou.',
  now(),
  now()
from public.ai_seller_rules
where ativa
having count(*) > 0
  and not exists (select 1 from public.ai_seller_annex);
