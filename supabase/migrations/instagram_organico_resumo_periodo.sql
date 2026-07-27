-- Resumo agregado por tipo de mídia (Reels/Posts/Stories), período
-- atual vs período anterior de mesma duração -- mesma régua de
-- get_resumo_periodo (meta_ghl_bi), adaptada pro Instagram Orgânico.
-- Coorte = mídia PUBLICADA no período (timestamp), métricas = totais
-- acumulados até agora (view v_ig_media_latest).
create or replace function public.get_instagram_resumo_periodo(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_dias int := p_fim - p_inicio;
  v_fim_ant date := p_inicio - 1;
  v_inicio_ant date := v_fim_ant - v_dias;
  v_atual jsonb;
  v_anterior jsonb;
begin
  select coalesce(jsonb_object_agg(tipo, dados), '{}'::jsonb) into v_atual
  from (
    select
      media_product_type as tipo,
      jsonb_build_object(
        'qtd', count(*),
        'views', coalesce(sum(views), 0),
        'reach', coalesce(sum(reach), 0),
        'likes', coalesce(sum(likes), 0),
        'comments', coalesce(sum(comments), 0),
        'saved', coalesce(sum(saved), 0),
        'shares', coalesce(sum(shares), 0),
        'total_interactions', coalesce(sum(total_interactions), 0),
        'engagement_rate', case when sum(reach) > 0 then round(sum(total_interactions)::numeric / sum(reach), 4) end
      ) as dados
    from public.v_ig_media_latest
    where timestamp::date between p_inicio and p_fim
    group by media_product_type
  ) t;

  select coalesce(jsonb_object_agg(tipo, dados), '{}'::jsonb) into v_anterior
  from (
    select
      media_product_type as tipo,
      jsonb_build_object(
        'qtd', count(*),
        'views', coalesce(sum(views), 0),
        'reach', coalesce(sum(reach), 0),
        'likes', coalesce(sum(likes), 0),
        'comments', coalesce(sum(comments), 0),
        'saved', coalesce(sum(saved), 0),
        'shares', coalesce(sum(shares), 0),
        'total_interactions', coalesce(sum(total_interactions), 0),
        'engagement_rate', case when sum(reach) > 0 then round(sum(total_interactions)::numeric / sum(reach), 4) end
      ) as dados
    from public.v_ig_media_latest
    where timestamp::date between v_inicio_ant and v_fim_ant
    group by media_product_type
  ) t;

  return jsonb_build_object(
    'atual', v_atual,
    'anterior', v_anterior,
    'periodo_atual', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'periodo_anterior', jsonb_build_object('inicio', v_inicio_ant, 'fim', v_fim_ant)
  );
end;
$$;

comment on function public.get_instagram_resumo_periodo(date, date) is
  'Resumo agregado por tipo de mídia (REELS/FEED/STORY): totais do período atual vs período anterior de mesma duração, coorte = timestamp de publicação. Fonte da aba Visão Geral de /instagram-organico.';
