-- =============================================================================
-- schema_v21_landing_content.sql
-- Tabela landing_content com is_active para controle por seção
-- Compatível com o editor CEO (AdminDashboard > aba Landing)
-- Rodar em: Supabase > SQL Editor
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela principal
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS landing_content (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key     text        UNIQUE NOT NULL,
  title           text,
  subtitle        text,
  content_json    jsonb       NOT NULL DEFAULT '{}',
  is_active       boolean     NOT NULL DEFAULT true,
  updated_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Caso a tabela já exista (migrations anteriores), adicionar is_active se faltar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'landing_content' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE landing_content ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. RLS (Row Level Security)
-- -----------------------------------------------------------------------------
ALTER TABLE landing_content ENABLE ROW LEVEL SECURITY;

-- Leitura pública apenas para seções ativas (landing page pública)
DROP POLICY IF EXISTS "landing_content_public_read" ON landing_content;
CREATE POLICY "landing_content_public_read"
  ON landing_content FOR SELECT
  USING (is_active = true);

-- service_role tem acesso total (usado pelo backend / edge functions)
DROP POLICY IF EXISTS "landing_content_service_all" ON landing_content;
CREATE POLICY "landing_content_service_all"
  ON landing_content FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins autenticados podem ler e escrever qualquer seção
DROP POLICY IF EXISTS "landing_content_admin_write" ON landing_content;
CREATE POLICY "landing_content_admin_write"
  ON landing_content FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND au.active = true
        AND au.role IN ('super_admin', 'operacional', 'comercial')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND au.active = true
        AND au.role IN ('super_admin', 'operacional', 'comercial')
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Seed: seções padrão (INSERT … ON CONFLICT DO NOTHING)
-- -----------------------------------------------------------------------------
INSERT INTO landing_content (section_key, title, subtitle, content_json, is_active) VALUES

-- ── Hero ─────────────────────────────────────────────────────────────────────
('hero',
  'A IA que entende a educação inclusiva',
  'Gere documentos, PEI, PAEE e relatórios em segundos. Devolvendo seu tempo e sua energia.',
  '{
    "cta_primary":   "Começar grátis",
    "cta_secondary": "Entrar"
  }',
  true),

-- ── Planos ───────────────────────────────────────────────────────────────────
('planos',
  'Invista onde o impacto é real.',
  'Chega de levar o planejamento para o domingo.',
  '{
    "pro_full_price":      79,
    "pro_discount_price":  59,
    "pro_tagline":         "Para professores e especialistas",
    "pro_features": [
      "Até 30 alunos",
      "PEI, PAEE, PDI e relatórios",
      "Atividades com BNCC",
      "Histórico do aluno",
      "Suporte padrão"
    ],
    "master_full_price":      122,
    "master_discount_price":   99,
    "master_tagline":          "Para escolas e clínicas",
    "master_features": [
      "Alunos ilimitados",
      "Tudo do plano Pro",
      "Análise de laudos com IA",
      "Geração avançada de atividades",
      "Relatórios evolutivos completos",
      "Prioridade em novos recursos"
    ]
  }',
  true),

-- ── Descontos ─────────────────────────────────────────────────────────────────
('descontos',
  'Cupons e descontos ativos',
  'Configure os cupons exibidos na landing page.',
  '{
    "pro_coupon":          "INCLUIAI59",
    "pro_coupon_active":   true,
    "master_coupon":       "INCLUIAI99",
    "master_coupon_active":true,
    "badge_label":         "Valores promocionais por tempo limitado",
    "urgency_label":       "Oferta válida por 48 horas"
  }',
  true),

-- ── Créditos ──────────────────────────────────────────────────────────────────
('creditos',
  'Pacotes de créditos avulsos',
  'Configure os pacotes exibidos na landing e no app.',
  '{
    "packages": [
      { "id": "pkg_10",  "credits": 10,  "price": 9.90,  "label": "Tarefas Rápidas / Relatórios Curtos" },
      { "id": "pkg_200", "credits": 200, "price": 49.90, "label": "Atividades e Materiais Frequentes" },
      { "id": "pkg_900", "credits": 900, "price": 99.90, "label": "Uso Intenso / Alta Produção" }
    ]
  }',
  true),

-- ── Avisos ────────────────────────────────────────────────────────────────────
('avisos',
  'Avisos comerciais',
  'Mensagens e selos exibidos na landing page.',
  '{
    "urgency_badge":       "Valores promocionais por tempo limitado",
    "urgency_clock":       "Oferta válida por 48 horas",
    "installment_title":   "Parcelamento inteligente que facilita a aprovação",
    "installment_items": [
      "Mais leve no limite do cartão",
      "Sem necessidade de limite alto disponível",
      "Parcele em até 12x"
    ],
    "lifetime_active": false,
    "lifetime_text":   "Acesso vitalício disponível para fundadores",
    "trust_items": [
      "Cancele quando quiser",
      "Sem taxa de instalação",
      "LGPD conforme",
      "Suporte incluído"
    ]
  }',
  true),

-- ── FAQ ───────────────────────────────────────────────────────────────────────
('faq',
  'Perguntas frequentes',
  'Tire suas dúvidas sobre o IncluiAI.',
  '{
    "items": [
      {
        "q": "Para quem é o IncluiAI?",
        "a": "Para professores de AEE, psicopedagogos, fonoaudiólogos e demais profissionais de educação inclusiva."
      },
      {
        "q": "Os dados dos alunos são seguros?",
        "a": "Sim. Armazenamos em conformidade com a LGPD, com criptografia e auditoria SHA-256."
      },
      {
        "q": "Posso cancelar a qualquer momento?",
        "a": "Sim, sem multas ou taxas de cancelamento."
      }
    ]
  }',
  true)

ON CONFLICT (section_key) DO NOTHING;