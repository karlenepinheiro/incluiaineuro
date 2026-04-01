-- ============================================================
-- Migration v9 — Fix Documents + Kiwify Tables
-- Executar no Supabase SQL Editor (idempotente — safe to re-run)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. CORRIGIR TABELA DOCUMENTS
--    Problemas encontrados no código:
--    a) status CHECK não incluía 'FINAL' (frontend envia 'FINAL')
--    b) doc_type CHECK muito restritivo (não aceitava variações)
--    c) created_by NOT NULL causava falha silenciosa
--    d) RLS policies ausentes → inserts bloqueados
-- ────────────────────────────────────────────────────────────

-- Garantir que a tabela existe com a estrutura correta
CREATE TABLE IF NOT EXISTS public.documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id      UUID        REFERENCES public.students(id) ON DELETE CASCADE,
  created_by      UUID        REFERENCES public.users(id),          -- nullable (fix bug 1)

  doc_type        TEXT        NOT NULL DEFAULT 'PEI',
  source_id       UUID        REFERENCES public.documents(id),

  title           TEXT        NOT NULL DEFAULT '',
  structured_data JSONB       NOT NULL DEFAULT '{}',

  status          TEXT        NOT NULL DEFAULT 'DRAFT',

  audit_code      TEXT        UNIQUE,
  content_hash    TEXT,

  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Se a tabela JÁ existia com as constraints antigas, corrigi-las:
-- a) Remover CHECK de status antigo e recriar sem restrição rígida
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_doc_type_check;

-- b) Tornar created_by nullable (resolve o NOT NULL bug)
ALTER TABLE public.documents ALTER COLUMN created_by DROP NOT NULL;

-- c) Adicionar índices úteis
CREATE INDEX IF NOT EXISTS idx_documents_tenant    ON public.documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_student   ON public.documents(student_id);
CREATE INDEX IF NOT EXISTS idx_documents_type      ON public.documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_status    ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_deleted   ON public.documents(deleted_at) WHERE deleted_at IS NULL;

-- d) Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_documents_updated_at'
      AND tgrelid = 'public.documents'::regclass
  ) THEN
    CREATE TRIGGER trg_documents_updated_at
      BEFORE UPDATE ON public.documents
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- e) RLS — recriar políticas completas
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doc_tenant_select"  ON public.documents;
DROP POLICY IF EXISTS "doc_tenant_insert"  ON public.documents;
DROP POLICY IF EXISTS "doc_tenant_update"  ON public.documents;
DROP POLICY IF EXISTS "doc_tenant_delete"  ON public.documents;
DROP POLICY IF EXISTS "doc_admin_all"      ON public.documents;

-- SELECT: qualquer usuário do mesmo tenant
CREATE POLICY "doc_tenant_select" ON public.documents
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: usuário autenticado pode inserir no próprio tenant
CREATE POLICY "doc_tenant_insert" ON public.documents
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- UPDATE: mesmo tenant
CREATE POLICY "doc_tenant_update" ON public.documents
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- DELETE (soft): mesmo tenant
CREATE POLICY "doc_tenant_delete" ON public.documents
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- Super admin vê tudo
CREATE POLICY "doc_admin_all" ON public.documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ────────────────────────────────────────────────────────────
-- 2. TABELA KIWIFY_PRODUCTS
--    Mapeia product_id da Kiwify → plano/créditos do sistema
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kiwify_products (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kiwify_product_id TEXT     NOT NULL UNIQUE,  -- ID do produto na Kiwify
  product_name   TEXT        NOT NULL,          -- ex: "Plano Pro Mensal"
  product_type   TEXT        NOT NULL,          -- 'subscription' | 'credits'
  plan_code      TEXT,                          -- 'PRO' | 'MASTER' | null (para créditos)
  credits_amount INT         DEFAULT 0,         -- quantidade de créditos (para type=credits)
  price_brl      NUMERIC(10,2),
  checkout_url   TEXT,                          -- link de checkout Kiwify
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed inicial — você preencherá os kiwify_product_id e checkout_url reais no dashboard Kiwify
INSERT INTO public.kiwify_products
  (kiwify_product_id, product_name, product_type, plan_code, credits_amount, price_brl, checkout_url)
VALUES
  ('KIWIFY_PRO_ID',         'Plano Pro Mensal',        'subscription', 'PRO',    0,    79.90, 'https://kiwify.app/LINK_PRO'),
  ('KIWIFY_MASTER_ID',      'Plano Master Mensal',     'subscription', 'MASTER', 0,   149.90, 'https://kiwify.app/LINK_MASTER'),
  ('KIWIFY_CREDITS_100_ID', 'Pacote 100 Créditos IA',  'credits',      NULL,     100,  29.90, 'https://kiwify.app/LINK_CREDITS100'),
  ('KIWIFY_CREDITS_300_ID', 'Pacote 300 Créditos IA',  'credits',      NULL,     300,  79.90, 'https://kiwify.app/LINK_CREDITS300'),
  ('KIWIFY_CREDITS_900_ID', 'Pacote 900 Créditos IA',  'credits',      NULL,     900, 149.90, 'https://kiwify.app/LINK_CREDITS900')
ON CONFLICT (kiwify_product_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 3. TABELA KIWIFY_WEBHOOK_LOGS
--    Idempotência: evita processar o mesmo evento duas vezes
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kiwify_webhook_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kiwify_order_id TEXT        NOT NULL UNIQUE,  -- order.order_id da Kiwify
  event_type      TEXT        NOT NULL,          -- order_approved | subscription_canceled | ...
  tenant_id       UUID        REFERENCES public.tenants(id),
  plan_code       TEXT,
  credits_granted INT         DEFAULT 0,
  raw_payload     JSONB       NOT NULL DEFAULT '{}',
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kiwify_logs_tenant ON public.kiwify_webhook_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kiwify_logs_order  ON public.kiwify_webhook_logs(kiwify_order_id);

-- RLS: apenas service_role (Edge Function usa service_role key)
ALTER TABLE public.kiwify_webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kiwify_logs_service_all"  ON public.kiwify_webhook_logs;
DROP POLICY IF EXISTS "kiwify_logs_admin_select" ON public.kiwify_webhook_logs;

CREATE POLICY "kiwify_logs_service_all" ON public.kiwify_webhook_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "kiwify_logs_admin_select" ON public.kiwify_webhook_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ────────────────────────────────────────────────────────────
-- 4. COLUNA is_test_account + test_expires_at em tenants
--    (se não existirem — idempotente)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS is_test_account  BOOLEAN     DEFAULT FALSE;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS test_expires_at  TIMESTAMPTZ;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS account_status   TEXT        DEFAULT 'active';
-- account_status: 'active' | 'free' | 'test' | 'suspended' | 'canceled'

-- ────────────────────────────────────────────────────────────
-- 5. GARANTIR credits_wallet PARA NOVOS USUÁRIOS
--    Função chamada pelo trigger de signup (auth.users)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id UUID;
  v_free_plan_id UUID;
BEGIN
  -- 1. Cria tenant
  INSERT INTO public.tenants (name, is_active)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), TRUE)
  RETURNING id INTO v_tenant_id;

  -- 2. Busca plano FREE
  SELECT id INTO v_free_plan_id FROM public.plans WHERE name = 'FREE' LIMIT 1;

  -- 3. Cria usuário vinculado ao tenant
  INSERT INTO public.users (id, tenant_id, name, email, role, plan)
  VALUES (
    NEW.id,
    v_tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    'user',
    'FREE'
  )
  ON CONFLICT (id) DO NOTHING;

  -- 4. Cria assinatura FREE
  IF v_free_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (tenant_id, plan_id, status)
    VALUES (v_tenant_id, v_free_plan_id, 'ACTIVE')
    ON CONFLICT DO NOTHING;
  END IF;

  -- 5. Cria carteira de créditos (FREE = 0 créditos)
  INSERT INTO public.credits_wallet (tenant_id, balance)
  VALUES (v_tenant_id, 0)
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Reinstala o trigger no auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- 6. VIEW ADMIN — v_ceo_subscribers (se não existir ou atualizar)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_ceo_subscribers AS
SELECT
  t.id                                            AS tenant_id,
  t.name                                          AS tenant_name,
  t.is_test_account,
  t.account_status,
  u.email                                         AS user_email,
  u.name                                          AS user_name,
  u.role,
  p.name                                          AS plan_code,
  s.status                                        AS subscription_status,
  s.current_period_end,
  s.next_due_date,
  COALESCE(cw.balance, 0)                         AS credits_remaining,
  COALESCE(pm.ai_credits_per_month, 0)            AS credits_limit,
  COALESCE(st.student_count, 0)                   AS students_active,
  COALESCE(pm.max_students, 5)                    AS student_limit,
  t.created_at
FROM public.tenants t
LEFT JOIN public.users u       ON u.tenant_id = t.id
LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
LEFT JOIN public.plans pm      ON pm.id = s.plan_id
LEFT JOIN public.plans p       ON p.id = s.plan_id
LEFT JOIN public.credits_wallet cw ON cw.tenant_id = t.id
LEFT JOIN (
  SELECT tenant_id, COUNT(*) AS student_count
  FROM public.students
  WHERE deleted_at IS NULL
  GROUP BY tenant_id
) st ON st.tenant_id = t.id;

-- ────────────────────────────────────────────────────────────
-- 7. VIEW KPIs FINANCEIROS
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_ceo_financial_kpis AS
SELECT
  COUNT(*) FILTER (WHERE s.status = 'ACTIVE' AND p.name != 'FREE')  AS active_subscribers,
  COUNT(*) FILTER (WHERE s.status = 'OVERDUE')                       AS overdue_subscribers,
  COUNT(*) FILTER (WHERE s.status = 'TRIAL')                         AS trial_subscribers,
  COUNT(*) FILTER (WHERE s.status = 'CANCELED')                      AS canceled_subscribers,
  COUNT(DISTINCT t.id)                                                AS total_tenants,
  SUM(CASE
    WHEN s.status = 'ACTIVE' AND p.name = 'PRO'    THEN p.price_brl
    WHEN s.status = 'ACTIVE' AND p.name = 'MASTER' THEN p.price_brl
    ELSE 0
  END)                                                                AS mrr_estimated
FROM public.tenants t
LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
LEFT JOIN public.plans p         ON p.id = s.plan_id;

-- ────────────────────────────────────────────────────────────
-- FIM DA MIGRATION v9
-- ────────────────────────────────────────────────────────────
