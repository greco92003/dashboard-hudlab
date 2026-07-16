-- Transportadoras integradas via API (ex.: Braspress) ganham uma linha em
-- freight_carriers para guardar dados de contato editáveis (telefone, e-mail...).
-- api_slug != null identifica essas linhas; elas ficam fora da lista normal de
-- transportadoras de tabela e não participam do motor de cotação por tabelas.

alter table public.freight_carriers
  add column if not exists api_slug text;

create unique index if not exists freight_carriers_api_slug_key
  on public.freight_carriers (api_slug)
  where api_slug is not null;

insert into public.freight_carriers (name, api_slug, website)
select 'Braspress', 'braspress', 'https://www.braspress.com'
where not exists (
  select 1 from public.freight_carriers where api_slug = 'braspress'
);
