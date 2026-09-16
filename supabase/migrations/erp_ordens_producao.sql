-- ============================================================
-- Ordens de produção geradas pelo Cadastro ERP (2026-09-16)
--
-- A API do Tiny não lista ordens de produção nem diz se um pedido já tem
-- OP. Sem este registro, um segundo clique geraria OP duplicada. Guarda
-- também a conferência vendido × gerado, porque a regra da fábrica é
-- produzir exatamente o que foi vendido.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.erp_ordens_producao (
  tiny_pedido_id BIGINT PRIMARY KEY,
  numero_pedido TEXT NOT NULL,
  gerada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  gerada_por_email TEXT,
  conferida BOOLEAN NOT NULL,
  conferencia JSONB NOT NULL DEFAULT '{}'::jsonb,
  mensagem_tiny TEXT
);

-- Só o servidor (service role) lê e grava.
ALTER TABLE public.erp_ordens_producao ENABLE ROW LEVEL SECURITY;
