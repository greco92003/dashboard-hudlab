-- The timer, page restoration and rankings refresh can observe the same
-- deadline. An explicit evaluating state makes the transition single-writer.
alter table public.seller_training_sessions
  drop constraint if exists seller_training_sessions_status_check,
  add constraint seller_training_sessions_status_check
    check (status in ('active', 'evaluating', 'completed', 'expired', 'failed'));

-- Repair sessions incorrectly expired by the old rankings race. Only sessions
-- with enough messages and activity close to the deadline are reopened; the
-- training API will audit them on the next restore instead of assigning zero.
update public.seller_training_sessions
set
  status = 'active',
  ended_at = null,
  score = null,
  evaluation = null,
  completion_reason = null,
  updated_at = now()
where status = 'expired'
  and completion_reason = 'timeout'
  and score = 0
  and jsonb_array_length(coalesce(transcript, '[]'::jsonb)) >= 4
  and evaluation->'report'->>'resumo' = 'Treinamento abandonado antes da conclusão.'
  and coalesce(
    nullif(transcript->(jsonb_array_length(transcript) - 1)->>'timestamp', '')::timestamptz,
    started_at
  ) >= deadline_at - interval '2 minutes';
