-- Trava de tentativas do PIN.
--
-- São 4 dígitos: 10.000 combinações. Sem trava, alguém já autenticado
-- conseguiria adivinhar o PIN de um colega e assinar uma conclusão no nome
-- dele — o que destruiria justamente a atribuição, que é o motivo do PIN
-- existir. A contagem fica no banco e não em memória porque o servidor é
-- serverless e reinicia entre requisições.
alter table public.producao_pins
  add column if not exists tentativas_falhas integer not null default 0,
  add column if not exists bloqueado_ate timestamptz;

comment on column public.producao_pins.tentativas_falhas is
  'Erros seguidos de PIN; zera no acerto.';
comment on column public.producao_pins.bloqueado_ate is
  'Enquanto no futuro, o PIN não é aceito mesmo se estiver correto.';
