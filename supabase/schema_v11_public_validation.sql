-- ============================================================
-- MIGRATION v11 — Validação pública de documentos
-- Objetivo: permitir que qualquer pessoa (anon) valide um
--           documento pelo audit_code sem precisar de login.
-- ============================================================

-- Função pública SECURITY DEFINER: ignora RLS e consulta
-- documents + students diretamente pelo audit_code.
-- CORRIGIDO:
--   - d.type  → d.doc_type  (nome real da coluna)
--   - d.student_name → JOIN com students.full_name
--   - filtro d.deleted_at IS NULL para excluir documentos apagados
CREATE OR REPLACE FUNCTION public.validate_document_public(p_code text)
RETURNS TABLE(
  audit_code      text,
  document_type   text,
  student_name    text,
  issued_at       timestamptz,
  status          text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.audit_code,
    d.doc_type           AS document_type,
    COALESCE(s.full_name, 'Aluno não identificado') AS student_name,
    d.created_at         AS issued_at,
    'VÁLIDO'::text       AS status
  FROM public.documents d
  LEFT JOIN public.students s ON s.id = d.student_id
  WHERE d.audit_code = p_code
    AND d.deleted_at IS NULL
  LIMIT 1;
$$;

-- Garante acesso anônimo e autenticado
GRANT EXECUTE ON FUNCTION public.validate_document_public(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_document_public(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_document_public(text) TO service_role;

-- ============================================================
-- NOTA: Rodar este arquivo no Supabase SQL Editor.
-- Não requer alteração de schema — apenas recria a função.
-- ============================================================
