-- ============================================================
-- Vínculo negócio do GHL → pedidos de venda no Tiny (2026-11-16)
--
-- O Cadastro ERP grava "GHL-<deal>" no número de e-commerce do pedido e
-- o talão/romaneio de /producao achava o pedido por esse campo. Só que o
-- Tiny apaga o número de e-commerce quando o pedido é faturado ou editado
-- na tela dele (levantamento de 16/11: 15 pedidos, 12 deles faturados), e a
-- API não filtra pela ordem de compra, onde a cópia sobrevive. Esta tabela
-- guarda o vínculo no momento da criação, para a busca não depender do Tiny.
--
-- Um negócio pode ter vários pedidos (recompra ou lotes no mesmo card do
-- GHL — 7 casos no levantamento); cada pedido pertence a um só negócio.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.erp_pedidos_venda (
  deal_id TEXT NOT NULL,
  tiny_pedido_id BIGINT NOT NULL UNIQUE,
  numero_pedido TEXT NOT NULL,
  cliente TEXT,
  -- 'cadastro-erp' (gravado na criação), 'tiny' (achado pela busca) ou 'script' (backfill).
  origem TEXT NOT NULL,
  vinculado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, tiny_pedido_id)
);

-- Só o servidor (service role) lê e grava.
ALTER TABLE public.erp_pedidos_venda ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.erp_pedidos_venda TO service_role;
