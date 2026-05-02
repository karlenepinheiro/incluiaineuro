-- ═══════════════════════════════════════════════════════════════════════════
-- PERFIL INTELIGENTE DO ALUNO — Migração
-- Tabela: student_intelligent_profiles
-- Armazena histórico de versões do Perfil Inteligente gerado por IA
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.student_intelligent_profiles (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid        NOT NULL,
  tenant_id         uuid        NOT NULL,
  generated_by      uuid,
  generated_by_name text,
  version_number    integer     NOT NULL DEFAULT 1,
  profile_json      jsonb       NOT NULL DEFAULT '{}',
  generation_type   text        NOT NULL DEFAULT 'initial', -- 'initial' | 'update'
  summary           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_sip_student_id  ON public.student_intelligent_profiles (student_id);
CREATE INDEX IF NOT EXISTS idx_sip_tenant_id   ON public.student_intelligent_profiles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sip_version     ON public.student_intelligent_profiles (student_id, version_number DESC);

-- RLS
ALTER TABLE public.student_intelligent_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sip_tenant_select" ON public.student_intelligent_profiles
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "sip_tenant_insert" ON public.student_intelligent_profiles
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "sip_tenant_update" ON public.student_intelligent_profiles
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "sip_tenant_delete" ON public.student_intelligent_profiles
  FOR DELETE USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
  );
