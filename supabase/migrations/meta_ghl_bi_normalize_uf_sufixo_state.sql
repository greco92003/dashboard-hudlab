-- ============================================================
-- normalize_uf: reconhecer sufixo "(state)"/"(city)" do Meta
-- (já aplicado no projeto Dashboard-v2 via MCP em 2026-07-21)
--
-- Bug: o Meta retorna "São Paulo (state)" e "Rio de Janeiro (state)"
-- para diferenciar do nome da cidade (que tem o mesmo nome do
-- estado). normalize_uf não tratava esse sufixo em inglês, então
-- R$1.970,20 de investimento (143 linhas, 2 estados) ficava com
-- uf = NULL e sumia de todas as views regionais (v_desempenho_uf_mes,
-- v_sazonalidade_regiao) — o total de investimento por região não
-- batia com o investimento total do período.
-- ============================================================
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
  -- Meta usa "(state)"/"(city)" para desambiguar região de cidade
  -- homônima (ex: "Sao Paulo (state)" vs a cidade "Sao Paulo")
  v := trim(regexp_replace(v, '\s*\((state|city)\)\s*$', ''));

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

-- Backfill: recalcula uf para linhas já gravadas antes do fix
update public.meta_insights_daily
set uf = public.normalize_uf(region)
where uf is null;
