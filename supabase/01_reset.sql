-- =============================================================================
-- INCLUIAI — PASSO 1: RESET COMPLETO DO BANCO
-- Execute este arquivo PRIMEIRO no Supabase SQL Editor
-- =============================================================================

-- Remove trigger de signup para não gerar conflitos
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- =============================================================================
-- Remove tabelas (CASCADE resolve dependências automaticamente)
-- =============================================================================

DROP TABLE IF EXISTS public.audit_logs              CASCADE;
DROP TABLE IF EXISTS public.tasks                   CASCADE;
DROP TABLE IF EXISTS public.document_signatures     CASCADE;
DROP TABLE IF EXISTS public.professional_signatures CASCADE;
DROP TABLE IF EXISTS public.document_versions       CASCADE;
DROP TABLE IF EXISTS public.documents               CASCADE;
DROP TABLE IF EXISTS public.students                CASCADE;
DROP TABLE IF EXISTS public.credits_ledger          CASCADE;
DROP TABLE IF EXISTS public.credits_wallet          CASCADE;
DROP TABLE IF EXISTS public.subscriptions           CASCADE;
DROP TABLE IF EXISTS public.users                   CASCADE;
DROP TABLE IF EXISTS public.tenants                 CASCADE;
DROP TABLE IF EXISTS public.plans                   CASCADE;

-- Tabelas de versões antigas (Sprint 1-4)
DROP TABLE IF EXISTS public.tenant_appointments     CASCADE;
DROP TABLE IF EXISTS public.appointments            CASCADE;
DROP TABLE IF EXISTS public.complementary_forms     CASCADE;
DROP TABLE IF EXISTS public.checklists              CASCADE;
DROP TABLE IF EXISTS public.student_evolutions      CASCADE;
DROP TABLE IF EXISTS public.activities              CASCADE;
DROP TABLE IF EXISTS public.activity_attachments    CASCADE;
DROP TABLE IF EXISTS public.timeline_events         CASCADE;
DROP TABLE IF EXISTS public.workflow_steps          CASCADE;
DROP TABLE IF EXISTS public.student_profiles        CASCADE;
DROP TABLE IF EXISTS public.student_timeline        CASCADE;
DROP TABLE IF EXISTS public.student_documents       CASCADE;
DROP TABLE IF EXISTS public.medical_reports         CASCADE;
DROP TABLE IF EXISTS public.workflows               CASCADE;
DROP TABLE IF EXISTS public.workflow_nodes          CASCADE;
DROP TABLE IF EXISTS public.workflow_runs           CASCADE;
DROP TABLE IF EXISTS public.workflow_templates      CASCADE;
DROP TABLE IF EXISTS public.observation_forms       CASCADE;
DROP TABLE IF EXISTS public.observation_checklists  CASCADE;
DROP TABLE IF EXISTS public.generated_activities    CASCADE;
DROP TABLE IF EXISTS public.generated_documents     CASCADE;
DROP TABLE IF EXISTS public.ai_requests             CASCADE;
DROP TABLE IF EXISTS public.ai_outputs              CASCADE;
DROP TABLE IF EXISTS public.copilot_suggestions     CASCADE;
DROP TABLE IF EXISTS public.landing_settings        CASCADE;
DROP TABLE IF EXISTS public.landing_content         CASCADE;
DROP TABLE IF EXISTS public.admin_users             CASCADE;
DROP TABLE IF EXISTS public.admin_grants            CASCADE;
DROP TABLE IF EXISTS public.billing_events          CASCADE;
DROP TABLE IF EXISTS public.purchase_intents        CASCADE;
DROP TABLE IF EXISTS public.credit_ledger           CASCADE;
DROP TABLE IF EXISTS public.credit_usage            CASCADE;
DROP TABLE IF EXISTS public.transactions            CASCADE;
DROP TABLE IF EXISTS public.organizations           CASCADE;
DROP TABLE IF EXISTS public.organization_members    CASCADE;
DROP TABLE IF EXISTS public.profiles                CASCADE;
DROP TABLE IF EXISTS public.usuarios_legacy         CASCADE;
DROP TABLE IF EXISTS public.schools                 CASCADE;
DROP TABLE IF EXISTS public.school_staff            CASCADE;
DROP TABLE IF EXISTS public.service_records         CASCADE;
DROP TABLE IF EXISTS public.student_files           CASCADE;
DROP TABLE IF EXISTS public.student_collaborators   CASCADE;
DROP TABLE IF EXISTS public.lgpd_consents           CASCADE;
DROP TABLE IF EXISTS public.ai_usage_logs           CASCADE;
DROP TABLE IF EXISTS public.parent_documents        CASCADE;
DROP TABLE IF EXISTS public.document_audit_log      CASCADE;
DROP TABLE IF EXISTS public.parent_document_signatures CASCADE;

-- =============================================================================
-- Remove funções antigas
-- =============================================================================

DROP FUNCTION IF EXISTS public.my_tenant_id()                                CASCADE;
DROP FUNCTION IF EXISTS public.is_super_admin()                               CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at()                               CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at()                            CASCADE;
DROP FUNCTION IF EXISTS public.generate_audit_code()                          CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user()                              CASCADE;
DROP FUNCTION IF EXISTS public.audit_record(uuid,uuid,text,uuid,text,text)   CASCADE;

-- =============================================================================
-- Remove usuários de seed anteriores da autenticação
-- =============================================================================

DELETE FROM auth.users
WHERE email IN (
  'ceo@incluiai.com.br',
  'professora@monteiro.edu.br',
  'diretora@santosdumont.edu.br'
);

-- =============================================================================
-- Confirma limpeza
-- =============================================================================

SELECT 'Reset concluido. Pode rodar 02_schema.sql agora.' AS status;
