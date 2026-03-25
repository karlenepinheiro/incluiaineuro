-- =============================================================================
-- schema_v_referrals.sql
-- Sistema de indicação (referral) — rodar em produção após schema_v8_signatures_rls.sql
-- =============================================================================

-- 1. Adiciona colunas de indicação na tabela users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by   TEXT;   -- guarda o referral_code de quem indicou

-- Índice para busca rápida por código
CREATE INDEX IF NOT EXISTS users_referral_code_idx ON public.users(referral_code);
CREATE INDEX IF NOT EXISTS users_referred_by_idx   ON public.users(referred_by);

-- 2. Tabela de indicações
CREATE TABLE IF NOT EXISTS public.referrals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  referrer_tenant_id  UUID,            -- tenant do quem indicou (para créditos)
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','converted','rewarded')),
  plan_code           TEXT,            -- PRO | MASTER (preenchido na conversão)
  credits_awarded     INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de consulta
CREATE INDEX IF NOT EXISTS referrals_referrer_idx    ON public.referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS referrals_referred_idx    ON public.referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS referrals_status_idx      ON public.referrals(status);

-- 3. RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Quem indicou vê suas próprias linhas
CREATE POLICY "referrals_select_own" ON public.referrals
  FOR SELECT USING (referrer_user_id = auth.uid());

-- Qualquer usuário autenticado pode inserir (registro de nova indicação)
CREATE POLICY "referrals_insert" ON public.referrals
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Apenas service_role atualiza (conversão/recompensa — feita pelo backend/webhook)
CREATE POLICY "referrals_update_service" ON public.referrals
  FOR UPDATE USING (auth.role() = 'service_role');

-- 4. Comentários
COMMENT ON TABLE  public.referrals                   IS 'Registros de indicação entre usuários';
COMMENT ON COLUMN public.referrals.referrer_user_id  IS 'Usuário que compartilhou o link';
COMMENT ON COLUMN public.referrals.referred_user_id  IS 'Novo usuário que se cadastrou pelo link';
COMMENT ON COLUMN public.referrals.referrer_tenant_id IS 'Tenant do referrer (para creditar)';
COMMENT ON COLUMN public.referrals.status             IS 'pending → converted → rewarded';
COMMENT ON COLUMN public.referrals.credits_awarded    IS 'Créditos IA concedidos ao referrer';
COMMENT ON COLUMN public.users.referral_code          IS 'Código único de indicação do usuário';
COMMENT ON COLUMN public.users.referred_by            IS 'Código de indicação de quem indicou este usuário';
