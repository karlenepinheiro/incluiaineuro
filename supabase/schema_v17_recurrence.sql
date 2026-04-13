-- ============================================================
-- INCLUIAI — SCHEMA v17 (Recorrência de agendamentos)
-- Arquivo: supabase/schema_v17_recurrence.sql
-- Descrição: Adiciona suporte a agendamentos recorrentes
--   Execute APÓS schema_v3.sql
-- ============================================================

-- Adiciona colunas de recorrência na tabela de agendamentos
ALTER TABLE public.tenant_appointments
  ADD COLUMN IF NOT EXISTS recurrence          text DEFAULT 'none',  -- none | weekly | biweekly | monthly
  ADD COLUMN IF NOT EXISTS recurrence_end_date date,
  ADD COLUMN IF NOT EXISTS recurrence_group_id uuid;

COMMENT ON COLUMN public.tenant_appointments.recurrence          IS 'Frequência de repetição: none, weekly, biweekly, monthly';
COMMENT ON COLUMN public.tenant_appointments.recurrence_end_date IS 'Data limite para a série recorrente';
COMMENT ON COLUMN public.tenant_appointments.recurrence_group_id IS 'UUID compartilhado por todos os agendamentos da mesma série';

CREATE INDEX IF NOT EXISTS idx_tenant_appointments_group
  ON public.tenant_appointments (recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;
