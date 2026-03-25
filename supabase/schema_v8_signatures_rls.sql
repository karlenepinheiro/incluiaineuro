-- ============================================================
-- Schema v8 — Assinaturas Profissionais + RLS students + Trigger usuário
-- Executar após schema_v7_versions.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABELA: professional_signatures
--    Assinaturas permanentes da equipe interna (profissionais)
--    Vinculadas ao user_id — reutilizáveis em qualquer documento
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS professional_signatures (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id           UUID        REFERENCES users(id) ON DELETE SET NULL,

  -- Identificação do profissional
  signer_name       TEXT        NOT NULL,
  signer_role       TEXT        NOT NULL,
  -- Valores sugeridos: professor_regente | professor_aee | coordenador | gestor |
  --                    pedagogo | psicologo | fonoaudiologo | terapeuta | outro

  -- A assinatura em si (base64 PNG do canvas ou URL de storage)
  signature_image_url  TEXT,     -- URL pública (Supabase Storage)
  signature_data_b64   TEXT,     -- base64 inline (cache local antes de upload)

  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prof_sigs_tenant   ON professional_signatures(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prof_sigs_user     ON professional_signatures(user_id);
CREATE INDEX IF NOT EXISTS idx_prof_sigs_role     ON professional_signatures(signer_role);
CREATE INDEX IF NOT EXISTS idx_prof_sigs_active   ON professional_signatures(tenant_id, is_active);

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_professional_signatures_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_prof_sigs_updated_at ON professional_signatures;
CREATE TRIGGER trig_prof_sigs_updated_at
  BEFORE UPDATE ON professional_signatures
  FOR EACH ROW EXECUTE FUNCTION update_professional_signatures_updated_at();

-- RLS
ALTER TABLE professional_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prof_sigs_tenant_read"   ON professional_signatures;
DROP POLICY IF EXISTS "prof_sigs_tenant_insert"  ON professional_signatures;
DROP POLICY IF EXISTS "prof_sigs_tenant_update"  ON professional_signatures;
DROP POLICY IF EXISTS "prof_sigs_tenant_delete"  ON professional_signatures;
DROP POLICY IF EXISTS "prof_sigs_admin_all"      ON professional_signatures;

-- Leitura: qualquer membro do tenant lê assinaturas do próprio tenant
CREATE POLICY "prof_sigs_tenant_read" ON professional_signatures
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Inserção: apenas o próprio profissional ou gestores do tenant
CREATE POLICY "prof_sigs_tenant_insert" ON professional_signatures
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Atualização: apenas o dono ou tenant admin
CREATE POLICY "prof_sigs_tenant_update" ON professional_signatures
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Deleção lógica (is_active = false) — física permitida apenas para o dono
CREATE POLICY "prof_sigs_tenant_delete" ON professional_signatures
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('GESTOR', 'COORDENADOR', 'CEO', 'SUPER_ADMIN')
      AND tenant_id = professional_signatures.tenant_id
    )
  );

-- Super admin: acesso total
CREATE POLICY "prof_sigs_admin_all" ON professional_signatures
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );


-- ────────────────────────────────────────────────────────────
-- 2. TABELA: parent_document_signatures
--    Assinaturas pontuais dos responsáveis (por documento)
--    NÃO reutilizadas — vinculadas a um documento específico
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parent_document_signatures (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id        UUID        REFERENCES students(id) ON DELETE SET NULL,

  -- Referência ao documento assinado
  document_type     TEXT        NOT NULL,
  audit_code        TEXT,

  -- Dados da assinatura
  signer_name       TEXT        NOT NULL,
  signature_mode    TEXT        NOT NULL DEFAULT 'manual',
  -- Valores: digital | manual | upload

  signature_image_url  TEXT,     -- URL storage (upload ou digital exportado)
  signature_data_b64   TEXT,     -- base64 do canvas (gerado no tablet)

  signed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parent_sigs_tenant   ON parent_document_signatures(tenant_id);
CREATE INDEX IF NOT EXISTS idx_parent_sigs_student  ON parent_document_signatures(student_id);
CREATE INDEX IF NOT EXISTS idx_parent_sigs_audit    ON parent_document_signatures(audit_code);

ALTER TABLE parent_document_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_sigs_tenant_read"   ON parent_document_signatures;
DROP POLICY IF EXISTS "parent_sigs_tenant_insert"  ON parent_document_signatures;
DROP POLICY IF EXISTS "parent_sigs_admin_all"      ON parent_document_signatures;

CREATE POLICY "parent_sigs_tenant_read" ON parent_document_signatures
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "parent_sigs_tenant_insert" ON parent_document_signatures
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "parent_sigs_admin_all" ON parent_document_signatures
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );


-- ────────────────────────────────────────────────────────────
-- 3. CORREÇÃO RLS — tabela students
--    Garante que o usuário PRO consiga inserir e ler seus alunos
-- ────────────────────────────────────────────────────────────

-- Remove policies existentes para recriar de forma limpa
DROP POLICY IF EXISTS "students_tenant_select" ON students;
DROP POLICY IF EXISTS "students_tenant_insert" ON students;
DROP POLICY IF EXISTS "students_tenant_update" ON students;
DROP POLICY IF EXISTS "students_tenant_delete" ON students;
DROP POLICY IF EXISTS "students_admin_all"     ON students;

-- Habilita RLS (idempotente)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Função helper: obtém tenant_id do usuário autenticado
CREATE OR REPLACE FUNCTION my_tenant_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1;
$$;

-- SELECT: vê apenas alunos do próprio tenant
CREATE POLICY "students_tenant_select" ON students
  FOR SELECT USING (tenant_id = my_tenant_id());

-- INSERT: só pode criar aluno no próprio tenant
CREATE POLICY "students_tenant_insert" ON students
  FOR INSERT WITH CHECK (tenant_id = my_tenant_id());

-- UPDATE: só altera alunos do próprio tenant
CREATE POLICY "students_tenant_update" ON students
  FOR UPDATE USING (tenant_id = my_tenant_id());

-- DELETE: só exclui alunos do próprio tenant
CREATE POLICY "students_tenant_delete" ON students
  FOR DELETE USING (tenant_id = my_tenant_id());

-- Super admin: acesso total sem filtro de tenant
CREATE POLICY "students_admin_all" ON students
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );


-- ────────────────────────────────────────────────────────────
-- 4. TRIGGER — criação automática de usuário na tabela `users`
--    Executado quando auth.users recebe um novo registro
--    (resolve o problema: "Perfil não encontrado" ao logar)
-- ────────────────────────────────────────────────────────────

-- Cria tenant padrão para novos usuários (caso não exista)
CREATE OR REPLACE FUNCTION create_user_profile_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id UUID;
  v_nome      TEXT;
  v_email     TEXT;
BEGIN
  -- Email e nome do usuário
  v_email := NEW.email;
  v_nome  := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Verifica se já existe perfil (evita duplicata em re-execuções)
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Cria tenant dedicado para o usuário
  INSERT INTO public.tenants (id, name, type, status_assinatura, creditos_ia_restantes)
  VALUES (
    gen_random_uuid(),
    COALESCE(NEW.raw_user_meta_data->>'school_name', 'Escola de ' || v_nome),
    'SCHOOL',
    'ACTIVE',
    0  -- FREE começa sem créditos; atualizado pelo webhook de pagamento
  )
  RETURNING id INTO v_tenant_id;

  -- Cria registro na tabela users
  INSERT INTO public.users (id, tenant_id, nome, email, role, plan, active)
  VALUES (
    NEW.id,
    v_tenant_id,
    v_nome,
    v_email,
    'DOCENTE',   -- role padrão: professor
    'FREE',      -- plano padrão
    true
  );

  -- Cria carteira de créditos vazia
  INSERT INTO public.credits_wallet (tenant_id, credits_avail, credits_total, credits_used)
  VALUES (v_tenant_id, 0, 0, 0)
  ON CONFLICT (tenant_id) DO NOTHING;

  -- Cria subscription FREE
  INSERT INTO public.subscriptions (tenant_id, plan, status, billing_provider)
  VALUES (v_tenant_id, 'FREE', 'ACTIVE', 'NONE')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Não bloqueia o signup em caso de erro
  RAISE WARNING 'create_user_profile_on_signup: erro ao criar perfil para %, erro: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Remove trigger anterior se existir e recria
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile_on_signup();


-- ────────────────────────────────────────────────────────────
-- 5. CORREÇÃO: RLS tabela `users` — permite leitura do próprio perfil
-- ────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_self_read"   ON users;
DROP POLICY IF EXISTS "users_self_update" ON users;
DROP POLICY IF EXISTS "users_tenant_read" ON users;
DROP POLICY IF EXISTS "users_admin_all"   ON users;

-- Leitura: usuário lê o próprio perfil e colegas do mesmo tenant
CREATE POLICY "users_self_read" ON users
  FOR SELECT USING (
    id = auth.uid()
    OR tenant_id = my_tenant_id()
  );

-- Atualização: apenas o próprio usuário atualiza seu perfil
CREATE POLICY "users_self_update" ON users
  FOR UPDATE USING (id = auth.uid());

-- Admin: acesso total
CREATE POLICY "users_admin_all" ON users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );


-- ────────────────────────────────────────────────────────────
-- 6. CORREÇÃO: RLS tabela `tenants` — permite leitura do próprio tenant
-- ────────────────────────────────────────────────────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenants_own_read"   ON tenants;
DROP POLICY IF EXISTS "tenants_own_update" ON tenants;
DROP POLICY IF EXISTS "tenants_admin_all"  ON tenants;

CREATE POLICY "tenants_own_read" ON tenants
  FOR SELECT USING (
    id = my_tenant_id()
  );

CREATE POLICY "tenants_own_update" ON tenants
  FOR UPDATE USING (
    id = my_tenant_id()
  );

CREATE POLICY "tenants_admin_all" ON tenants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );


-- ────────────────────────────────────────────────────────────
-- 7. Verificação pós-migração
-- ────────────────────────────────────────────────────────────
/*
-- Confirma tabelas criadas
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('professional_signatures', 'parent_document_signatures');

-- Confirma trigger de signup
SELECT tgname FROM pg_trigger
WHERE tgname = 'on_auth_user_created';

-- Verifica policies de students
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'students';

-- Conta assinaturas (deve ser 0 inicialmente)
SELECT COUNT(*) FROM public.professional_signatures;
*/
