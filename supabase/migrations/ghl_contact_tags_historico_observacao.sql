-- ============================================================
-- Histórico de observação das tags de contato do GHL (2026-08-21)
--
-- Problema: as tags do follow-up (`follow_atendimento_d1`,
-- `follow_negociacao_m1`, ...) vivem em `ghl_contacts.raw->'tags'`, que é um
-- conjunto sem data: diz que o contato TEM a tag, nunca desde quando. Sem
-- isso não dá para separar coortes -- e é justamente o que permite comparar
-- a copy V1 com a V2 depois que a mensagem for trocada, já que as tags em
-- produção não carregam versão no nome.
--
-- Cada dia sem gravar isso é coorte que não se reconstrói depois, por isso a
-- tabela nasce antes das telas que vão consumi-la.
--
-- `ultimo_visto_em` para de avançar quando a tag é removida do contato, então
-- a remoção também fica registrada sem trabalho extra.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ghl_contact_tags (
  contact_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  primeiro_visto_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_visto_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 'backfill' = tag que já existia quando a tabela foi criada, então a data
  -- é um TETO ("no máximo desde"), não o momento real da aplicação.
  -- 'observado' = primeira vez que o sync realmente viu a tag aparecer.
  origem_primeiro_visto TEXT NOT NULL DEFAULT 'observado'
    CHECK (origem_primeiro_visto IN ('observado', 'backfill')),
  PRIMARY KEY (contact_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_ghl_contact_tags_tag
  ON public.ghl_contact_tags (tag);

CREATE INDEX IF NOT EXISTS idx_ghl_contact_tags_primeiro_visto
  ON public.ghl_contact_tags (primeiro_visto_em DESC);

COMMENT ON TABLE public.ghl_contact_tags IS
  'Quando cada tag do GHL foi vista pela primeira vez em cada contato. Base das coortes de follow-up (D1/D3/D7 e M1/M2/M3).';

-- ------------------------------------------------------------
-- O sync de contatos já reescreve `raw` (inclusive de contato antigo), então
-- um trigger cobre tudo sem depender de agendamento novo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_ghl_contact_tags()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ghl_contact_tags (contact_id, tag)
  SELECT NEW.id, tag
  FROM jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(NEW.raw -> 'tags') = 'array' THEN NEW.raw -> 'tags'
      ELSE '[]'::jsonb
    END
  ) AS tag
  WHERE tag IS NOT NULL AND btrim(tag) <> ''
  ON CONFLICT (contact_id, tag)
  DO UPDATE SET ultimo_visto_em = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ghl_contact_tags ON public.ghl_contacts;
CREATE TRIGGER trg_ghl_contact_tags
  AFTER INSERT OR UPDATE OF raw ON public.ghl_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ghl_contact_tags();

-- ------------------------------------------------------------
-- Estado atual entra como 'backfill': a data serve de teto, não de verdade.
-- ------------------------------------------------------------
INSERT INTO public.ghl_contact_tags (contact_id, tag, origem_primeiro_visto)
SELECT c.id, tag, 'backfill'
FROM public.ghl_contacts c,
     LATERAL jsonb_array_elements_text(
       CASE
         WHEN jsonb_typeof(c.raw -> 'tags') = 'array' THEN c.raw -> 'tags'
         ELSE '[]'::jsonb
       END
     ) AS tag
WHERE tag IS NOT NULL AND btrim(tag) <> ''
ON CONFLICT (contact_id, tag) DO NOTHING;

-- ------------------------------------------------------------
-- RLS igual às demais tabelas do módulo: escrita só por service role,
-- leitura liberada para usuário autenticado.
-- ------------------------------------------------------------
ALTER TABLE public.ghl_contact_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read authenticated" ON public.ghl_contact_tags;
CREATE POLICY "read authenticated"
  ON public.ghl_contact_tags
  FOR SELECT
  TO authenticated
  USING (true);
