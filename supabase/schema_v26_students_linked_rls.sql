-- schema_v26_students_linked_rls.sql
-- Corrige: alunos vinculados via student_tenant_access não aparecem na listagem.
-- Causa: RLS "students_own" bloqueia o join PostgREST para alunos de outro tenant.
-- Solução: policy adicional de SELECT para alunos acessíveis via student_tenant_access.
-- As policies em Supabase se combinam com OR — alunos próprios OU vinculados.
-- Executar APÓS schema_v25_student_tenant_access.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Policy SELECT: permite ler alunos vinculados via student_tenant_access
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "students_linked_select" ON public.students;

CREATE POLICY "students_linked_select"
  ON public.students
  FOR SELECT
  USING (
    id IN (
      SELECT sta.student_id
      FROM   public.student_tenant_access sta
      WHERE  sta.tenant_id = (
        SELECT u.tenant_id
        FROM   public.users u
        WHERE  u.id = auth.uid()
        LIMIT 1
      )
    )
  );

COMMENT ON POLICY "students_linked_select" ON public.students IS
  'Permite que um tenant leia alunos de outros tenants vinculados via student_tenant_access. '
  'Combinada via OR com students_own (alunos do próprio tenant).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Verificação: conta vínculos por tenant (diagnóstico, só SELECT)
-- ─────────────────────────────────────────────────────────────────────────────
-- Rode este SELECT no Supabase Studio para confirmar que os vínculos existem
-- e que o join agora retorna dados:
--
-- SELECT
--   sta.tenant_id,
--   sta.access_type,
--   sta.granted_at,
--   s.id          AS student_id,
--   s.full_name   AS student_name,
--   s.tenant_id   AS origin_tenant_id
-- FROM public.student_tenant_access sta
-- JOIN public.students s ON s.id = sta.student_id
-- ORDER BY sta.granted_at DESC
-- LIMIT 50;
