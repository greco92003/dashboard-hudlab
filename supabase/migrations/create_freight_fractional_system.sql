-- ─────────────────────────────────────────────────────────────────────────────
-- Freight fractional-table quotation system
--
-- Extends the existing freight module (freight_carriers / freight_volumes) with a
-- realistic fractional-freight ("frete fracionado") pricing model:
--   • freight_carrier_tables  → a versioned price table for a carrier
--   • freight_lanes           → one row per rota (origin praça → destination praça)
--   • freight_weight_brackets → weight brackets (faixas de peso) per lane
--   • freight_coverage        → served cities (praças): transit time + interior TDA
--
-- Origin is fixed by the client (Nova Hartz-RS → carrier filial NOVO HAMBURGO-93300),
-- stored on the table as origin_label.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Carrier price tables (versioned) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS freight_carrier_tables (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  carrier_id UUID NOT NULL REFERENCES freight_carriers(id) ON DELETE CASCADE,

  name TEXT NOT NULL,                          -- ex: "Tabela 1/A — 2026"
  origin_label TEXT,                           -- ex: "NOVO HAMBURGO-93300"

  cubage_kg_per_m3 NUMERIC NOT NULL DEFAULT 300, -- regra de cubagem (1 m³ = 300 kg)
  icms_rate NUMERIC NOT NULL DEFAULT 0.12,       -- alíquota ICMS padrão (fração) p/ gross-up

  valid_from DATE,
  valid_to DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_freight_carrier_tables_carrier ON freight_carrier_tables(carrier_id);
CREATE INDEX IF NOT EXISTS idx_freight_carrier_tables_active ON freight_carrier_tables(active);

-- ── Lanes (rotas) ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS freight_lanes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id UUID NOT NULL REFERENCES freight_carrier_tables(id) ON DELETE CASCADE,

  origin_city TEXT,
  origin_cep_prefix TEXT,
  dest_city TEXT NOT NULL,
  dest_cep_prefix TEXT NOT NULL DEFAULT '',    -- normalized (digits, left-padded to 5)
  dest_uf TEXT,

  -- fee components (fractions for %, absolute R$ otherwise)
  excess_per_ton NUMERIC NOT NULL DEFAULT 0,   -- p/Tonelada (acima da última faixa)
  advalorem_pct NUMERIC NOT NULL DEFAULT 0,    -- Frete Valor: % s/ valor NF (0.004 = 0,40%)
  toll_per_100kg NUMERIC NOT NULL DEFAULT 0,   -- Pedágio: p/ cada 100 kg
  fee_up_to_50 NUMERIC NOT NULL DEFAULT 0,     -- Taxas: até 50 kg (fixo)
  fee_above_50 NUMERIC NOT NULL DEFAULT 0,     -- Taxas: + de 50 kg (fixo)
  gris_pct NUMERIC NOT NULL DEFAULT 0,         -- GRIS: % s/ valor NF (0.00002 = 0,0020%)
  ta_value NUMERIC NOT NULL DEFAULT 0,         -- TA (fixo)

  min_price NUMERIC,                           -- frete mínimo (opcional)
  icms_rate NUMERIC,                           -- override da alíquota ICMS por rota (opcional)
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE (table_id, dest_city, dest_cep_prefix)
);

CREATE INDEX IF NOT EXISTS idx_freight_lanes_table ON freight_lanes(table_id);
CREATE INDEX IF NOT EXISTS idx_freight_lanes_dest_cep ON freight_lanes(dest_cep_prefix);
CREATE INDEX IF NOT EXISTS idx_freight_lanes_dest_city ON freight_lanes(dest_city);

-- ── Weight brackets (faixas de peso) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS freight_weight_brackets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lane_id UUID NOT NULL REFERENCES freight_lanes(id) ON DELETE CASCADE,

  max_weight_kg NUMERIC NOT NULL,              -- teto da faixa (10, 20, 30, 50, 70, 100…)
  price NUMERIC NOT NULL,                       -- valor do frete-peso nessa faixa

  UNIQUE (lane_id, max_weight_kg)
);

CREATE INDEX IF NOT EXISTS idx_freight_weight_brackets_lane ON freight_weight_brackets(lane_id);

-- ── Coverage (relação de praças) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS freight_coverage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  carrier_id UUID NOT NULL REFERENCES freight_carriers(id) ON DELETE CASCADE,

  city TEXT NOT NULL,
  uf TEXT,
  cep_prefix TEXT,                             -- coluna PERC (pode ser CEP ou zona, ex "CENTRO")
  filial TEXT,
  km NUMERIC,
  frequency TEXT,                              -- FREQUÊNCIA (ex: "Diário", "2 x / sem")
  prazo_min INT,                               -- prazo mínimo (dias)
  prazo_max INT,                               -- prazo máximo (dias)
  tda_value NUMERIC,                           -- Taxa de Dificuldade de Acesso (fixo, opcional)
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE (carrier_id, city, uf)
);

CREATE INDEX IF NOT EXISTS idx_freight_coverage_carrier ON freight_coverage(carrier_id);
CREATE INDEX IF NOT EXISTS idx_freight_coverage_city ON freight_coverage(city);

-- ── RLS (mirrors existing freight module: any authenticated user) ─────────────
ALTER TABLE freight_carrier_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_lanes ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_weight_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_coverage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'freight_carrier_tables' AND policyname = 'freight_carrier_tables_authenticated_all') THEN
    CREATE POLICY "freight_carrier_tables_authenticated_all" ON freight_carrier_tables FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'freight_lanes' AND policyname = 'freight_lanes_authenticated_all') THEN
    CREATE POLICY "freight_lanes_authenticated_all" ON freight_lanes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'freight_weight_brackets' AND policyname = 'freight_weight_brackets_authenticated_all') THEN
    CREATE POLICY "freight_weight_brackets_authenticated_all" ON freight_weight_brackets FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'freight_coverage' AND policyname = 'freight_coverage_authenticated_all') THEN
    CREATE POLICY "freight_coverage_authenticated_all" ON freight_coverage FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── updated_at triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION freight_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_freight_carrier_tables_updated_at ON freight_carrier_tables;
CREATE TRIGGER trg_freight_carrier_tables_updated_at BEFORE UPDATE ON freight_carrier_tables
  FOR EACH ROW EXECUTE FUNCTION freight_set_updated_at();

DROP TRIGGER IF EXISTS trg_freight_lanes_updated_at ON freight_lanes;
CREATE TRIGGER trg_freight_lanes_updated_at BEFORE UPDATE ON freight_lanes
  FOR EACH ROW EXECUTE FUNCTION freight_set_updated_at();

DROP TRIGGER IF EXISTS trg_freight_coverage_updated_at ON freight_coverage;
CREATE TRIGGER trg_freight_coverage_updated_at BEFORE UPDATE ON freight_coverage
  FOR EACH ROW EXECUTE FUNCTION freight_set_updated_at();

COMMENT ON TABLE freight_carrier_tables IS 'Versioned fractional-freight price table for a carrier (frete fracionado).';
COMMENT ON TABLE freight_lanes IS 'One rota (origin praça → destination praça) with its fee components.';
COMMENT ON TABLE freight_weight_brackets IS 'Weight brackets (faixas de peso) with price, per lane.';
COMMENT ON TABLE freight_coverage IS 'Served cities (relação de praças): transit time and interior access surcharge (TDA).';
