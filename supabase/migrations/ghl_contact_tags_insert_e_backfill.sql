-- ============================================================
-- Correção do trigger de ghl_contact_tags (2026-08-21, mesmo dia da criação)
--
-- O trigger original marcava toda tag nova como 'observado', inclusive as de
-- um contato que estava entrando na tabela pela primeira vez. Nesse caso a
-- tag não foi vista APARECENDO: ela já existia no GHL desde sabe-se lá
-- quando, e só agora o sync alcançou aquele contato.
--
-- Isso apareceu na prática minutos depois: rodar a fase `contacts-all` (que
-- trouxe a base de 2.720 para 20.147 contatos) inseriu 30.779 linhas
-- marcadas como 'observado' em 76 segundos -- uma coorte fantasma de
-- "tagueados hoje" formada por contatos antigos. Se alguém comparasse copy
-- V1 x V2 por data de primeira observação, essa massa entraria toda no lado
-- errado.
--
-- Regra correta:
--   INSERT de contato novo         -> estado pré-existente -> 'backfill'
--   UPDATE de contato já conhecido -> a tag realmente apareceu -> 'observado'
--
-- As 30.779 linhas afetadas foram corrigidas para 'backfill' logo em
-- seguida (comando ao final deste arquivo, já aplicado).
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_ghl_contact_tags()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ghl_contact_tags (contact_id, tag, origem_primeiro_visto)
  SELECT
    NEW.id,
    tag,
    CASE WHEN TG_OP = 'INSERT' THEN 'backfill' ELSE 'observado' END
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

-- Correção pontual das linhas gravadas antes do fix chegar. A janela é
-- estreita e conhecida (a tabela nasceu 15:13 e o contacts-all rodou entre
-- 15:30 e 15:32 do mesmo dia), e marcar como 'backfill' é o lado
-- conservador: a data vira teto ("no máximo desde"), nunca uma observação
-- que não aconteceu.
UPDATE public.ghl_contact_tags
SET origem_primeiro_visto = 'backfill'
WHERE origem_primeiro_visto = 'observado'
  AND primeiro_visto_em <= TIMESTAMPTZ '2026-08-21 15:32:00+00';
