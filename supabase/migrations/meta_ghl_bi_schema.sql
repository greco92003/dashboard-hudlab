-- ============================================================
-- BI Meta Ads x GoHighLevel - Schema base
-- (já aplicado no projeto Dashboard-v2 via MCP em 2026-07-21;
--  mantido aqui para versionamento)
-- Tabelas de ETL, normalização de UF, RLS e índices.
-- ============================================================

-- Função de normalização de estado -> sigla UF
-- Aceita nomes com/sem acento, case-insensitive, e siglas prontas.
create or replace function public.normalize_uf(p_region text)
returns char(2)
language plpgsql
immutable
as $$
declare
  v text;
begin
  if p_region is null or btrim(p_region) = '' then
    return null;
  end if;

  v := lower(btrim(p_region));
  v := translate(v, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');

  if length(v) = 2 then
    v := upper(v);
    if v in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
             'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') then
      return v;
    end if;
    return null;
  end if;

  return case v
    when 'acre' then 'AC'
    when 'alagoas' then 'AL'
    when 'amapa' then 'AP'
    when 'amazonas' then 'AM'
    when 'bahia' then 'BA'
    when 'ceara' then 'CE'
    when 'distrito federal' then 'DF'
    when 'espirito santo' then 'ES'
    when 'goias' then 'GO'
    when 'maranhao' then 'MA'
    when 'mato grosso' then 'MT'
    when 'mato grosso do sul' then 'MS'
    when 'minas gerais' then 'MG'
    when 'para' then 'PA'
    when 'paraiba' then 'PB'
    when 'parana' then 'PR'
    when 'pernambuco' then 'PE'
    when 'piaui' then 'PI'
    when 'rio de janeiro' then 'RJ'
    when 'rio grande do norte' then 'RN'
    when 'rio grande do sul' then 'RS'
    when 'rondonia' then 'RO'
    when 'roraima' then 'RR'
    when 'santa catarina' then 'SC'
    when 'sao paulo' then 'SP'
    when 'sergipe' then 'SE'
    when 'tocantins' then 'TO'
    when 'state of sao paulo' then 'SP'
    when 'state of rio de janeiro' then 'RJ'
    when 'federal district' then 'DF'
    else null
  end;
end;
$$;

comment on function public.normalize_uf(text) is
  'Normaliza nome de estado brasileiro (com/sem acento, sigla) para UF. NULL se não reconhecer.';

-- Métricas diárias do Meta por anúncio e região
create table if not exists public.meta_insights_daily (
  date          date not null,
  account_id    text,
  campaign_id   text,
  campaign_name text,
  adset_id      text,
  adset_name    text,
  ad_id         text not null,
  ad_name       text,
  region        text not null,
  uf            char(2),
  spend         numeric(12,2) default 0,
  impressions   bigint default 0,
  clicks        bigint default 0,
  link_clicks   bigint default 0,
  leads         bigint default 0,
  cpm           numeric(12,4),
  cpc           numeric(12,4),
  cpl           numeric(12,4),
  synced_at     timestamptz default now(),
  primary key (date, ad_id, region)
);

comment on table public.meta_insights_daily is
  'Métricas diárias do Meta Ads por anúncio e região (breakdown region). Fonte: Graph API /insights.';

-- Contatos do GoHighLevel com UTMs de atribuição
create table if not exists public.ghl_contacts (
  id           text primary key,
  created_at   timestamptz,
  first_name   text,
  last_name    text,
  email        text,
  phone        text,
  city         text,
  state        text,
  uf           char(2),
  source       text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_term     text,
  utm_content  text,
  fbclid       text,
  ad_id        text generated always as (utm_content) stored,
  raw          jsonb,
  synced_at    timestamptz default now()
);

comment on table public.ghl_contacts is
  'Contatos do GoHighLevel. ad_id (= utm_content) faz o join exato com meta_insights_daily.ad_id.';

-- Oportunidades/vendas do GHL
create table if not exists public.ghl_opportunities (
  id             text primary key,
  contact_id     text references public.ghl_contacts(id) on delete set null,
  pipeline_id    text,
  pipeline_name  text,
  stage_id       text,
  stage_name     text,
  status         text,
  monetary_value numeric(12,2),
  created_at     timestamptz,
  updated_at     timestamptz,
  won_at         timestamptz,
  raw            jsonb,
  synced_at      timestamptz default now()
);

comment on table public.ghl_opportunities is
  'Oportunidades do GoHighLevel. Venda = status won com monetary_value preenchido.';

-- Auditoria das execuções de sync
create table if not exists public.sync_log (
  id            bigserial primary key,
  source        text not null,
  started_at    timestamptz,
  finished_at   timestamptz,
  rows_upserted int,
  status        text,
  error         text
);

-- UF -> região IBGE
create table if not exists public.dim_region_group (
  uf           char(2) primary key,
  region_group text not null,
  season_note  text
);

insert into public.dim_region_group (uf, region_group) values
  ('RS','Sul'), ('SC','Sul'), ('PR','Sul'),
  ('SP','Sudeste'), ('RJ','Sudeste'), ('MG','Sudeste'), ('ES','Sudeste'),
  ('MT','Centro-Oeste'), ('MS','Centro-Oeste'), ('GO','Centro-Oeste'), ('DF','Centro-Oeste'),
  ('BA','Nordeste'), ('SE','Nordeste'), ('AL','Nordeste'), ('PE','Nordeste'),
  ('PB','Nordeste'), ('RN','Nordeste'), ('CE','Nordeste'), ('PI','Nordeste'), ('MA','Nordeste'),
  ('TO','Norte'), ('PA','Norte'), ('AP','Norte'), ('RR','Norte'),
  ('AM','Norte'), ('AC','Norte'), ('RO','Norte')
on conflict (uf) do nothing;

-- Triggers de normalização de UF
create or replace function public.trg_fill_uf_meta()
returns trigger language plpgsql as $$
begin
  new.uf := public.normalize_uf(new.region);
  return new;
end; $$;

create or replace function public.trg_fill_uf_ghl()
returns trigger language plpgsql as $$
begin
  new.uf := public.normalize_uf(new.state);
  return new;
end; $$;

drop trigger if exists fill_uf on public.meta_insights_daily;
create trigger fill_uf before insert or update on public.meta_insights_daily
  for each row execute function public.trg_fill_uf_meta();

drop trigger if exists fill_uf on public.ghl_contacts;
create trigger fill_uf before insert or update on public.ghl_contacts
  for each row execute function public.trg_fill_uf_ghl();

-- Índices de join e filtro
create index if not exists idx_mid_date on public.meta_insights_daily (date);
create index if not exists idx_mid_ad_id on public.meta_insights_daily (ad_id);
create index if not exists idx_mid_uf on public.meta_insights_daily (uf);
create index if not exists idx_ghlc_ad_id on public.ghl_contacts (ad_id);
create index if not exists idx_ghlc_created_at on public.ghl_contacts (created_at);
create index if not exists idx_ghlc_uf on public.ghl_contacts (uf);
create index if not exists idx_ghlo_contact_id on public.ghl_opportunities (contact_id);
create index if not exists idx_ghlo_status on public.ghl_opportunities (status);
create index if not exists idx_ghlo_won_at on public.ghl_opportunities (won_at);

-- RLS: leitura para authenticated, escrita apenas service_role
alter table public.meta_insights_daily enable row level security;
alter table public.ghl_contacts enable row level security;
alter table public.ghl_opportunities enable row level security;
alter table public.sync_log enable row level security;
alter table public.dim_region_group enable row level security;

drop policy if exists "read authenticated" on public.meta_insights_daily;
create policy "read authenticated" on public.meta_insights_daily
  for select to authenticated using (true);

drop policy if exists "read authenticated" on public.ghl_contacts;
create policy "read authenticated" on public.ghl_contacts
  for select to authenticated using (true);

drop policy if exists "read authenticated" on public.ghl_opportunities;
create policy "read authenticated" on public.ghl_opportunities
  for select to authenticated using (true);

drop policy if exists "read authenticated" on public.sync_log;
create policy "read authenticated" on public.sync_log
  for select to authenticated using (true);

drop policy if exists "read authenticated" on public.dim_region_group;
create policy "read authenticated" on public.dim_region_group
  for select to authenticated using (true);
