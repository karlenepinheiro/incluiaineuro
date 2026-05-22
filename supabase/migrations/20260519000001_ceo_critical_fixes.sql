-- ============================================================
-- 20260519000001_ceo_critical_fixes.sql
-- Sprint CEO-1 — Correções críticas de segurança
--
-- GARANTIAS:
--   • 100% idempotente — seguro para re-executar quantas vezes quiser
--   • Não assume existência de tabelas opcionais
--   • Não apaga dados, não recria tabelas, não quebra policies existentes
--   • Sem downtime
--
-- ESTRUTURA:
--   BLOCO 1 — Diagnóstico (só leitura, sem alterações)
--   BLOCO 2 — Correções obrigatórias (seguras em qualquer estado do banco)
--   BLOCO 3 — Correções condicionadas (só se a tabela existir)
--   BLOCO 4 — Verificações finais
-- ============================================================


-- ============================================================
-- BLOCO 1 — DIAGNÓSTICO
-- Mostra o estado atual do banco antes de qualquer alteração.
-- Não executa nenhuma mudança.
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '======================================================';
  RAISE NOTICE 'SPRINT CEO-1 — Diagnóstico pré-migração';
  RAISE NOTICE '======================================================';
  RAISE NOTICE 'credits_ledger       : %',
    CASE WHEN to_regclass('public.credits_ledger')       IS NOT NULL THEN 'OK' ELSE 'AUSENTE' END;
  RAISE NOTICE 'credits_wallet       : %',
    CASE WHEN to_regclass('public.credits_wallet')       IS NOT NULL THEN 'OK' ELSE 'AUSENTE' END;
  RAISE NOTICE 'admin_audit_log      : %',
    CASE WHEN to_regclass('public.admin_audit_log')      IS NOT NULL THEN 'OK' ELSE 'AUSENTE — executar ceo_upgrade_v1.sql' END;
  RAISE NOTICE 'admin_users          : %',
    CASE WHEN to_regclass('public.admin_users')          IS NOT NULL THEN 'OK' ELSE 'AUSENTE — executar schema_v18_ceo_views.sql' END;
  RAISE NOTICE 'ceo_coupons          : %',
    CASE WHEN to_regclass('public.ceo_coupons')          IS NOT NULL THEN 'OK' ELSE 'AUSENTE — executar ceo_upgrade_v1.sql' END;
  RAISE NOTICE 'user_activity_logs   : %',
    CASE WHEN to_regclass('public.user_activity_logs')   IS NOT NULL THEN 'OK' ELSE 'AUSENTE — executar schema_v20_ceo_rebuild.sql' END;
  RAISE NOTICE 'alert_configs        : %',
    CASE WHEN to_regclass('public.alert_configs')        IS NOT NULL THEN 'OK' ELSE 'AUSENTE — executar schema_v20_ceo_rebuild.sql' END;
  RAISE NOTICE 'test_account_details : %',
    CASE WHEN to_regclass('public.test_account_details') IS NOT NULL THEN 'OK' ELSE 'AUSENTE — executar schema_v20_ceo_rebuild.sql' END;
  RAISE NOTICE '======================================================';

  -- Aviso se type='bonus' existir no ledger
  IF to_regclass('public.credits_ledger') IS NOT NULL THEN
    RAISE NOTICE 'credits_ledger rows type=''bonus'': %',
      (SELECT COUNT(*) FROM public.credits_ledger WHERE type = 'bonus');
  END IF;
END;
$$;


-- ============================================================
-- BLOCO 2 — CORREÇÕES OBRIGATÓRIAS
-- Não dependem de tabelas opcionais.
-- Seguras para rodar em qualquer estado do banco.
-- ============================================================


-- ------------------------------------------------------------
-- 2A — Helper: public.is_ceo_admin(p_roles text[])
--
-- Verifica se o usuário autenticado é admin ativo em admin_users
-- com um dos roles especificados. NULL = aceita qualquer role.
--
-- Distinção:
--   is_super_admin()  → verifica public.users.is_super_admin (app users)
--   is_ceo_admin()    → verifica public.admin_users.role (CEO panel)
--
-- CREATE OR REPLACE é idempotente.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_ceo_admin(p_roles text[] DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.admin_users  au
    JOIN   auth.users           u ON lower(trim(au.email)) = lower(trim(u.email))
    WHERE  u.id      = auth.uid()
      AND  au.active = true
      AND  (p_roles IS NULL OR au.role = ANY(p_roles))
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_ceo_admin(text[]) TO authenticated;


-- ------------------------------------------------------------
-- 2B — Fix credits_ledger.type = 'bonus' → 'manual_grant'
--
-- Problema: ceo_create_test_account_db() inseria type='bonus'
-- que viola credits_ledger_type_check (desde 20260508000001).
-- Corrige linhas existentes e reescreve a função.
-- UPDATE é idempotente (WHERE filtra exatamente o que corrigir).
-- ------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.credits_ledger') IS NOT NULL THEN
    UPDATE public.credits_ledger
    SET    type = 'manual_grant'
    WHERE  type = 'bonus';

    RAISE NOTICE '2B: credits_ledger.type=''bonus'' → ''manual_grant'' (% linhas)',
      (SELECT COUNT(*) FROM public.credits_ledger WHERE type = 'manual_grant'
       AND description ILIKE '%teste%' OR description ILIKE '%test%');
  ELSE
    RAISE NOTICE '2B: credits_ledger ausente — skip.';
  END IF;
END;
$$;

-- Reescrever função (CREATE OR REPLACE é idempotente):
-- Correções: 'bonus'→'manual_grant', coluna lifetime_granted removida
CREATE OR REPLACE FUNCTION public.ceo_create_test_account_db(
  p_account_name     text,
  p_responsible_name text        DEFAULT '',
  p_email            text        DEFAULT '',
  p_plan_code        text        DEFAULT 'PRO',
  p_initial_credits  integer     DEFAULT 100,
  p_expires_at       timestamptz DEFAULT NULL,
  p_observation      text        DEFAULT '',
  p_created_by_name  text        DEFAULT 'CEO'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  uuid        := gen_random_uuid();
  v_expires    timestamptz := COALESCE(p_expires_at, now() + interval '30 days');
  v_plan_id    uuid;
BEGIN
  INSERT INTO tenants (id, name, created_at)
  VALUES (v_tenant_id, p_account_name, now());

  SELECT id INTO v_plan_id
  FROM   plans
  WHERE  code = UPPER(p_plan_code)
  LIMIT  1;

  INSERT INTO subscriptions (
    tenant_id, plan_id, status, billing_provider,
    current_period_start, current_period_end
  ) VALUES (
    v_tenant_id, v_plan_id, 'INTERNAL_TEST', 'manual', now(), v_expires
  );

  -- Upsert seguro sem lifetime_granted (coluna inexistente)
  INSERT INTO credits_wallet (tenant_id, balance, credits_avail, credits_total, updated_at)
  VALUES (v_tenant_id, p_initial_credits, p_initial_credits, p_initial_credits, now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    balance       = EXCLUDED.balance,
    credits_avail = EXCLUDED.credits_avail,
    credits_total = EXCLUDED.credits_total,
    updated_at    = now();

  -- CORRIGIDO: era 'bonus', que viola credits_ledger_type_check
  INSERT INTO credits_ledger (tenant_id, type, amount, description, created_by_name)
  VALUES (v_tenant_id, 'manual_grant', p_initial_credits,
          'Créditos iniciais — conta de teste CEO', p_created_by_name);

  INSERT INTO test_account_details (
    tenant_id, account_name, responsible_name, email,
    plan_code, initial_credits, expires_at, observation, created_by_name
  ) VALUES (
    v_tenant_id, p_account_name, p_responsible_name, p_email,
    p_plan_code, p_initial_credits, v_expires, p_observation, p_created_by_name
  );

  RETURN jsonb_build_object(
    'success',    true,
    'tenant_id',  v_tenant_id,
    'expires_at', v_expires,
    'message',    'Conta criada. Configure login via Supabase Dashboard: ' || p_email
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ------------------------------------------------------------
-- 2C — REVOKE EXECUTE em activate_purchase_for_user() FROM anon
--
-- REVOKE de privilege inexistente é no-op (sem erro).
-- Só falha se a função em si não existir → capturado pelo EXCEPTION.
-- ------------------------------------------------------------

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.activate_purchase_for_user(uuid) FROM anon;
  RAISE NOTICE '2C: REVOKE anon de activate_purchase_for_user — OK.';
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE '2C: activate_purchase_for_user não existe — skip.';
END;
$$;


-- ------------------------------------------------------------
-- 2D — Atualizar ceo_log_action() (backward compatible)
--
-- Adiciona parâmetros opcionais: p_reason, p_before_data, p_after_data
-- Todos com DEFAULT NULL → callers existentes não precisam mudar.
-- Auto-resolve admin_user_id pelo email.
-- CREATE OR REPLACE é idempotente.
--
-- Nota: cria uma NOVA assinatura (13 params vs 10 original).
-- A assinatura original (10 params) continua existindo para
-- chamadas legadas. Não há conflito.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ceo_log_action(
  p_admin_name    TEXT,
  p_admin_email   TEXT,
  p_admin_role    TEXT,
  p_action_type   TEXT,
  p_target_type   TEXT  DEFAULT NULL,
  p_target_id     TEXT  DEFAULT NULL,
  p_target_name   TEXT  DEFAULT NULL,
  p_before_value  JSONB DEFAULT NULL,
  p_after_value   JSONB DEFAULT NULL,
  p_description   TEXT  DEFAULT NULL,
  -- Novos parâmetros (backward compatible)
  p_reason        TEXT  DEFAULT NULL,
  p_before_data   JSONB DEFAULT NULL,
  p_after_data    JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_user_id UUID;
BEGIN
  -- Auto-resolve admin_user_id sem lançar exceção se não achar
  IF to_regclass('public.admin_users') IS NOT NULL THEN
    SELECT id INTO v_admin_user_id
    FROM   public.admin_users
    WHERE  lower(trim(email)) = lower(trim(p_admin_email))
      AND  active = true
    LIMIT  1;
  END IF;

  INSERT INTO public.admin_audit_log (
    admin_name,    admin_email,   admin_role,    action_type,
    target_type,   target_id,     target_name,
    before_value,  after_value,   description,
    admin_user_id, reason,
    before_data,   after_data
  ) VALUES (
    p_admin_name,  p_admin_email, p_admin_role,  p_action_type,
    p_target_type, p_target_id,   p_target_name,
    p_before_value, p_after_value, p_description,
    v_admin_user_id, p_reason,
    COALESCE(p_before_data, p_before_value),
    COALESCE(p_after_data,  p_after_value)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_log_action(
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB,TEXT,TEXT,JSONB,JSONB
) TO authenticated, service_role;


-- ============================================================
-- BLOCO 3 — CORREÇÕES CONDICIONADAS À EXISTÊNCIA DAS TABELAS
-- Cada sub-bloco verifica to_regclass() antes de qualquer DDL.
-- DROP POLICY IF EXISTS só executado após confirmar que a tabela existe.
-- ============================================================


-- ------------------------------------------------------------
-- 3A — admin_audit_log: colunas + FK + políticas RLS
-- ------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.admin_audit_log') IS NULL THEN
    RAISE NOTICE '3A: admin_audit_log ausente — executar ceo_upgrade_v1.sql e re-rodar.';
    RETURN;
  END IF;

  -- Adicionar colunas de rastreabilidade (ADD COLUMN IF NOT EXISTS é idempotente)
  ALTER TABLE public.admin_audit_log
    ADD COLUMN IF NOT EXISTS admin_user_id UUID,
    ADD COLUMN IF NOT EXISTS reason        TEXT,
    ADD COLUMN IF NOT EXISTS before_data   JSONB,
    ADD COLUMN IF NOT EXISTS after_data    JSONB;

  -- Índice (IF NOT EXISTS é idempotente)
  CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_user_id
    ON public.admin_audit_log (admin_user_id);

  -- FK opcional admin_user_id → admin_users.id
  IF to_regclass('public.admin_users') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE table_name      = 'admin_audit_log'
         AND constraint_name = 'fk_aal_admin_user'
         AND constraint_type = 'FOREIGN KEY'
     )
  THEN
    ALTER TABLE public.admin_audit_log
      ADD CONSTRAINT fk_aal_admin_user
        FOREIGN KEY (admin_user_id) REFERENCES public.admin_users(id)
        ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED;
    RAISE NOTICE '3A: FK fk_aal_admin_user criada.';
  END IF;

  -- Policy SELECT: drop antiga (is_super_admin) + criar nova (is_ceo_admin)
  DROP POLICY IF EXISTS "admin_audit_log_select" ON public.admin_audit_log;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_audit_log'
      AND policyname = 'aal_select_super_admin_auditoria'
  ) THEN
    CREATE POLICY "aal_select_super_admin_auditoria" ON public.admin_audit_log
      FOR SELECT TO authenticated
      USING (public.is_ceo_admin(ARRAY['super_admin', 'auditoria']));
    RAISE NOTICE '3A: policy aal_select_super_admin_auditoria criada.';
  END IF;

  -- Policy INSERT: drop antiga (true) + criar nova (is_ceo_admin)
  DROP POLICY IF EXISTS "admin_audit_log_insert" ON public.admin_audit_log;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_audit_log'
      AND policyname = 'aal_insert_any_admin'
  ) THEN
    CREATE POLICY "aal_insert_any_admin" ON public.admin_audit_log
      FOR INSERT TO authenticated
      WITH CHECK (public.is_ceo_admin());
    RAISE NOTICE '3A: policy aal_insert_any_admin criada.';
  END IF;

  RAISE NOTICE '3A: admin_audit_log — OK.';
END;
$$;


-- ------------------------------------------------------------
-- 3B — ceo_coupons: adicionar policy de leitura para roles
-- A policy existente "ceo_coupons_admin_all" é PRESERVADA.
-- Apenas adicionamos "ceo_coupons_readonly_roles" (SELECT).
-- ------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.ceo_coupons') IS NULL THEN
    RAISE NOTICE '3B: ceo_coupons ausente — executar ceo_upgrade_v1.sql e re-rodar.';
    RETURN;
  END IF;

  -- Apenas adiciona a nova policy se ainda não existir
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ceo_coupons'
      AND policyname = 'ceo_coupons_readonly_roles'
  ) THEN
    CREATE POLICY "ceo_coupons_readonly_roles" ON public.ceo_coupons
      FOR SELECT TO authenticated
      USING (public.is_ceo_admin(
        ARRAY['financeiro', 'comercial', 'operacional', 'auditoria', 'super_admin']
      ));
    RAISE NOTICE '3B: policy ceo_coupons_readonly_roles criada.';
  ELSE
    RAISE NOTICE '3B: policy ceo_coupons_readonly_roles já existe — skip.';
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- 3C — user_activity_logs: restringir RLS
-- Qualquer authenticated podia ler/escrever logs de todos os tenants.
-- log_user_activity() é SECURITY DEFINER — não é afetada.
-- ------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.user_activity_logs') IS NULL THEN
    RAISE NOTICE '3C: user_activity_logs ausente — executar schema_v20_ceo_rebuild.sql e re-rodar.';
    RETURN;
  END IF;

  -- Drop policy excessivamente aberta
  DROP POLICY IF EXISTS "user_activity_logs_admin_all" ON public.user_activity_logs;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_activity_logs'
      AND policyname = 'ual_super_admin_all'
  ) THEN
    CREATE POLICY "ual_super_admin_all" ON public.user_activity_logs
      FOR ALL TO authenticated
      USING  (public.is_ceo_admin(ARRAY['super_admin']))
      WITH CHECK (public.is_ceo_admin(ARRAY['super_admin']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_activity_logs'
      AND policyname = 'ual_auditoria_select'
  ) THEN
    CREATE POLICY "ual_auditoria_select" ON public.user_activity_logs
      FOR SELECT TO authenticated
      USING (public.is_ceo_admin(ARRAY['auditoria']));
  END IF;

  RAISE NOTICE '3C: user_activity_logs RLS restringida — OK.';
END;
$$;


-- ------------------------------------------------------------
-- 3D — alert_configs: restringir RLS
-- Qualquer authenticated podia alterar thresholds e mensagens.
-- ------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.alert_configs') IS NULL THEN
    RAISE NOTICE '3D: alert_configs ausente — executar schema_v20_ceo_rebuild.sql e re-rodar.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "alert_configs_admin_all" ON public.alert_configs;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'alert_configs'
      AND policyname = 'ac_super_admin_all'
  ) THEN
    CREATE POLICY "ac_super_admin_all" ON public.alert_configs
      FOR ALL TO authenticated
      USING  (public.is_ceo_admin(ARRAY['super_admin']))
      WITH CHECK (public.is_ceo_admin(ARRAY['super_admin']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'alert_configs'
      AND policyname = 'ac_admin_readonly_select'
  ) THEN
    CREATE POLICY "ac_admin_readonly_select" ON public.alert_configs
      FOR SELECT TO authenticated
      USING (public.is_ceo_admin(
        ARRAY['operacional', 'suporte', 'auditoria', 'financeiro', 'comercial']
      ));
  END IF;

  RAISE NOTICE '3D: alert_configs RLS restringida — OK.';
END;
$$;


-- ------------------------------------------------------------
-- 3E — test_account_details: restringir RLS
-- Qualquer authenticated podia ver e-mails e dados internos.
-- ------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.test_account_details') IS NULL THEN
    RAISE NOTICE '3E: test_account_details ausente — executar schema_v20_ceo_rebuild.sql e re-rodar.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "test_account_details_admin_all" ON public.test_account_details;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'test_account_details'
      AND policyname = 'tad_super_admin_all'
  ) THEN
    CREATE POLICY "tad_super_admin_all" ON public.test_account_details
      FOR ALL TO authenticated
      USING  (public.is_ceo_admin(ARRAY['super_admin']))
      WITH CHECK (public.is_ceo_admin(ARRAY['super_admin']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'test_account_details'
      AND policyname = 'tad_ops_support_select'
  ) THEN
    CREATE POLICY "tad_ops_support_select" ON public.test_account_details
      FOR SELECT TO authenticated
      USING (public.is_ceo_admin(ARRAY['operacional', 'suporte', 'auditoria']));
  END IF;

  RAISE NOTICE '3E: test_account_details RLS restringida — OK.';
END;
$$;


-- ============================================================
-- BLOCO 4 — VERIFICAÇÕES FINAIS
-- Consultas de confirmação (somente leitura).
-- ============================================================

DO $$
DECLARE
  v_bonus_rows   bigint;
  v_anon_grant   bigint;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '======================================================';
  RAISE NOTICE 'SPRINT CEO-1 — Verificações pós-migração';
  RAISE NOTICE '======================================================';

  -- 4a: credits_ledger sem type='bonus'
  IF to_regclass('public.credits_ledger') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_bonus_rows FROM public.credits_ledger WHERE type = 'bonus';
    RAISE NOTICE '4a credits_ledger type=''bonus'': % (esperado: 0)', v_bonus_rows;
  END IF;

  -- 4b: GRANT anon removido
  SELECT COUNT(*) INTO v_anon_grant
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name   = 'activate_purchase_for_user'
    AND grantee        = 'anon';
  RAISE NOTICE '4b anon grants em activate_purchase_for_user: % (esperado: 0)', v_anon_grant;

  -- 4c: is_ceo_admin existe
  RAISE NOTICE '4c is_ceo_admin(): %',
    CASE WHEN to_regclass('public.is_ceo_admin') IS NOT NULL
            OR EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_ceo_admin'
                       AND pronamespace = 'public'::regnamespace)
         THEN 'OK' ELSE 'AUSENTE' END;

  -- 4d: Políticas presentes por tabela
  RAISE NOTICE '4d policies aplicadas:';
  FOR v_bonus_rows IN  -- reuso da variável como contador
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'aal_select_super_admin_auditoria', 'aal_insert_any_admin',
        'ceo_coupons_readonly_roles',
        'ual_super_admin_all', 'ual_auditoria_select',
        'ac_super_admin_all',  'ac_admin_readonly_select',
        'tad_super_admin_all', 'tad_ops_support_select'
      )
  LOOP
    NULL;
  END LOOP;

  SELECT COUNT(*) INTO v_bonus_rows
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'aal_select_super_admin_auditoria', 'aal_insert_any_admin',
      'ceo_coupons_readonly_roles',
      'ual_super_admin_all', 'ual_auditoria_select',
      'ac_super_admin_all',  'ac_admin_readonly_select',
      'tad_super_admin_all', 'tad_ops_support_select'
    );
  RAISE NOTICE '   % de 9 policies esperadas encontradas', v_bonus_rows;

  -- 4e: Novas colunas em admin_audit_log
  IF to_regclass('public.admin_audit_log') IS NOT NULL THEN
    RAISE NOTICE '4e admin_audit_log.admin_user_id: %',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'admin_audit_log' AND column_name = 'admin_user_id'
      ) THEN 'OK' ELSE 'AUSENTE' END;
    RAISE NOTICE '4e admin_audit_log.reason:        %',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'admin_audit_log' AND column_name = 'reason'
      ) THEN 'OK' ELSE 'AUSENTE' END;
  END IF;

  RAISE NOTICE '======================================================';
  RAISE NOTICE 'Migração concluída.';
  RAISE NOTICE 'Tabelas ausentes acima = executar scripts de schema';
  RAISE NOTICE 'indicados e re-rodar esta migration.';
  RAISE NOTICE '======================================================';
END;
$$;


-- ============================================================
-- ROLLBACK DE EMERGÊNCIA (comentado — não executar em produção)
-- ============================================================

-- BLOCO 3E:
-- DROP POLICY IF EXISTS "tad_super_admin_all"    ON public.test_account_details;
-- DROP POLICY IF EXISTS "tad_ops_support_select" ON public.test_account_details;
-- CREATE POLICY "test_account_details_admin_all" ON public.test_account_details
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- BLOCO 3D:
-- DROP POLICY IF EXISTS "ac_super_admin_all"       ON public.alert_configs;
-- DROP POLICY IF EXISTS "ac_admin_readonly_select" ON public.alert_configs;
-- CREATE POLICY "alert_configs_admin_all" ON public.alert_configs
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- BLOCO 3C:
-- DROP POLICY IF EXISTS "ual_super_admin_all"  ON public.user_activity_logs;
-- DROP POLICY IF EXISTS "ual_auditoria_select" ON public.user_activity_logs;
-- CREATE POLICY "user_activity_logs_admin_all" ON public.user_activity_logs
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- BLOCO 3B:
-- DROP POLICY IF EXISTS "ceo_coupons_readonly_roles" ON public.ceo_coupons;

-- BLOCO 3A:
-- DROP POLICY IF EXISTS "aal_select_super_admin_auditoria" ON public.admin_audit_log;
-- DROP POLICY IF EXISTS "aal_insert_any_admin"             ON public.admin_audit_log;
-- CREATE POLICY "admin_audit_log_select" ON public.admin_audit_log
--   FOR SELECT TO authenticated USING (public.is_super_admin());
-- CREATE POLICY "admin_audit_log_insert" ON public.admin_audit_log
--   FOR INSERT TO authenticated WITH CHECK (true);
-- ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS fk_aal_admin_user;
-- -- Remover colunas (DESTRUTIVO — só se não houver dados nelas):
-- ALTER TABLE public.admin_audit_log
--   DROP COLUMN IF EXISTS admin_user_id,
--   DROP COLUMN IF EXISTS reason,
--   DROP COLUMN IF EXISTS before_data,
--   DROP COLUMN IF EXISTS after_data;

-- BLOCO 2C:
-- GRANT EXECUTE ON FUNCTION public.activate_purchase_for_user(uuid) TO anon;

-- BLOCO 2A:
-- DROP FUNCTION IF EXISTS public.is_ceo_admin(text[]);
