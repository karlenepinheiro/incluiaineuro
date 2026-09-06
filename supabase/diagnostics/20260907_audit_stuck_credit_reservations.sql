-- ============================================================================
-- FASE 0 / C-2 — Diagnóstico do PASSIVO de reservas técnicas presas
-- ----------------------------------------------------------------------------
-- SOMENTE LEITURA. Não executa UPDATE/DELETE. Não expõe nome, e-mail, CPF,
-- nome de tenant nem user_id — apenas agregados.
--
-- Rodar no SQL editor do Supabase (produção: leitura é segura) ou local:
--   psql "$DB_URL" -f supabase/diagnostics/20260907_audit_stuck_credit_reservations.sql
-- ============================================================================

WITH base AS (
  SELECT
    amount,
    expires_at,
    created_at,
    (
      (expires_at IS NOT NULL AND expires_at <= now())
      OR (expires_at IS NULL AND created_at <= now() - interval '30 minutes')
    ) AS is_stale
  FROM public.credit_reservations
  WHERE status = 'reserved'
)
SELECT
  count(*)                                                        AS total_reserved,
  count(*) FILTER (WHERE expires_at IS NULL)                      AS reserved_expires_at_null,
  count(*) FILTER (WHERE created_at <= now() - interval '30 minutes') AS reserved_older_than_30min,
  count(*) FILTER (WHERE is_stale)                                AS stale_reservations,
  COALESCE(sum(amount), 0)                                        AS credits_in_all_reserved,
  COALESCE(sum(amount) FILTER (WHERE is_stale), 0)                AS credits_potentially_stuck,
  min(created_at) FILTER (WHERE is_stale)                         AS oldest_stale_created_at,
  EXTRACT(EPOCH FROM (now() - min(created_at) FILTER (WHERE is_stale))) / 3600.0 AS oldest_stale_age_hours
FROM base;

-- Distribuição por faixa etária (apenas contagem e soma de créditos):
WITH base AS (
  SELECT amount, now() - created_at AS age
  FROM public.credit_reservations
  WHERE status = 'reserved'
)
SELECT
  CASE
    WHEN age < interval '20 minutes'  THEN 'a) < 20 min (dentro do TTL técnico)'
    WHEN age < interval '30 minutes'  THEN 'b) 20-30 min'
    WHEN age < interval '2 hours'     THEN 'c) 30 min - 2 h'
    WHEN age < interval '1 day'       THEN 'd) 2 h - 1 dia'
    ELSE                                   'e) > 1 dia'
  END                       AS faixa,
  count(*)                  AS reservas,
  COALESCE(sum(amount), 0)  AS creditos
FROM base
GROUP BY 1
ORDER BY 1;
