-- ============================================================
-- Pares identificados por pessoa (2026-11-25)
--
-- Alguns pedidos de empresa (o primeiro foi Caroline Atlas Brasil) chegam
-- com uma planilha de funcionários: cada par tem dono, filial e setor. Essa
-- lista não cabe na ficha do GHL, então fica aqui, uma linha por par.
--
-- Um negócio com linhas nesta tabela muda de comportamento no Cadastro ERP:
--   • a grade do pedido vem da soma destas linhas, não da ficha do GHL;
--   • a etiqueta de cada par leva nome, filial e setor;
--   • o romaneio separa as caixas por filial + setor.
-- Negócio sem linhas aqui segue o fluxo de sempre.
--
-- Linha sem nome = par extra: sai com a etiqueta normal e vai para as
-- caixas de "Extras" no romaneio.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.erp_pares_identificados (
  id BIGSERIAL PRIMARY KEY,
  deal_id TEXT NOT NULL,
  -- Numeração da variação no Tiny (ex.: "37/38"), já agrupada.
  numeracao TEXT NOT NULL,
  nome TEXT,
  filial TEXT,
  setor TEXT,
  -- Código do funcionário na planilha do cliente.
  codigo INTEGER,
  -- Número informado pela pessoa (ex.: 37), antes do agrupamento.
  tamanho_original INTEGER,
  ordem INTEGER NOT NULL,
  importado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT erp_pares_identificados_pessoa_completa
    CHECK (nome IS NULL OR (filial IS NOT NULL AND setor IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS erp_pares_identificados_deal_idx
  ON public.erp_pares_identificados (deal_id, ordem);

-- Só o servidor (service role) lê e grava: há nomes de funcionários do cliente.
ALTER TABLE public.erp_pares_identificados ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_pares_identificados TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.erp_pares_identificados_id_seq TO service_role;
