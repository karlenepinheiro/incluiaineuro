-- ============================================================
-- schema_payment_v3_fix_constraints.sql  (rev 2 — 2026-04-06)
--
-- Diagnóstico e correção de:
--   "there is no unique or exclusion constraint matching
--    the ON CONFLICT specification"
--
-- BLOCOS INDEPENDENTES — execute um por vez no SQL Editor.
-- Leia o resultado de cada bloco antes de avançar.
-- ============================================================


-- ============================================================
-- BLOCO 1 — INSPECIONAR COLUNAS REAIS DAS TABELAS
-- Execute primeiro para confirmar a estrutura do seu banco.
-- ============================================================

-- Colunas de credits_wallet
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'credits_wallet'
ORDER BY ordinal_position;

-- Colunas de subscriptions
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'subscriptions'
ORDER BY ordinal_position;

-- Colunas de credits_ledger
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'credits_ledger'
ORDER BY ordinal_position;


-- ============================================================
-- BLOCO 2 — DIAGNÓSTICO: subscriptions
-- Verifica duplicados e constraints existentes.
-- ============================================================

-- 2a. Duplicados em subscriptions.tenant_id
SELECT
  tenant_id,
  COUNT(*) AS total,
  array_agg(id ORDER BY created_at DESC NULLS LAST) AS ids_mais_recente_primeiro
FROM public.subscriptions
GROUP BY tenant_id
HAVING COUNT(*) > 1;

-- 2b. Constraints UNIQUE/PK existentes em subscriptions
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.subscriptions'::regclass
  AND contype IN ('u', 'p')
ORDER BY contype, conname;


-- ============================================================
-- BLOCO 3 — DIAGNÓSTICO: credits_wallet
-- Usa updated_at (credits_wallet não tem created_at).
-- ============================================================

-- 3a. Duplicados em credits_wallet.tenant_id
--     Desempate por updated_at (mais recente) depois por balance (maior saldo).
--     Se updated_at também não existir no seu banco, troque por balance DESC, ctid DESC.
SELECT
  tenant_id,
  COUNT(*) AS total,
  array_agg(id ORDER BY updated_at DESC NULLS LAST) AS ids_mais_recente_primeiro,
  array_agg(balance ORDER BY updated_at DESC NULLS LAST) AS saldos
FROM public.credits_wallet
GROUP BY tenant_id
HAVING COUNT(*) > 1;

-- 3b. Constraints UNIQUE/PK existentes em credits_wallet
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.credits_wallet'::regclass
  AND contype IN ('u', 'p')
ORDER BY contype, conname;


-- ============================================================
-- BLOCO 4 — REMOVER DUPLICADOS (execute SOMENTE se BLOCO 2
--           ou BLOCO 3 retornaram linhas)
-- ============================================================

-- 4a. Remove subscriptions duplicadas — mantém a mais recente por created_at
DELETE FROM public.subscriptions
WHERE id NOT IN (
  SELECT DISTINCT ON (tenant_id) id
  FROM public.subscriptions
  ORDER BY tenant_id, created_at DESC NULLS LAST, ctid DESC
);

-- 4b. Remove credits_wallet duplicadas — mantém a de maior saldo,
--     desempate por updated_at mais recente, depois por ctid.
DELETE FROM public.credits_wallet
WHERE id NOT IN (
  SELECT DISTINCT ON (tenant_id) id
  FROM public.credits_wallet
  ORDER BY tenant_id, balance DESC, updated_at DESC NULLS LAST, ctid DESC
);


-- ============================================================
-- BLOCO 5 — CRIAR CONSTRAINTS UNIQUE (idempotente)
-- Só execute depois de confirmar que não há duplicados
-- (BLOCO 2/3 sem resultados, ou após rodar BLOCO 4).
-- ============================================================

-- 5a. subscriptions.tenant_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND contype = 'u'
      AND conname LIKE '%tenant%'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_tenant_id_key UNIQUE (tenant_id);
    RAISE NOTICE '[OK] UNIQUE criada em subscriptions.tenant_id';
  ELSE
    RAISE NOTICE '[SKIP] UNIQUE em subscriptions.tenant_id já existe';
  END IF;
END $$;

-- 5b. credits_wallet.tenant_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.credits_wallet'::regclass
      AND contype = 'u'
      AND conname LIKE '%tenant%'
  ) THEN
    ALTER TABLE public.credits_wallet
      ADD CONSTRAINT credits_wallet_tenant_id_key UNIQUE (tenant_id);
    RAISE NOTICE '[OK] UNIQUE criada em credits_wallet.tenant_id';
  ELSE
    RAISE NOTICE '[SKIP] UNIQUE em credits_wallet.tenant_id já existe';
  END IF;
END $$;


-- ============================================================
-- BLOCO 6 — COMPATIBILIDADE credits_ledger (operation vs type)
-- O trigger v17+ insere em 'type'; o schema original usa 'operation'.
-- Garante ambas as colunas e as mantém sincronizadas.
-- ============================================================

-- Garante existência de ambas as colunas
ALTER TABLE public.credits_ledger ADD COLUMN IF NOT EXISTS type      TEXT;
ALTER TABLE public.credits_ledger ADD COLUMN IF NOT EXISTS operation TEXT;

-- Sincroniza linhas legadas: operation → type
UPDATE public.credits_ledger
SET type = operation
WHERE type IS NULL AND operation IS NOT NULL;

-- Sincroniza linhas novas (trigger v17): type → operation
UPDATE public.credits_ledger
SET operation = type
WHERE operation IS NULL AND type IS NOT NULL;

-- Recria CHECK em 'operation' cobrindo todos os valores conhecidos
DO $$
BEGIN
  ALTER TABLE public.credits_ledger
    DROP CONSTRAINT IF EXISTS credits_ledger_operation_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.credits_ledger
    ADD CONSTRAINT credits_ledger_operation_check
    CHECK (
      operation IS NULL OR operation = ANY (ARRAY[
        'RENEWAL', 'MANUAL_GRANT', 'CONSUMPTION', 'PURCHASE', 'EXPIRY',
        'monthly_grant', 'usage_ai', 'bonus_manual', 'purchase_extra',
        'refund', 'courtesy', 'adjustment'
      ])
    );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AVISO] Não foi possível adicionar CHECK em credits_ledger.operation: %', SQLERRM;
END $$;


-- ============================================================
-- BLOCO 7 — ÍNDICES DE SUPORTE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id
  ON public.subscriptions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_credits_wallet_tenant_id
  ON public.credits_wallet (tenant_id);


-- ============================================================
-- BLOCO 8 — VERIFICAÇÃO FINAL
-- Execute ao final para confirmar o estado correto.
-- ============================================================

-- 8a. Constraints UNIQUE nas duas tabelas
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema   = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name   IN ('subscriptions', 'credits_wallet')
  AND tc.constraint_type = 'UNIQUE'
ORDER BY tc.table_name, kcu.column_name;

-- 8b. credits_ledger tem ambas as colunas?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'credits_ledger'
  AND column_name  IN ('type', 'operation')
ORDER BY column_name;

-- 8c. Confirma zero duplicados restantes
SELECT 'subscriptions' AS tabela, COUNT(*) AS duplicados
FROM (
  SELECT tenant_id FROM public.subscriptions
  GROUP BY tenant_id HAVING COUNT(*) > 1
) x
UNION ALL
SELECT 'credits_wallet', COUNT(*)
FROM (
  SELECT tenant_id FROM public.credits_wallet
  GROUP BY tenant_id HAVING COUNT(*) > 1
) y;


-- ============================================================
-- ORDEM DE EXECUÇÃO RECOMENDADA
--
--  1. BLOCO 1  → inspecione as colunas reais
--  2. BLOCO 2  → diagnóstico subscriptions
--  3. BLOCO 3  → diagnóstico credits_wallet
--  4. BLOCO 4  → (somente se duplicados encontrados)
--  5. BLOCO 5  → cria constraints UNIQUE
--  6. BLOCO 6  → compatibilidade credits_ledger
--  7. BLOCO 7  → índices
--  8. BLOCO 8  → verificação final
--
-- Depois execute schema_payment_v2.sql para atualizar
-- a função activate_purchase_for_user.
--
-- Para reverter uma ativação recente incorreta:
--   UPDATE kiwify_purchases
--   SET activated_at = NULL, tenant_id = NULL
--   WHERE id = '<uuid-da-compra>'
--     AND activated_at > now() - interval '24 hours';
-- ============================================================
