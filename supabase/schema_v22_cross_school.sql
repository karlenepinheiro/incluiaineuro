-- schema_v22_cross_school.sql
-- Busca de aluno entre escolas, protocolos de acesso e notificações.
-- Colunas corretas do schema de produção (migrations/20260407174103_remote_schema.sql):
--   students: full_name, school_year, birth_date, school_name, student_type, is_external, created_by
--   users:    is_active (não active)

-- ── 1. Garantir que unique_code exista e tenha índice global ─────────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS unique_code TEXT UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS students_unique_code_idx
  ON public.students (unique_code)
  WHERE unique_code IS NOT NULL;

-- Backfill para alunos sem código (usa INC-XXXX-XXXX, compatível com app)
UPDATE public.students
SET unique_code = 'INC-'
  || upper(substring(md5(id::text || 'a') FROM 1 FOR 4)) || '-'
  || upper(substring(md5(id::text || 'b') FROM 5 FOR 4))
WHERE unique_code IS NULL OR unique_code = '';

-- ── 2. Protocolos de acesso entre escolas ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_access_protocols (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_code        TEXT        UNIQUE NOT NULL,
  student_id           UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  requesting_user_id   UUID        NOT NULL REFERENCES public.users(id),
  requesting_user_name TEXT        NOT NULL DEFAULT '',
  requesting_tenant_id UUID        NOT NULL REFERENCES public.tenants(id),
  requesting_school    TEXT        NOT NULL DEFAULT '',
  origin_tenant_id     UUID,
  origin_school_name   TEXT        NOT NULL DEFAULT '',
  access_type          TEXT        NOT NULL DEFAULT 'import' CHECK (access_type IN ('import', 'view', 'collaborate')),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sap_student_idx         ON public.student_access_protocols (student_id);
CREATE INDEX IF NOT EXISTS sap_requesting_user_idx ON public.student_access_protocols (requesting_user_id);
CREATE INDEX IF NOT EXISTS sap_origin_tenant_idx   ON public.student_access_protocols (origin_tenant_id);

-- Função geradora de código PROT-XXXXXX (único e seguro)
CREATE OR REPLACE FUNCTION generate_protocol_code() RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  code     TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    code := 'PROT-' || upper(substring(md5(gen_random_uuid()::text) FROM 1 FOR 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.student_access_protocols WHERE protocol_code = code
    );
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'Não foi possível gerar código de protocolo único';
    END IF;
  END LOOP;
  RETURN code;
END;
$$;

-- Default usa a função
ALTER TABLE public.student_access_protocols
  ALTER COLUMN protocol_code SET DEFAULT generate_protocol_code();

-- ── 3. Notificações ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id    UUID        REFERENCES public.tenants(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL,  -- 'student_imported', 'student_accessed', etc.
  title        TEXT        NOT NULL,
  body         TEXT        NOT NULL DEFAULT '',
  data         JSONB       NOT NULL DEFAULT '{}',
  read         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notif_user_idx   ON public.notifications (user_id,   read, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_tenant_idx ON public.notifications (tenant_id, created_at DESC);

-- ── 4. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.student_access_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications            ENABLE ROW LEVEL SECURITY;

-- Protocolos: usuário vê seus próprios registros OU registros onde é a escola origem
CREATE POLICY "sap_select" ON public.student_access_protocols
  FOR SELECT USING (
    requesting_user_id = auth.uid()
    OR origin_tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "sap_insert" ON public.student_access_protocols
  FOR INSERT WITH CHECK (requesting_user_id = auth.uid());

-- Notificações: usuário vê somente as suas
CREATE POLICY "notif_select" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notif_update" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ── 5. Função RPC: busca global de aluno por código (sem expor dados sensíveis) ──
-- Retorna apenas nome, escola e série — sem dados clínicos.
-- SECURITY DEFINER: bypassa RLS para busca cross-tenant.
-- Coluna correta: full_name (não "name"), school_year (não "grade")
CREATE OR REPLACE FUNCTION search_student_by_code(p_code TEXT)
RETURNS TABLE (
  student_id   UUID,
  student_name TEXT,
  school_name  TEXT,
  grade        TEXT,
  tenant_id    UUID,
  unique_code  TEXT
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    s.id                          AS student_id,
    s.full_name                   AS student_name,
    COALESCE(s.school_name, '')   AS school_name,
    COALESCE(s.school_year, '')   AS grade,
    s.tenant_id,
    s.unique_code
  FROM public.students s
  WHERE s.unique_code = upper(trim(p_code))
    AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION search_student_by_code(TEXT) TO authenticated;

-- ── 6. Função RPC: importar aluno externo ────────────────────────────────────
-- Cria cópia leve na tabela students com is_external=TRUE + protocolo + notificações.
-- Colunas corretas:
--   full_name  (não "name")
--   school_year (não "grade")
--   created_by UUID NOT NULL → usa p_requesting_user_id
--   users.is_active (não "active")
CREATE OR REPLACE FUNCTION import_external_student(
  p_source_student_id    UUID,
  p_requesting_user_id   UUID,
  p_requesting_user_name TEXT,
  p_requesting_tenant_id UUID,
  p_requesting_school    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_source        RECORD;
  v_new_id        UUID  := gen_random_uuid();
  v_protocol_code TEXT;
  v_origin_tenant UUID;
  v_result        JSONB;
BEGIN
  -- Busca dados do aluno origem (colunas de produção)
  SELECT * INTO v_source
  FROM public.students
  WHERE id = p_source_student_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aluno não encontrado: %', p_source_student_id;
  END IF;

  v_origin_tenant := v_source.tenant_id;

  -- Verifica se já existe vínculo deste tenant com este aluno
  IF EXISTS (
    SELECT 1 FROM public.students
    WHERE unique_code = v_source.unique_code
      AND tenant_id   = p_requesting_tenant_id
  ) THEN
    -- Já importado — retorna o existente sem duplicar
    SELECT jsonb_build_object(
      'student_id',    id,
      'protocol_code', NULL::text,
      'already_exists', TRUE,
      'student_name',  full_name
    ) INTO v_result
    FROM public.students
    WHERE unique_code = v_source.unique_code
      AND tenant_id   = p_requesting_tenant_id
    LIMIT 1;
    RETURN v_result;
  END IF;

  -- Gera código de protocolo único
  v_protocol_code := generate_protocol_code();

  -- Cria cópia como aluno externo no tenant solicitante
  -- Usa colunas reais do schema de produção:
  --   full_name, school_year, birth_date, school_name, student_type, is_external,
  --   external_school_name, created_by (NOT NULL), tenant_id
  INSERT INTO public.students (
    id,
    tenant_id,
    created_by,
    full_name,
    birth_date,
    school_year,
    school_name,
    unique_code,
    is_external,
    external_school_name,
    student_type,
    created_at,
    updated_at
  ) VALUES (
    v_new_id,
    p_requesting_tenant_id,
    p_requesting_user_id,                                       -- created_by (NOT NULL)
    v_source.full_name,
    v_source.birth_date,
    v_source.school_year,
    v_source.school_name,
    v_source.unique_code,
    TRUE,
    COALESCE(v_source.school_name, 'Escola de origem'),
    COALESCE(v_source.student_type, 'com_laudo'),
    NOW(),
    NOW()
  );

  -- Registra protocolo de acesso
  INSERT INTO public.student_access_protocols (
    protocol_code,
    student_id,
    requesting_user_id,
    requesting_user_name,
    requesting_tenant_id,
    requesting_school,
    origin_tenant_id,
    origin_school_name,
    access_type
  ) VALUES (
    v_protocol_code,
    p_source_student_id,
    p_requesting_user_id,
    p_requesting_user_name,
    p_requesting_tenant_id,
    p_requesting_school,
    v_origin_tenant,
    COALESCE(v_source.school_name, ''),
    'import'
  );

  -- Notificação para o professor solicitante (confirmação)
  INSERT INTO public.notifications (user_id, tenant_id, type, title, body, data)
  VALUES (
    p_requesting_user_id,
    p_requesting_tenant_id,
    'student_imported',
    'Aluno importado com sucesso',
    'O aluno ' || v_source.full_name || ' foi vinculado à sua base. Protocolo: ' || v_protocol_code,
    jsonb_build_object(
      'student_id',    v_new_id::text,
      'student_name',  v_source.full_name,
      'protocol_code', v_protocol_code,
      'origin_school', v_source.school_name
    )
  );

  -- Notificação para professores da escola de origem
  -- Usa is_active (coluna correta — não "active")
  INSERT INTO public.notifications (user_id, tenant_id, type, title, body, data)
  SELECT
    u.id,
    v_origin_tenant,
    'student_accessed',
    'Acesso ao prontuário do aluno',
    'O professor ' || p_requesting_user_name
      || ' (' || p_requesting_school || ') acessou os dados do aluno '
      || v_source.full_name || '. Protocolo: ' || v_protocol_code,
    jsonb_build_object(
      'student_id',       p_source_student_id::text,
      'student_name',     v_source.full_name,
      'protocol_code',    v_protocol_code,
      'requesting_user',  p_requesting_user_name,
      'requesting_school', p_requesting_school
    )
  FROM public.users u
  WHERE u.tenant_id = v_origin_tenant
    AND u.is_active = TRUE;           -- coluna correta: is_active (não "active")

  v_result := jsonb_build_object(
    'student_id',    v_new_id,
    'protocol_code', v_protocol_code,
    'already_exists', FALSE,
    'student_name',  v_source.full_name
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION import_external_student(UUID, UUID, TEXT, UUID, TEXT) TO authenticated;
