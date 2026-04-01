-- ============================================================================
-- schema_v20_ceo_rebuild.sql
-- CEO Panel Rebuild — Novas tabelas, funções e seeds de landing content
-- Compatível com schema_v18 e schema_v19
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABELA: user_activity_logs — atividade dos assinantes no sistema
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      uuid REFERENCES tenants(id) ON DELETE SET NULL,
  user_id        uuid,
  user_email     text,
  user_name      text,
  action         text NOT NULL,
  -- Exemplos de action: LOGIN, AI_REQUEST, DOCUMENT_GENERATED, CREDIT_CONSUMED,
  --   STUDENT_CREATED, STUDENT_UPDATED, PROTOCOL_GENERATED, ACTIVITY_GENERATED,
  --   TRIAGEM_CREATED, ACCESS_DENIED, SETTINGS_CHANGED
  resource_type  text,
  resource_id    text,
  details        jsonb DEFAULT '{}',
  ip_address     text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ual_tenant    ON user_activity_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ual_created   ON user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ual_action    ON user_activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_ual_user_id   ON user_activity_logs(user_id);

ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_activity_logs_admin_all" ON user_activity_logs
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 2. TABELA: alert_configs — configurações de alertas internos para assinantes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_configs (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_key        text UNIQUE NOT NULL,
  -- alert_key: 'low_credits_20', 'low_credits_10', 'plan_expired', 'plan_expiring_7d', etc.
  alert_type       text NOT NULL CHECK (alert_type IN ('low_credits', 'plan_expired', 'plan_expiring')),
  threshold        integer,        -- Para low_credits: número de créditos
  days_before      integer,        -- Para plan_expiring: dias antes
  title            text NOT NULL,
  message          text NOT NULL,
  -- Suporta variáveis: {credits}, {date}, {days}, {plan}
  is_active        boolean DEFAULT true,
  updated_by_name  text,
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE alert_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_configs_admin_all" ON alert_configs
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seeds de alerta padrão
INSERT INTO alert_configs (alert_key, alert_type, threshold, days_before, title, message) VALUES
  ('low_credits_20', 'low_credits', 20, NULL,
   'Seus créditos estão acabando',
   'Você tem menos de {credits} créditos restantes. Adquira um pacote agora para continuar usando todos os recursos de IA sem interrupção.'),
  ('low_credits_10', 'low_credits', 10, NULL,
   'Créditos críticos — ação necessária',
   'Atenção! Você tem apenas {credits} créditos. Renove agora para não interromper a geração de documentos e atividades.'),
  ('plan_expired', 'plan_expired', NULL, NULL,
   'Seu plano venceu',
   'Seu plano venceu em {date}. Renove agora para continuar acessando todos os recursos do IncluiAI e proteger seus dados.'),
  ('plan_expiring_7d', 'plan_expiring', NULL, 7,
   'Seu plano vence em breve',
   'Seu plano vence em {days} dias ({date}). Renove agora para garantir continuidade do seu trabalho.')
ON CONFLICT (alert_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. TABELA: test_account_details — metadados de contas de teste criadas pelo CEO
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS test_account_details (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid UNIQUE,
  account_name     text NOT NULL,
  responsible_name text,
  email            text NOT NULL,
  plan_code        text DEFAULT 'PRO',
  initial_credits  integer DEFAULT 100,
  expires_at       timestamptz,
  observation      text,
  status           text DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
  created_by_name  text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tad_status ON test_account_details(status);

ALTER TABLE test_account_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "test_account_details_admin_all" ON test_account_details
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 4. SEEDS DE LANDING CONTENT — novas seções
-- ----------------------------------------------------------------------------
INSERT INTO landing_content (section_key, title, subtitle, content_json) VALUES
  ('benefits', 'Por que escolher o IncluiAI?',
   'Tecnologia pensada para quem trabalha com educação inclusiva',
   '{
     "items": [
       {"icon": "Brain", "title": "IA Especializada", "desc": "Documentação pedagógica gerada com IA treinada para inclusão escolar"},
       {"icon": "Shield", "title": "Segurança Jurídica", "desc": "Documentos com código de auditoria SHA-256 e assinatura digital"},
       {"icon": "Clock", "title": "Economia de Tempo", "desc": "Reduza horas de trabalho burocrático para minutos"},
       {"icon": "Users", "title": "Multi-perfil", "desc": "Professores, psicopedagogos, fonoaudiólogos e gestores na mesma plataforma"}
     ]
   }'::jsonb),

  ('discounts_coupons', 'Desconto Especial',
   'Condição exclusiva para quem entrar agora',
   '{
     "active": false,
     "coupon_pro": "",
     "discount_pro_pct": 0,
     "coupon_master": "",
     "discount_master_pct": 0,
     "offer_label": "Oferta por tempo limitado",
     "urgency_text": ""
   }'::jsonb),

  ('commercial_notices', 'Avisos Comerciais', '',
   '{
     "notices": [
       {"key": "urgency_48h",     "text": "Oferta válida por apenas 48 horas",                        "active": false, "type": "urgency"},
       {"key": "lifetime",        "text": "Desconto vitalício garantido para quem entrar agora",       "active": false, "type": "lifetime"},
       {"key": "credits_discount","text": "Pacotes de créditos com desconto especial este mês",        "active": false, "type": "credits"},
       {"key": "renewal_pending", "text": "Renove agora e garanta mais 12 meses com o mesmo preço",   "active": false, "type": "renewal"}
     ]
   }'::jsonb),

  ('social_proof', 'Quem já usa o IncluiAI', '',
   '{
     "stats": [
       {"value": "500+", "label": "Profissionais ativos"},
       {"value": "10.000+", "label": "Documentos gerados"},
       {"value": "98%", "label": "Satisfação dos usuários"}
     ],
     "testimonials": [
       {"name": "Dra. Ana Lima", "role": "Psicopedagoga", "text": "Reduzi o tempo de elaboração de laudos em 70%. Ferramenta indispensável."},
       {"name": "Prof. Carlos Mendes", "role": "Coordenador de Inclusão", "text": "A padronização dos PEIs melhorou muito a comunicação com as famílias."}
     ]
   }'::jsonb),

  ('cta_final', 'Comece Agora',
   'Transforme sua documentação pedagógica hoje',
   '{
     "cta_primary": "Começar Gratuitamente",
     "cta_secondary": "Ver Planos",
     "note": "Sem cartão de crédito para o plano gratuito"
   }'::jsonb)
ON CONFLICT (section_key) DO NOTHING;

-- Atualizar a seção de pricing com campos de desconto/cupom se não existirem
UPDATE landing_content
SET content_json = content_json ||
  '{
    "pro_price_full": 0,
    "pro_price_discounted": 0,
    "pro_coupon": "",
    "master_price_full": 0,
    "master_price_discounted": 0,
    "master_coupon": "",
    "promo_text": "",
    "offer_48h_active": false,
    "offer_48h_text": "Oferta válida por 48 horas",
    "offer_lifetime_active": false,
    "offer_lifetime_text": "Desconto vitalício para quem entrar agora",
    "offer_credits_discount_active": false,
    "offer_credits_discount_text": "Pacotes de créditos com desconto especial"
  }'::jsonb
WHERE section_key = 'pricing'
  AND (content_json->>'pro_coupon') IS NULL;

-- ----------------------------------------------------------------------------
-- 5. FUNÇÃO: ceo_create_test_account_db
-- Cria todos os registros de DB para uma conta de teste (auth user separado)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ceo_create_test_account_db(
  p_account_name     text,
  p_responsible_name text DEFAULT '',
  p_email            text DEFAULT '',
  p_plan_code        text DEFAULT 'PRO',
  p_initial_credits  integer DEFAULT 100,
  p_expires_at       timestamptz DEFAULT NULL,
  p_observation      text DEFAULT '',
  p_created_by_name  text DEFAULT 'CEO'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  uuid := gen_random_uuid();
  v_expires    timestamptz := COALESCE(p_expires_at, now() + interval '30 days');
  v_plan_id    uuid;
BEGIN
  -- Criar tenant
  INSERT INTO tenants (id, name, created_at)
  VALUES (v_tenant_id, p_account_name, now());

  -- Buscar plan_id pelo código
  SELECT id INTO v_plan_id
  FROM plans
  WHERE code = UPPER(p_plan_code)
  LIMIT 1;

  -- Criar subscription com status INTERNAL_TEST
  INSERT INTO subscriptions (
    tenant_id, plan_id, status, billing_provider,
    current_period_start, current_period_end
  ) VALUES (
    v_tenant_id, v_plan_id, 'INTERNAL_TEST', 'manual',
    now(), v_expires
  );

  -- Criar credits_wallet
  INSERT INTO credits_wallet (tenant_id, balance, lifetime_granted, updated_at)
  VALUES (v_tenant_id, p_initial_credits, p_initial_credits, now());

  -- Lançar crédito iniciais no ledger
  INSERT INTO credits_ledger (tenant_id, type, amount, description, created_by_name)
  VALUES (v_tenant_id, 'bonus', p_initial_credits,
          'Créditos iniciais — conta de teste CEO', p_created_by_name);

  -- Salvar detalhes da conta de teste
  INSERT INTO test_account_details (
    tenant_id, account_name, responsible_name, email,
    plan_code, initial_credits, expires_at, observation, created_by_name
  ) VALUES (
    v_tenant_id, p_account_name, p_responsible_name, p_email,
    p_plan_code, p_initial_credits, v_expires, p_observation, p_created_by_name
  );

  RETURN jsonb_build_object(
    'success',    true,
    'tenant_id',  v_tenant_id,
    'expires_at', v_expires,
    'message',    'Conta de teste criada com sucesso. Configure o login via Supabase Dashboard com o email: ' || p_email
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error',   SQLERRM
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. FUNÇÃO: ceo_get_test_accounts — lista contas de teste com detalhes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ceo_get_test_accounts()
RETURNS TABLE (
  tenant_id        uuid,
  account_name     text,
  responsible_name text,
  email            text,
  plan_code        text,
  initial_credits  integer,
  credits_remaining integer,
  expires_at       timestamptz,
  observation      text,
  status           text,
  subscription_status text,
  created_by_name  text,
  created_at       timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tad.tenant_id,
    tad.account_name,
    tad.responsible_name,
    tad.email,
    tad.plan_code,
    tad.initial_credits,
    COALESCE(cw.balance, 0)::integer AS credits_remaining,
    tad.expires_at,
    tad.observation,
    tad.status,
    COALESCE(s.status, 'PENDING') AS subscription_status,
    tad.created_by_name,
    tad.created_at
  FROM test_account_details tad
  LEFT JOIN credits_wallet cw ON cw.tenant_id = tad.tenant_id
  LEFT JOIN subscriptions s ON s.tenant_id = tad.tenant_id
  ORDER BY tad.created_at DESC;
$$;

-- ----------------------------------------------------------------------------
-- 7. FUNÇÃO: log_user_activity — registra atividade do usuário
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_user_activity(
  p_tenant_id    uuid,
  p_user_id      uuid DEFAULT NULL,
  p_user_email   text DEFAULT NULL,
  p_user_name    text DEFAULT NULL,
  p_action       text DEFAULT NULL,
  p_resource_type text DEFAULT NULL,
  p_resource_id  text DEFAULT NULL,
  p_details      jsonb DEFAULT '{}'
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO user_activity_logs
    (tenant_id, user_id, user_email, user_name, action, resource_type, resource_id, details)
  VALUES
    (p_tenant_id, p_user_id, p_user_email, p_user_name, p_action, p_resource_type, p_resource_id, p_details);
$$;

-- ----------------------------------------------------------------------------
-- 8. COLUNA admin_email em audit_logs (se não existir — sprint 7 adicionou)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'admin_email'
  ) THEN
    ALTER TABLE audit_logs ADD COLUMN admin_email text;
  END IF;
END;
$$;

-- Índices adicionais em audit_logs para filtros
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);