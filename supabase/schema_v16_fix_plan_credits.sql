-- =============================================================================
-- schema_v16_fix_plan_credits.sql
-- Corrige os valores de ai_credits_per_month na tabela plans.
--
-- PROBLEMA: créditos incorretos causavam inconsistência entre telas.
--   - PRO  estava com 50 créditos/mês  → correto é 500
--   - MASTER/PREMIUM estava com 200    → correto é 700
--   - FREE estava com valores variados → correto é 60
--
-- EXECUTAR EM: Supabase → SQL Editor → New Query → Run
-- =============================================================================

-- Corrige créditos mensais por plano (fonte única de verdade: aiCosts.ts)
UPDATE plans SET ai_credits_per_month = 60   WHERE name = 'FREE';
UPDATE plans SET ai_credits_per_month = 500  WHERE name = 'PRO';
UPDATE plans SET ai_credits_per_month = 700  WHERE name IN ('MASTER', 'PREMIUM');

-- Garante max_students corretos
UPDATE plans SET max_students = 5    WHERE name = 'FREE';
UPDATE plans SET max_students = 30   WHERE name = 'PRO';
UPDATE plans SET max_students = 9999 WHERE name IN ('MASTER', 'PREMIUM');

-- Confirma resultado
SELECT name, ai_credits_per_month, max_students FROM plans ORDER BY price_brl;
