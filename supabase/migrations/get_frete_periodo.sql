-- ============================================================
-- Frete por par (2026-10-26)
--
-- Card "Frete por par" da Visão Geral do Meta Marketing. Mede quanto o frete
-- que a Hud Lab paga pesa em cada par vendido -- a métrica que decide, por
-- exemplo, baixar o frete grátis de 36 para 24 pares, como o ROAS geral
-- decide investir mais ou menos em campanha.
--
-- Campos da oportunidade no GHL (via deals_cache.provider_payload):
--   "Condição de Frete" (Frete Pago pelo Cliente | Frete Pago pela Empresa
--   (Frete Grátis)), "Valor do Frete Pago Hud Lab", "Valor do Frete Pago
--   Cliente". Os dois valores nunca vêm preenchidos juntos.
--
-- Tipo do frete: a Condição, quando preenchida; em branco, deduzido pelo
-- valor (Hud > 0 = grátis, cliente > 0 = cliente). Zero não é sinal: a
-- equipe grava R$ 0 no campo de quem não pagou. Mesma regra de
-- tipoDoFrete em lib/ghl/deal-fields.ts (aba Negócios).
--
-- Base (decidido com o usuário em 26/10/2026): entram as vendas com o frete
-- informado -- grátis COM valor da Hud, ou pago pelo cliente (Hud = 0). Grátis
-- sem valor e venda sem nada ficam fora do frete e dos pares (custo
-- desconhecido; entrar como zero puxaria o número para baixo) e voltam em
-- vendas_sem_frete para a tela avisar.
-- ============================================================

create or replace function public.get_frete_periodo(p_inicio date, p_fim date)
returns table (
  frete_hud numeric,
  pares_base bigint,
  pares_gratis bigint,
  faturamento_base numeric,
  frete_cliente numeric,
  vendas_sem_frete bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select
      p.monetary_value,
      coalesce(p.qty_pares, 0) as pares,
      nullif(btrim(d.provider_payload->>'ghl_condio_de_frete'), '') as cond,
      case when btrim(d.provider_payload->>'ghl_valor_do_frete_pago_hud_lab') ~ '^[0-9]+(\.[0-9]+)?$'
        then btrim(d.provider_payload->>'ghl_valor_do_frete_pago_hud_lab')::numeric end as hud,
      case when btrim(d.provider_payload->>'ghl_valor_do_frete_pago_cliente') ~ '^[0-9]+(\.[0-9]+)?$'
        then btrim(d.provider_payload->>'ghl_valor_do_frete_pago_cliente')::numeric end as cli
    from public.v_pedidos_ganhos p
    join public.deals_cache d on d.deal_id = p.id
    where p.dia_venda between p_inicio and p_fim
  ),
  com_tipo as (
    select
      v.*,
      case
        when cond ilike '%cliente%' then 'cliente'
        when cond is not null then 'gratis'
        when hud > 0 then 'gratis'
        when cli > 0 then 'cliente'
      end as tipo
    from v
  ),
  base as (
    select
      t.*,
      coalesce((t.tipo = 'gratis' and t.hud > 0) or t.tipo = 'cliente', false) as na_base
    from com_tipo t
  )
  select
    coalesce(sum(coalesce(hud, 0)) filter (where na_base), 0) as frete_hud,
    coalesce(sum(pares) filter (where na_base), 0)::bigint as pares_base,
    coalesce(sum(pares) filter (where tipo = 'gratis' and hud > 0), 0)::bigint as pares_gratis,
    coalesce(sum(monetary_value) filter (where na_base), 0) as faturamento_base,
    coalesce(sum(cli) filter (where tipo = 'cliente'), 0) as frete_cliente,
    count(*) filter (where not na_base) as vendas_sem_frete
  from base
$$;

-- Mesmo acesso das demais funções de relatório: só a rota
-- /api/meta-marketing/report (usuário aprovado, service_role).
revoke all on function public.get_frete_periodo(date, date) from public, anon, authenticated;
grant execute on function public.get_frete_periodo(date, date) to service_role;
