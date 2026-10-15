-- Aviso imediato de passagem da Cami: quem recebe o cliente é avisado na hora
-- (ou no primeiro minuto do turno seguinte, se a passagem foi fora do turno).
-- notified_at marca o aviso enviado; null = ainda pendente.
alter table public.ai_seller_handoffs
  add column if not exists notified_at timestamptz;

-- Passagens de antes deste aviso existir não recebem aviso atrasado: o
-- lembrete de 60 min úteis (alerted_at) já cobre essas.
update public.ai_seller_handoffs
  set notified_at = escalated_at
  where notified_at is null;
