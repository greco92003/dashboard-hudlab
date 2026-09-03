-- ============================================================
-- Correção do rótulo de origem em ghl_contact_tags (2026-09-03)
--
-- O trigger marcava como 'backfill' TODA tag que chegasse num INSERT de
-- contato. A regra nasceu na carga inicial de 21/08/2026, quando a fase
-- `contacts-all` do sync-ghl trouxe 27 mil contatos antigos de uma vez -- ali
-- a tag realmente já existia havia quem sabe quanto tempo, e a data de
-- primeira observação era um teto, não um fato.
--
-- Em operação normal, porém, um contato entra na tabela porque ACABOU de ser
-- criado no GHL, e as tags dele são observação genuína. A regra antiga
-- rotulava essas como 'backfill' e as tirava de qualquer análise de coorte --
-- exatamente o que a comparação de copy V1 x V2 do follow-up depende.
--
-- Apareceu na queda de webhook de 02/09/2026: ao reconstruir o funil a partir
-- das tags, 47 dos 66 eventos recuperáveis estavam mal rotulados e teriam
-- ficado de fora.
--
-- Regra nova, que não depende de fase de carga: decide pela idade do próprio
-- contato. Criado nos últimos 2 dias => a tag é nova => 'observado'. Contato
-- antigo que o sync só agora alcançou => idade da tag desconhecida =>
-- 'backfill'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_ghl_contact_tags()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  origem TEXT;
  criado_em TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN
    BEGIN
      criado_em := (NEW.raw ->> 'dateAdded')::TIMESTAMPTZ;
    EXCEPTION WHEN OTHERS THEN
      criado_em := NULL;
    END;

    origem := CASE
      WHEN criado_em IS NOT NULL AND criado_em > NOW() - INTERVAL '2 days'
        THEN 'observado'
      ELSE 'backfill'
    END;
  ELSE
    origem := 'observado';
  END IF;

  INSERT INTO public.ghl_contact_tags (contact_id, tag, origem_primeiro_visto)
  SELECT NEW.id, tag, origem
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

-- Corrige o que já entrou mal rotulado: contato criado no GHL depois da carga
-- inicial não pode ter tag classificada como pré-existente.
UPDATE public.ghl_contact_tags t
SET origem_primeiro_visto = 'observado'
FROM public.ghl_contacts c
WHERE c.id = t.contact_id
  AND t.origem_primeiro_visto = 'backfill'
  AND (c.raw ->> 'dateAdded')::TIMESTAMPTZ > TIMESTAMPTZ '2026-08-21 16:00:00+00';
