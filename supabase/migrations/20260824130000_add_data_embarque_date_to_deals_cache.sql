-- deals_cache.data_embarque é TEXT porque o campo equivalente no GHL é texto
-- livre (dd/mm/aaaa), com registros migrados do ActiveCampaign em aaaa-mm-dd e
-- pelo menos um valor com espaço na frente. Ordenar ou recortar período por
-- essa coluna em SQL dá resultado lexicográfico errado ("01/09" antes de
-- "24/08"), então as telas precisavam trazer tudo e ordenar em JS.
--
-- Esta coluna guarda a mesma data já convertida. É preenchida pelo sync do GHL
-- (lib/ghl/deals-cache.ts) e não por GENERATED ALWAYS porque to_date() depende
-- do DateStyle da sessão e o Postgres a recusa como expressão gerada.
ALTER TABLE deals_cache
ADD COLUMN IF NOT EXISTS data_embarque_date DATE;

COMMENT ON COLUMN deals_cache.data_embarque_date IS
  'data_embarque convertida para DATE pelo sync (NULL quando o texto não é uma data válida)';

-- A /expedicao recorta os recebidos por janela de embarque.
CREATE INDEX IF NOT EXISTS idx_deals_cache_data_embarque_date
  ON deals_cache (data_embarque_date)
  WHERE data_embarque_date IS NOT NULL;
