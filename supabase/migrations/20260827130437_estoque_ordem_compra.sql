-- Ordens de compra de insumo (hoje solado; a tabela nasce genérica).
-- Vivem aqui e não no Tiny: o dashboard é quem gera a OC, e "a caminho" é
-- consequência direta dela — pedido menos recebido.
create table if not exists public.ordem_compra (
  id uuid primary key default gen_random_uuid(),
  -- Número junto ao fornecedor (ex.: "1908"). Não é chave: pode repetir entre
  -- fornecedores e pode ainda não existir quando a OC é rascunhada aqui.
  numero text,
  fornecedor text not null default 'INPU',
  emitida_em date not null default current_date,
  -- Previsão de chegada informada pelo fornecedor.
  prevista_para date,
  observacao text,
  -- OC cancelada sai da conta de "a caminho" sem perder o histórico.
  cancelada_em timestamptz,
  criada_por uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ordem_compra_item (
  id uuid primary key default gen_random_uuid(),
  ordem_compra_id uuid not null
    references public.ordem_compra (id) on delete cascade,
  cor text not null check (cor in ('Preto', 'Branco')),
  numeracao text not null check (numeracao ~ '^\d{2}/\d{2}$'),
  pares_pedidos integer not null check (pares_pedidos > 0),
  -- Entrega parcial é o caso normal: a OC 1908 veio em mais de um caminhão.
  pares_recebidos integer not null default 0 check (pares_recebidos >= 0),
  constraint recebido_nao_passa_do_pedido
    check (pares_recebidos <= pares_pedidos),
  constraint item_unico_por_oc unique (ordem_compra_id, cor, numeracao)
);

create index if not exists ordem_compra_item_oc_idx
  on public.ordem_compra_item (ordem_compra_id);
create index if not exists ordem_compra_aberta_idx
  on public.ordem_compra (cancelada_em) where cancelada_em is null;

alter table public.ordem_compra enable row level security;
alter table public.ordem_compra_item enable row level security;

create policy approved_user_gate on public.ordem_compra
  for all to authenticated
  using ((select private.is_approved_user()))
  with check ((select private.is_approved_user()));

create policy approved_user_gate on public.ordem_compra_item
  for all to authenticated
  using ((select private.is_approved_user()))
  with check ((select private.is_approved_user()));
