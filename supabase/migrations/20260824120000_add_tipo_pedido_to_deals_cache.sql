-- Campo "Tipo do Pedido" do GHL (opportunity.tipo_do_pedido, SINGLE_OPTIONS).
-- Valores: Evento | Amostra | Pedido | Reposição. Fica NULL enquanto o time não
-- preencher o campo no CRM — as telas /programacao e /expedicao mostram "Sem tipo".
ALTER TABLE deals_cache
ADD COLUMN IF NOT EXISTS tipo_pedido TEXT;

COMMENT ON COLUMN deals_cache.tipo_pedido IS
  'GHL opportunity.tipo_do_pedido (Evento | Amostra | Pedido | Reposição)';

-- A /programacao e a /expedicao filtram por etapa e ordenam por tipo dentro do dia.
CREATE INDEX IF NOT EXISTS idx_deals_cache_tipo_pedido
  ON deals_cache (tipo_pedido)
  WHERE tipo_pedido IS NOT NULL;
