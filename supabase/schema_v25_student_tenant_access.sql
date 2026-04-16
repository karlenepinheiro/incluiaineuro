-- schema_v25_student_tenant_access.sql
-- Corrige a arquitetura de importação de alunos entre escolas.
-- Problema: import_external_student (v22) tentava criar nova linha em students
-- com o mesmo unique_code, violando a constraint UNIQUE global.
-- Solução: vínculo via student_tenant_access — sem duplicação de linha.
-- Executar APÓS schema_v22_cross_school.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABELA: student_tenant_access
-- Registra que um tenant tem acesso a um aluno de outro tenant.
-- Substitui o padrão de duplicar a linha em students com is_external=TRUE.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_tenant_access (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES public.students(id)  ON DELETE CASCADE,
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id)   ON DELETE CASCADE,
  access_type TEXT        NOT NULL DEFAULT 'external'
                CHECK (access_type IN ('external', 'guest', 'collaborate')),
  protocol_id UUID        REFERENCES public.student_access_protocols(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,

  -- Um tenant não pode ter dois vínculos com o mesmo aluno
  UNIQUE (student_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS sta_tenant_idx  ON public.student_tenant_access (tenant_id);
CREATE INDEX IF NOT EXISTS sta_student_idx ON public.student_tenant_access (student_id);

COMMENT ON TABLE  public.student_tenant_access IS
  'Vínculo entre aluno (de outro tenant) e escola que solicitou acesso. '
  'Não duplica a linha na tabela students — apenas cria um ponteiro com protocolo.';
COMMENT ON COLUMN public.student_tenant_access.access_type IS
  'external = aluno de outra escola; guest = acesso temporário; collaborate = co-atendimento';

-- RLS: cada tenant enxerga apenas seus próprios vínculos
ALTER TABLE public.student_tenant_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sta_tenant_isolation" ON public.student_tenant_access;
CREATE POLICY "sta_tenant_isolation" ON public.student_tenant_access
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. REESCREVER import_external_student
-- Antes: criava nova linha em students com mesmo unique_code → erro 23505.
-- Agora: cria apenas um vínculo em student_tenant_access + protocolo + notifs.
-- Retorna o mesmo JSONB shape para não quebrar o frontend existente.
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_protocol_code TEXT;
  v_protocol_id   UUID;
  v_origin_tenant UUID;
  v_result        JSONB;
BEGIN
  -- Busca aluno de origem (qualquer tenant — SECURITY DEFINER bypassa RLS)
  SELECT id, full_name, tenant_id, school_name, unique_code
  INTO v_source
  FROM public.students
  WHERE id = p_source_student_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aluno não encontrado: %', p_source_student_id;
  END IF;

  v_origin_tenant := v_source.tenant_id;

  -- Não permite vincular o próprio aluno (mesmo tenant)
  IF v_origin_tenant = p_requesting_tenant_id THEN
    RETURN jsonb_build_object(
      'student_id',     p_source_student_id,
      'protocol_code',  NULL::text,
      'already_exists', TRUE,
      'same_tenant',    TRUE,
      'student_name',   v_source.full_name
    );
  END IF;

  -- Vínculo já existe? Não duplica — retorna o existente
  IF EXISTS (
    SELECT 1 FROM public.student_tenant_access
    WHERE student_id = p_source_student_id
      AND tenant_id  = p_requesting_tenant_id
  ) THEN
    RETURN jsonb_build_object(
      'student_id',     p_source_student_id,
      'protocol_code',  NULL::text,
      'already_exists', TRUE,
      'same_tenant',    FALSE,
      'student_name',   v_source.full_name
    );
  END IF;

  -- Gera protocolo único
  v_protocol_code := generate_protocol_code();

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
  ) RETURNING id INTO v_protocol_id;

  -- Cria o vínculo (sem duplicar linha em students)
  INSERT INTO public.student_tenant_access (
    student_id,
    tenant_id,
    access_type,
    protocol_id,
    granted_by
  ) VALUES (
    p_source_student_id,
    p_requesting_tenant_id,
    'external',
    v_protocol_id,
    p_requesting_user_id
  );

  -- Notificação para o professor solicitante
  INSERT INTO public.notifications (user_id, tenant_id, type, title, body, data)
  VALUES (
    p_requesting_user_id,
    p_requesting_tenant_id,
    'student_imported',
    'Aluno adicionado à sua escola',
    'O aluno ' || v_source.full_name || ' foi vinculado à sua escola. Protocolo: ' || v_protocol_code,
    jsonb_build_object(
      'student_id',    p_source_student_id::text,
      'student_name',  v_source.full_name,
      'protocol_code', v_protocol_code,
      'origin_school', COALESCE(v_source.school_name, '')
    )
  );

  -- Notificação para cada professor da escola de origem
  INSERT INTO public.notifications (user_id, tenant_id, type, title, body, data)
  SELECT
    u.id,
    v_origin_tenant,
    'student_accessed',
    'Aluno acessado por outra escola',
    'O professor ' || p_requesting_user_name
      || ' (' || p_requesting_school || ') vinculou o aluno '
      || v_source.full_name || ' à escola dele. Protocolo: ' || v_protocol_code,
    jsonb_build_object(
      'student_id',        p_source_student_id::text,
      'student_name',      v_source.full_name,
      'protocol_code',     v_protocol_code,
      'requesting_user',   p_requesting_user_name,
      'requesting_school', p_requesting_school
    )
  FROM public.users u
  WHERE u.tenant_id = v_origin_tenant
    AND u.is_active  = TRUE;

  RETURN jsonb_build_object(
    'student_id',     p_source_student_id,
    'protocol_code',  v_protocol_code,
    'already_exists', FALSE,
    'same_tenant',    FALSE,
    'student_name',   v_source.full_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION import_external_student(UUID, UUID, TEXT, UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LIMPAR alunos duplicados criados pela versão anterior (is_external=TRUE
--    com o mesmo unique_code de outro aluno). Transforma em vínculo correto.
-- Executar apenas uma vez — idempotente graças ao INSERT ... ON CONFLICT DO NOTHING.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  dup RECORD;
  v_origin_id UUID;
BEGIN
  -- Para cada aluno marcado como externo que tem unique_code duplicado
  FOR dup IN
    SELECT s.id         AS dup_id,
           s.tenant_id  AS dup_tenant,
           s.unique_code
    FROM   public.students s
    WHERE  s.is_external = TRUE
      AND  EXISTS (
             SELECT 1 FROM public.students s2
             WHERE  s2.unique_code = s.unique_code
               AND  s2.id         <> s.id
               AND  s2.is_external = FALSE
           )
  LOOP
    -- Busca o aluno "original" (não externo) com o mesmo código
    SELECT id INTO v_origin_id
    FROM   public.students
    WHERE  unique_code  = dup.unique_code
      AND  is_external  = FALSE
    LIMIT 1;

    IF v_origin_id IS NOT NULL THEN
      -- Cria vínculo correto (ignora se já existir)
      INSERT INTO public.student_tenant_access (student_id, tenant_id, access_type)
      VALUES (v_origin_id, dup.dup_tenant, 'external')
      ON CONFLICT (student_id, tenant_id) DO NOTHING;

      -- Remove a linha duplicada (era um aluno fantasma)
      DELETE FROM public.students WHERE id = dup.dup_id;
    END IF;
  END LOOP;
END;
$$;
