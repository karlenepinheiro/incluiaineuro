-- ============================================================
-- Schema v13 — Fluxo de Autenticação + Cadastro FREE
-- Executar após schema_v8_signatures_rls.sql
--
-- O que faz:
--   1. Garante coluna `balance` na credits_wallet (coluna real usada pelo app)
--   2. Atualiza trigger create_user_profile_on_signup:
--      - Usa `balance` (em vez de credits_avail)
--      - Concede 10 créditos ao cadastrar plano FREE
--   3. Adiciona webhook_logs para idempotência (se não existir)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Garante coluna `balance` na credits_wallet
--    (o app e o webhook usam essa coluna; a migration antiga
--     criou credits_avail — mantemos ambas por compatibilidade)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.credits_wallet
  ADD COLUMN IF NOT EXISTS balance NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- Sincroniza balance ← credits_avail em linhas legadas (se a coluna existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'credits_wallet'
      AND column_name  = 'credits_avail'
  ) THEN
    UPDATE public.credits_wallet
    SET balance = COALESCE(credits_avail, 0)
    WHERE balance = 0 AND credits_avail > 0;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 2. Trigger atualizado — cria perfil + FREE com 10 créditos
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_user_profile_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id UUID;
  v_nome      TEXT;
  v_email     TEXT;
  v_free_plan_id UUID;
BEGIN
  v_email := NEW.email;
  v_nome  := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Evita duplicata
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Cria tenant
  INSERT INTO public.tenants (id, name, type, status_assinatura, creditos_ia_restantes)
  VALUES (
    gen_random_uuid(),
    COALESCE(NEW.raw_user_meta_data->>'school_name', 'Escola de ' || v_nome),
    'SCHOOL',
    'ACTIVE',
    10  -- 10 créditos iniciais do FREE
  )
  RETURNING id INTO v_tenant_id;

  -- Cria registro na tabela users
  INSERT INTO public.users (id, tenant_id, nome, email, role, plan, active)
  VALUES (
    NEW.id,
    v_tenant_id,
    v_nome,
    v_email,
    'TEACHER',   -- role padrão
    'FREE',
    true
  );

  -- Carteira de créditos: 10 créditos para o FREE
  INSERT INTO public.credits_wallet (tenant_id, balance)
  VALUES (v_tenant_id, 10)
  ON CONFLICT (tenant_id) DO UPDATE
    SET balance = GREATEST(public.credits_wallet.balance, 10);

  -- Resolve plan_id do FREE (pode não existir ainda — usa NULL com fallback)
  SELECT id INTO v_free_plan_id
  FROM public.plans
  WHERE UPPER(name) = 'FREE'
  LIMIT 1;

  -- Cria assinatura FREE
  INSERT INTO public.subscriptions (tenant_id, plan_id, status, provider)
  VALUES (
    v_tenant_id,
    v_free_plan_id,  -- NULL se plano não estiver cadastrado ainda
    'ACTIVE',
    'NONE'
  )
  ON CONFLICT DO NOTHING;

  -- Ledger: registra concessão inicial
  INSERT INTO public.credits_ledger (tenant_id, amount, type, description)
  VALUES (v_tenant_id, 10, 'credit', 'Créditos iniciais plano FREE')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_user_profile_on_signup: erro para %, erro: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Re-vincula o trigger ao auth.users (DROP + CREATE = idempotente)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile_on_signup();


-- ─────────────────────────────────────────────────────────────
-- 3. Tabela kiwify_webhook_logs (para idempotência)
--    Já pode existir — usa IF NOT EXISTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kiwify_webhook_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kiwify_order_id  TEXT        NOT NULL,
  event_type       TEXT        NOT NULL,
  tenant_id        UUID        REFERENCES public.tenants(id) ON DELETE SET NULL,
  plan_code        TEXT,
  credits_granted  INT         DEFAULT 0,
  raw_payload      JSONB,
  processed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT kiwify_webhook_logs_order_event_unique UNIQUE (kiwify_order_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_kiwify_logs_tenant ON public.kiwify_webhook_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kiwify_logs_order  ON public.kiwify_webhook_logs(kiwify_order_id);

-- RLS: apenas super_admin pode ler logs
ALTER TABLE public.kiwify_webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kiwify_logs_admin_only" ON public.kiwify_webhook_logs;
CREATE POLICY "kiwify_logs_admin_only" ON public.kiwify_webhook_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
  );


-- ─────────────────────────────────────────────────────────────
-- 4. Tabela kiwify_products (fallback quando env não configurado)
--    Já pode existir — usa IF NOT EXISTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kiwify_products (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  kiwify_product_id   TEXT    UNIQUE NOT NULL,
  product_name        TEXT    NOT NULL,
  product_type        TEXT    NOT NULL CHECK (product_type IN ('subscription', 'credits')),
  plan_code           TEXT,          -- PRO | MASTER | null (créditos avulsos)
  credits_amount      INT     NOT NULL DEFAULT 0,
  price_brl           NUMERIC(10,2),
  checkout_url        TEXT    NOT NULL DEFAULT '#',
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: leitura pública (necessária para o SPA carregar os produtos)
ALTER TABLE public.kiwify_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kiwify_products_public_read" ON public.kiwify_products;
CREATE POLICY "kiwify_products_public_read" ON public.kiwify_products
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "kiwify_products_admin_write" ON public.kiwify_products;
CREATE POLICY "kiwify_products_admin_write" ON public.kiwify_products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
  );
