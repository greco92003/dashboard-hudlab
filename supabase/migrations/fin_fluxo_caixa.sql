-- ============================================================
-- Fluxo de caixa: espelho do Tiny (2026-09-16)
--
-- O Tiny é a fonte oficial das contas a pagar/receber. Este espelho existe
-- para a tela abrir rápido (o Tiny limita ~120 req/min) e para a
-- conciliação cruzar extrato × contas no banco. Gravações vão ao Tiny e só
-- depois atualizam o espelho.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fin_contas (
  tipo TEXT NOT NULL CHECK (tipo IN ('pagar', 'receber')),
  tiny_id BIGINT NOT NULL,
  situacao TEXT NOT NULL,
  data_emissao DATE,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  valor NUMERIC(14, 2) NOT NULL DEFAULT 0,
  saldo NUMERIC(14, 2) NOT NULL DEFAULT 0,
  historico TEXT,
  numero_documento TEXT,
  contato_id BIGINT,
  contato_nome TEXT,
  contato_cpf_cnpj TEXT,
  categoria_id BIGINT,
  categoria_nome TEXT,
  forma_pagamento TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Assinatura dos campos da listagem; quando difere de detalhe_hash, o
  -- detalhe (categoria, data de pagamento) é buscado de novo.
  listagem_hash TEXT,
  detalhe_hash TEXT,
  -- Última sincronização que viu a conta; a poda apaga quem não foi visto.
  ultima_run BIGINT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tipo, tiny_id)
);

CREATE INDEX IF NOT EXISTS fin_contas_vencimento_idx ON public.fin_contas (data_vencimento);
CREATE INDEX IF NOT EXISTS fin_contas_situacao_idx ON public.fin_contas (situacao);

CREATE TABLE IF NOT EXISTS public.fin_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  origem TEXT NOT NULL,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminado_em TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'rodando' CHECK (status IN ('rodando', 'ok', 'erro')),
  contas_lidas INTEGER,
  contas_removidas INTEGER,
  detalhes_pendentes INTEGER,
  erro TEXT
);

CREATE INDEX IF NOT EXISTS fin_sync_runs_iniciado_idx ON public.fin_sync_runs (iniciado_em DESC);

-- Linha única. O saldo inicial vale para o começo do dia saldo_inicial_data;
-- é manual até o Sicredi ser conectado (fase 3).
CREATE TABLE IF NOT EXISTS public.fin_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  saldo_inicial NUMERIC(14, 2) NOT NULL DEFAULT 0,
  saldo_inicial_data DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_email TEXT
);

-- Só o servidor (service role) lê e grava.
ALTER TABLE public.fin_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_config ENABLE ROW LEVEL SECURITY;
