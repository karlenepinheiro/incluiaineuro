-- =============================================================================
-- INCLUIAI — PASSO 2: SCHEMA LIMPO
-- Execute APÓS o 01_reset.sql
-- =============================================================================

-- =============================================================================
-- FUNÇÕES
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_audit_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  chars  TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i      INT;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- TABELAS
-- =============================================================================

-- PLANS
CREATE TABLE public.plans (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT          NOT NULL UNIQUE,
  max_students         INT           NOT NULL DEFAULT 5,
  ai_credits_per_month INT           NOT NULL DEFAULT 0,
  price_brl            NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active            BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

INSERT INTO public.plans (name, max_students, ai_credits_per_month, price_brl) VALUES
  ('FREE',   5,   0,  0.00),
  ('PRO',    30,  50, 79.90),
  ('MASTER', 999, 70, 149.90);

-- TENANTS
CREATE TABLE public.tenants (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  document   TEXT,
  plan_id    UUID        REFERENCES public.plans(id),
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- USERS
CREATE TABLE public.users (
  id             UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id      UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name      TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  role           TEXT        NOT NULL DEFAULT 'TEACHER'
                              CHECK (role IN ('TEACHER','AEE','COORDINATOR','MANAGER','ADMIN')),
  is_super_admin BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Funções que dependem da tabela users (criadas APÓS a tabela existir)
CREATE OR REPLACE FUNCTION public.my_tenant_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT COALESCE(is_super_admin, false) FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

-- SUBSCRIPTIONS
CREATE TABLE public.subscriptions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id              UUID        NOT NULL REFERENCES public.plans(id),
  status               TEXT        NOT NULL DEFAULT 'ACTIVE'
                                    CHECK (status IN ('ACTIVE','TRIALING','PAST_DUE','CANCELLED')),
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  provider             TEXT        DEFAULT 'manual',
  provider_sub_id      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CREDITS WALLET
CREATE TABLE public.credits_wallet (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  balance       INT         NOT NULL DEFAULT 0,
  last_reset_at TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CREDITS LEDGER
CREATE TABLE public.credits_ledger (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES public.users(id),
  type        TEXT        NOT NULL CHECK (type IN ('monthly_grant','usage_ai','manual_grant','refund')),
  amount      INT         NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- STUDENTS
CREATE TABLE public.students (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by            UUID        NOT NULL REFERENCES public.users(id),
  full_name             TEXT        NOT NULL,
  birth_date            DATE,
  gender                TEXT        CHECK (gender IN ('M','F','OTHER')),
  cpf                   TEXT,
  school_name           TEXT,
  school_year           TEXT,
  class_name            TEXT,
  teacher_name          TEXT,
  primary_diagnosis     TEXT,
  secondary_diagnoses   TEXT[]      DEFAULT '{}',
  cid_codes             TEXT[]      DEFAULT '{}',
  learning_needs        TEXT,
  behavioral_notes      TEXT,
  medical_notes         TEXT,
  guardian_name         TEXT,
  guardian_phone        TEXT,
  guardian_email        TEXT,
  guardian_relationship TEXT,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DOCUMENTS (Estudo de Caso / PAEE / PEI / PDI)
CREATE TABLE public.documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id      UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_by      UUID        NOT NULL REFERENCES public.users(id),
  doc_type        TEXT        NOT NULL CHECK (doc_type IN ('ESTUDO_CASO','PAEE','PEI','PDI')),
  source_id       UUID        REFERENCES public.documents(id),
  title           TEXT        NOT NULL,
  structured_data JSONB       NOT NULL DEFAULT '{}',
  status          TEXT        NOT NULL DEFAULT 'DRAFT'
                               CHECK (status IN ('DRAFT','REVIEW','APPROVED','SIGNED')),
  audit_code      TEXT        UNIQUE DEFAULT public.generate_audit_code(),
  content_hash    TEXT,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DOCUMENT VERSIONS
CREATE TABLE public.document_versions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number  INT         NOT NULL,
  structured_data JSONB       NOT NULL DEFAULT '{}',
  content_hash    TEXT,
  changed_by      UUID        NOT NULL REFERENCES public.users(id),
  change_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version_number)
);

-- PROFESSIONAL SIGNATURES
CREATE TABLE public.professional_signatures (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  signature_data TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DOCUMENT SIGNATURES
CREATE TABLE public.document_signatures (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  signed_by      UUID        NOT NULL REFERENCES public.users(id),
  signer_role    TEXT,
  signature_data TEXT,
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TASKS
CREATE TABLE public.tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by  UUID        NOT NULL REFERENCES public.users(id),
  assigned_to UUID        REFERENCES public.users(id),
  student_id  UUID        REFERENCES public.students(id),
  document_id UUID        REFERENCES public.documents(id),
  title       TEXT        NOT NULL,
  description TEXT,
  priority    TEXT        NOT NULL DEFAULT 'MEDIUM'
                           CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  status      TEXT        NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING','IN_PROGRESS','DONE','CANCELLED')),
  due_date    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES public.tenants(id),
  user_id      UUID        REFERENCES public.users(id),
  entity_type  TEXT        NOT NULL,
  entity_id    UUID,
  action       TEXT        NOT NULL,
  content_hash TEXT,
  audit_code   TEXT        UNIQUE DEFAULT public.generate_audit_code(),
  metadata     JSONB       DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TRIGGERS updated_at (explícitos, sem loop)
-- =============================================================================

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_credits_wallet_updated_at
  BEFORE UPDATE ON public.credits_wallet
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_profsig_updated_at
  BEFORE UPDATE ON public.professional_signatures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- TRIGGER: Auto-cria tenant + user no signup do Supabase Auth
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  v_tenant_id    UUID;
  v_free_plan_id UUID;
BEGIN
  -- Verifica se foi passado um tenant_id nos metadados (seed / migração)
  v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;

  IF v_tenant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id) THEN
    -- Tenant já existe: apenas cria o usuário vinculado a ele
    NULL;
  ELSE
    -- Signup normal: cria tenant + subscription + wallet do zero
    SELECT id INTO v_free_plan_id FROM public.plans WHERE name = 'FREE' LIMIT 1;

    INSERT INTO public.tenants (name, plan_id)
    VALUES (
      COALESCE(NEW.raw_user_meta_data->>'organization_name', 'Minha Escola'),
      v_free_plan_id
    ) RETURNING id INTO v_tenant_id;

    INSERT INTO public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
    VALUES (v_tenant_id, v_free_plan_id, 'ACTIVE', NOW(), NOW() + INTERVAL '30 days');

    INSERT INTO public.credits_wallet (tenant_id, balance, last_reset_at)
    VALUES (v_tenant_id, 0, NOW());
  END IF;

  -- Cria o perfil em public.users (ON CONFLICT ignora se já existir)
  INSERT INTO public.users (id, tenant_id, full_name, email, role, is_super_admin)
  VALUES (
    NEW.id,
    v_tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'TEACHER'),
    COALESCE((NEW.raw_user_meta_data->>'is_super_admin')::BOOLEAN, false)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- ÍNDICES
-- =============================================================================

CREATE INDEX idx_users_tenant         ON public.users(tenant_id);
CREATE INDEX idx_students_tenant      ON public.students(tenant_id);
CREATE INDEX idx_students_active      ON public.students(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_student    ON public.documents(student_id);
CREATE INDEX idx_documents_type       ON public.documents(tenant_id, doc_type);
CREATE INDEX idx_documents_source     ON public.documents(source_id);
CREATE INDEX idx_documents_active     ON public.documents(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_tenant         ON public.tasks(tenant_id);
CREATE INDEX idx_tasks_assigned       ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_student        ON public.tasks(student_id);
CREATE INDEX idx_ledger_tenant        ON public.credits_ledger(tenant_id);
CREATE INDEX idx_audit_entity         ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_tenant         ON public.audit_logs(tenant_id);
CREATE INDEX idx_doc_versions_doc     ON public.document_versions(document_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.plans                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credits_wallet          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credits_ledger          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_signatures     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs              ENABLE ROW LEVEL SECURITY;

-- PLANS: qualquer um pode ver
CREATE POLICY "plans_select"
  ON public.plans FOR SELECT USING (true);

-- TENANTS
CREATE POLICY "tenants_super_admin"
  ON public.tenants FOR ALL USING (public.is_super_admin());
CREATE POLICY "tenants_own"
  ON public.tenants FOR ALL
  USING (id = public.my_tenant_id())
  WITH CHECK (id = public.my_tenant_id());

-- USERS
CREATE POLICY "users_super_admin"
  ON public.users FOR ALL USING (public.is_super_admin());
CREATE POLICY "users_own_tenant"
  ON public.users FOR ALL
  USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- SUBSCRIPTIONS
CREATE POLICY "subs_super_admin"
  ON public.subscriptions FOR ALL USING (public.is_super_admin());
CREATE POLICY "subs_own"
  ON public.subscriptions FOR ALL
  USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- CREDITS WALLET
CREATE POLICY "wallet_super_admin"
  ON public.credits_wallet FOR ALL USING (public.is_super_admin());
CREATE POLICY "wallet_own"
  ON public.credits_wallet FOR ALL
  USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- CREDITS LEDGER
CREATE POLICY "ledger_super_admin"
  ON public.credits_ledger FOR ALL USING (public.is_super_admin());
CREATE POLICY "ledger_own"
  ON public.credits_ledger FOR ALL
  USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- STUDENTS
CREATE POLICY "students_super_admin"
  ON public.students FOR ALL USING (public.is_super_admin());
CREATE POLICY "students_own"
  ON public.students FOR ALL
  USING (tenant_id = public.my_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = public.my_tenant_id());

-- DOCUMENTS
CREATE POLICY "docs_super_admin"
  ON public.documents FOR ALL USING (public.is_super_admin());
CREATE POLICY "docs_own"
  ON public.documents FOR ALL
  USING (tenant_id = public.my_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = public.my_tenant_id());

-- DOCUMENT VERSIONS
CREATE POLICY "docver_own"
  ON public.document_versions FOR ALL
  USING (document_id IN (
    SELECT id FROM public.documents WHERE tenant_id = public.my_tenant_id()
  ));

-- PROFESSIONAL SIGNATURES
CREATE POLICY "profsig_own"
  ON public.professional_signatures FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DOCUMENT SIGNATURES
CREATE POLICY "docsig_own"
  ON public.document_signatures FOR ALL
  USING (document_id IN (
    SELECT id FROM public.documents WHERE tenant_id = public.my_tenant_id()
  ));

-- TASKS
CREATE POLICY "tasks_super_admin"
  ON public.tasks FOR ALL USING (public.is_super_admin());
CREATE POLICY "tasks_own"
  ON public.tasks FOR ALL
  USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- AUDIT LOGS (imutável: sem DELETE)
CREATE POLICY "audit_super_admin"
  ON public.audit_logs FOR SELECT USING (public.is_super_admin());
CREATE POLICY "audit_select"
  ON public.audit_logs FOR SELECT
  USING (tenant_id = public.my_tenant_id());
CREATE POLICY "audit_insert"
  ON public.audit_logs FOR INSERT
  WITH CHECK (tenant_id = public.my_tenant_id() OR public.is_super_admin());

-- =============================================================================
-- GRANTS
-- =============================================================================

GRANT USAGE  ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL    ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT SELECT ON public.plans  TO anon;
GRANT ALL    ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT ALL    ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_tenant_id()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_audit_code() TO authenticated;

SELECT 'Schema criado com sucesso. Pode rodar 03_seed.sql agora.' AS status;
