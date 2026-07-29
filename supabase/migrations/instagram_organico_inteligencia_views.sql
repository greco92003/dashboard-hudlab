-- ============================================================
-- Instagram Orgânico - Inteligência - Views
-- ============================================================

-- Performance agregada por trilha: nota média do Auditor + métricas
-- reais da mídia (v_ig_media_latest), com contagem -- é o principal
-- input de dado pro Estrategista decidir o mix de trilhas da semana.
create or replace view public.v_ig_trilha_performance
with (security_invoker = true) as
select
  a.trilha,
  count(*) as qtd_auditorias,
  round(avg(a.nota), 2) as nota_media,
  round(avg(l.engagement_rate), 4) as engagement_rate_medio,
  round(avg(l.save_rate), 4) as save_rate_medio,
  round(avg(l.share_rate), 4) as share_rate_medio,
  max(l.timestamp) as ultima_publicacao,
  sum(case when cs.status = 'seguida' then 1 else 0 end) as qtd_sugestoes_seguidas,
  sum(case when cs.status = 'nao_seguida' then 1 else 0 end) as qtd_sugestoes_nao_seguidas
from public.ig_auditorias a
join public.v_ig_media_latest l on l.id = a.media_id
left join public.ig_calendario_semanal cs on cs.id = a.sugestao_id
group by a.trilha;

comment on view public.v_ig_trilha_performance is
  'Performance agregada por trilha de conteúdo (nota do Auditor + métricas reais + adesão às sugestões) -- input central do Estrategista pra decidir mix da semana.';
