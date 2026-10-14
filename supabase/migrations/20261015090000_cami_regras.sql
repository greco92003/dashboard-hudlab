-- ============================================================
-- Regras da casa e conversas de referência da Cami
-- (spec 2026-10-14-cami-intelligence-design, PR 3).
--
-- ai_seller_rules: instruções curtas que o owner escreve no dashboard e que
--   entram nas instruções da Cami acima do manual (até 15 ativas).
-- ai_seller_references: fotos de conversas (até uma mensagem do cliente)
--   para testar a Cami antes de ligar uma regra.
--
-- Leitura: aprovados. Escrita: só pelo servidor, depois de conferir o owner.
-- ============================================================

create table if not exists public.ai_seller_rules (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (length(trim(texto)) between 5 and 600),
  ativa boolean not null default false,
  origem text not null default 'manual' check (origem in ('manual', 'correcao', 'sugestao')),
  contact_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_seller_references (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  boa_resposta text,
  contact_id text not null,
  messages jsonb not null,
  context jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['ai_seller_rules', 'ai_seller_references'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "read authenticated" on public.%I', t);
    execute format('create policy "read authenticated" on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists approved_user_gate on public.%I', t);
    execute format(
      'create policy approved_user_gate on public.%I as restrictive for all to authenticated '
      'using ((select private.is_approved_user())) with check ((select private.is_approved_user()))',
      t
    );
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;
