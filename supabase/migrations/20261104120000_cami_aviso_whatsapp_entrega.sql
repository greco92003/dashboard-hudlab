-- Entrega do aviso de passagem no WhatsApp do time (2026-11-04).
--
-- notified_at marcava o aviso como enviado mesmo quando o WhatsApp falhava: de
-- 02 a 04/11 o workflow "Aviso Time | WhatsApp" estava em rascunho, o GHL
-- aceitava a inscrição e nada chegava. Agora o WhatsApp tem marca própria:
-- whatsapp_avisado_at só quando chegou a alguém do time; whatsapp_falhas conta
-- as tentativas que falharam (o cron tenta de novo a cada rodada do turno e o
-- resumo diário mostra as que ficaram sem entrega).
alter table public.ai_seller_handoffs
  add column if not exists whatsapp_avisado_at timestamptz,
  add column if not exists whatsapp_falhas integer not null default 0;

-- O workflow foi publicado em 04/11 às 09:20 (Brasília): avisos marcados depois
-- disso chegaram. Os de antes, ainda sem resposta e dentro das 72h do cron,
-- saem de novo no próximo turno.
update public.ai_seller_handoffs
  set whatsapp_avisado_at = notified_at
  where notified_at >= '2026-11-04 12:20:55+00'
    and whatsapp_avisado_at is null;
