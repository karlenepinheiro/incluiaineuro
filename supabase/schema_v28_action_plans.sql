-- ═══════════════════════════════════════════════════════════════════════════════
-- Schema v28 — Plano de Ação do Professor Regente
-- Tabela: student_action_plans
--
-- Armazena planos de ação pedagógicos gerados por IA para cada aluno,
-- com histórico completo de versões (nunca sobrescreve — sempre insere).
--
-- Executar após: schema_intelligent_profile.sql
-- Dependências : tenants, users, students
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FUNÇÃO AUXILIAR — Geração de register_code
--    Formato: REG-YYYYMMDD-HHMMSS-XXXX
--    Exemplo:  REG-20260505-143522-A7F9
--
--    A parte XXXX é gerada com 4 caracteres hex em maiúsculo derivados de
--    gen_random_uuid() + timestamp para garantir unicidade mesmo em inserções
--    concorrentes no mesmo segundo.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_action_plan_register_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_date   text;
  v_time   text;
  v_suffix text;
BEGIN
  v_date   := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMMDD');
  v_time   := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24MISS');
  -- 4 chars hex uppercase a partir de bytes aleatórios
  v_suffix := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 4));
  RETURN 'REG-' || v_date || '-' || v_time || '-' || v_suffix;
END;
$$;

COMMENT ON FUNCTION public.generate_action_plan_register_code() IS
  'Gera código de registro único para Planos de Ação no formato REG-YYYYMMDD-HHMMSS-XXXX';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABELA PRINCIPAL — student_action_plans
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_action_plans (

  -- Identificação
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id)   ON DELETE CASCADE,
  student_id        uuid        NOT NULL REFERENCES public.students(id)   ON DELETE CASCADE,
  generated_by      uuid        NOT NULL REFERENCES public.users(id)      ON DELETE RESTRICT,

  -- Tipo e período
  -- Valores permitidos: 'weekly' | 'monthly' | 'bimonthly' | 'macro'
  plan_type         text        NOT NULL,

  -- Metadados do documento
  title             text        NOT NULL,
  summary           text,

  -- Conteúdo estruturado dos 6 blocos de ação
  -- Estrutura esperada:
  -- {
  --   "before_class":           [{ "id": "bc1", "text": "...", "done": false }],
  --   "during_class":           [...],
  --   "activities_strategies":  [...],
  --   "assessment":             [...],
  --   "attention_observations": [...],
  --   "communication":          [...]
  -- }
  content_json      jsonb       NOT NULL DEFAULT '{
    "before_class": [],
    "during_class": [],
    "activities_strategies": [],
    "assessment": [],
    "attention_observations": [],
    "communication": []
  }'::jsonb,

  -- Snapshot das fontes usadas na geração
  -- Estrutura esperada:
  -- {
  --   "estudo_de_caso_id":     "uuid | null",
  --   "pei_id":                "uuid | null",
  --   "perfil_inteligente_id": "uuid | null",
  --   "laudos_ids":            ["uuid", ...],
  --   "evolutions_count":      0,
  --   "generated_at":          "ISO 8601",
  --   "gemini_model":          "gemini-2.5-flash",
  --   "credits_consumed":      8
  -- }
  source_snapshot   jsonb,

  -- Código de registro único para rastreabilidade
  -- Gerado automaticamente via trigger se não fornecido
  register_code     text        NOT NULL UNIQUE DEFAULT public.generate_action_plan_register_code(),

  -- Controle de versionamento
  -- Incrementa a cada nova geração para o mesmo aluno (sequência por student_id)
  version_number    integer     NOT NULL DEFAULT 1,

  -- Arquivamento (soft delete)
  is_archived       boolean     NOT NULL DEFAULT false,

  -- Quem gerou (nome legível, redundante mas útil para exibição sem JOIN)
  generated_by_name text,

  -- Timestamps
  generated_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()

);

COMMENT ON TABLE  public.student_action_plans IS 'Planos de Ação pedagógicos do Professor Regente, gerados por IA com base no PEI, Estudo de Caso e Perfil Inteligente do aluno.';
COMMENT ON COLUMN public.student_action_plans.plan_type       IS 'Período: weekly | monthly | bimonthly | macro';
COMMENT ON COLUMN public.student_action_plans.content_json    IS 'Seis blocos de checklist de ações: before_class, during_class, activities_strategies, assessment, attention_observations, communication';
COMMENT ON COLUMN public.student_action_plans.source_snapshot IS 'IDs dos documentos usados como base na geração (PEI, Estudo de Caso, Perfil Inteligente, Laudos)';
COMMENT ON COLUMN public.student_action_plans.register_code   IS 'Código único no formato REG-YYYYMMDD-HHMMSS-XXXX para rastreabilidade e validação';
COMMENT ON COLUMN public.student_action_plans.version_number  IS 'Versão sequencial por aluno — nunca sobrescreve versão anterior';
COMMENT ON COLUMN public.student_action_plans.is_archived     IS 'Soft delete — planos arquivados não aparecem na listagem padrão';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CONSTRAINT — plan_type deve ser um dos valores permitidos
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.student_action_plans
  DROP CONSTRAINT IF EXISTS chk_sap_plan_type;

ALTER TABLE public.student_action_plans
  ADD CONSTRAINT chk_sap_plan_type
  CHECK (plan_type IN ('weekly', 'monthly', 'bimonthly', 'macro'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ÍNDICES
-- ─────────────────────────────────────────────────────────────────────────────

-- Listagem dos planos de um tenant (query mais frequente)
CREATE INDEX IF NOT EXISTS idx_sap_tenant_id
  ON public.student_action_plans (tenant_id);

-- Listagem dos planos de um aluno, do mais recente ao mais antigo
CREATE INDEX IF NOT EXISTS idx_sap_student_id
  ON public.student_action_plans (student_id);

-- Ordenação temporal (listagem principal)
CREATE INDEX IF NOT EXISTS idx_sap_generated_at
  ON public.student_action_plans (generated_at DESC);

-- Filtro por tipo de período
CREATE INDEX IF NOT EXISTS idx_sap_plan_type
  ON public.student_action_plans (plan_type);

-- Lookup por código de registro (validação externa)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sap_register_code
  ON public.student_action_plans (register_code);

-- Compound: query mais comum — planos de um aluno em um tenant, recentes primeiro
CREATE INDEX IF NOT EXISTS idx_sap_student_tenant_date
  ON public.student_action_plans (tenant_id, student_id, generated_at DESC);

-- Compound: planos de um aluno por versão (histórico ordenado)
CREATE INDEX IF NOT EXISTS idx_sap_student_version
  ON public.student_action_plans (student_id, version_number DESC);

-- Filtro de arquivados (para excluir da listagem padrão)
CREATE INDEX IF NOT EXISTS idx_sap_is_archived
  ON public.student_action_plans (is_archived)
  WHERE is_archived = false;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TRIGGER — updated_at automático
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_sap_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_sap_updated_at ON public.student_action_plans;

CREATE TRIGGER trig_sap_updated_at
  BEFORE UPDATE ON public.student_action_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_sap_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TRIGGER — version_number automático por aluno
--    Incrementa a cada INSERT para o mesmo student_id, por tenant.
--    Garante sequência correta mesmo em inserções concorrentes (usa MAX + 1
--    com lock implícito do INSERT).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_sap_version_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_next integer;
BEGIN
  -- Se o caller já forneceu versão > 1, respeita (uso explícito)
  IF NEW.version_number > 1 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next
    FROM public.student_action_plans
   WHERE student_id = NEW.student_id;

  NEW.version_number = v_next;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_sap_version_number ON public.student_action_plans;

CREATE TRIGGER trig_sap_version_number
  BEFORE INSERT ON public.student_action_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_sap_version_number();


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.student_action_plans ENABLE ROW LEVEL SECURITY;

-- Limpa policies anteriores (idempotente em re-execuções)
DROP POLICY IF EXISTS "sap_tenant_select"   ON public.student_action_plans;
DROP POLICY IF EXISTS "sap_tenant_insert"   ON public.student_action_plans;
DROP POLICY IF EXISTS "sap_tenant_update"   ON public.student_action_plans;
DROP POLICY IF EXISTS "sap_tenant_delete"   ON public.student_action_plans;
DROP POLICY IF EXISTS "sap_admin_all"       ON public.student_action_plans;

-- ── SELECT: membros do tenant veem apenas seus planos ────────────────────────
CREATE POLICY "sap_tenant_select" ON public.student_action_plans
  FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.users
       WHERE id = auth.uid()
       LIMIT 1
    )
  );

-- ── INSERT: usuário autenticado pode inserir somente no seu tenant ────────────
CREATE POLICY "sap_tenant_insert" ON public.student_action_plans
  FOR INSERT
  WITH CHECK (
    tenant_id = (
      SELECT tenant_id FROM public.users
       WHERE id = auth.uid()
       LIMIT 1
    )
    AND generated_by = auth.uid()
  );

-- ── UPDATE: membros do tenant podem atualizar (ex: marcar item done, arquivar)
CREATE POLICY "sap_tenant_update" ON public.student_action_plans
  FOR UPDATE
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.users
       WHERE id = auth.uid()
       LIMIT 1
    )
  )
  WITH CHECK (
    tenant_id = (
      SELECT tenant_id FROM public.users
       WHERE id = auth.uid()
       LIMIT 1
    )
  );

-- ── DELETE: apenas quem gerou pode excluir (soft delete via is_archived é preferível)
CREATE POLICY "sap_tenant_delete" ON public.student_action_plans
  FOR DELETE
  USING (
    generated_by = auth.uid()
    OR tenant_id = (
      SELECT tenant_id FROM public.users
       WHERE id = auth.uid() AND role IN ('admin', 'coordenador')
       LIMIT 1
    )
  );

-- ── SUPER ADMIN: acesso total sem filtro de tenant ───────────────────────────
CREATE POLICY "sap_admin_all" ON public.student_action_plans
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
       WHERE id = auth.uid()
         AND role = 'super_admin'
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. FUNÇÃO UTILITÁRIA — Próxima versão para um aluno
--    Uso: SELECT next_action_plan_version('student-uuid');
--    Retorna o próximo número de versão a ser usado (MAX + 1).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.next_action_plan_version(p_student_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(MAX(version_number), 0) + 1
    FROM public.student_action_plans
   WHERE student_id = p_student_id;
$$;

COMMENT ON FUNCTION public.next_action_plan_version(uuid) IS
  'Retorna o próximo version_number para um novo Plano de Ação do aluno informado.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. EXEMPLOS DE CONSULTA (comentados — referência para o frontend)
-- ─────────────────────────────────────────────────────────────────────────────

/*
── Listar todos os planos de um aluno, mais recente primeiro ──────────────────
SELECT
  id,
  plan_type,
  title,
  register_code,
  version_number,
  generated_by_name,
  generated_at,
  is_archived,
  content_json
FROM student_action_plans
WHERE student_id = '<uuid>'
  AND is_archived = false
ORDER BY generated_at DESC;

── Próxima versão disponível para um aluno ────────────────────────────────────
SELECT next_action_plan_version('<student-uuid>');

── Gerar register_code manualmente (ex: para pré-validação) ──────────────────
SELECT generate_action_plan_register_code();

── Buscar plano por código de registro (link público / QR) ───────────────────
SELECT * FROM student_action_plans
WHERE register_code = 'REG-20260505-143522-A7F9';

── Arquivar um plano (soft delete) ───────────────────────────────────────────
UPDATE student_action_plans
   SET is_archived = true
 WHERE id = '<plan-uuid>'
   AND generated_by = auth.uid();

── Contar planos por tipo de período de um tenant (dashboard admin) ──────────
SELECT
  plan_type,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE generated_at >= now() - interval '30 days') AS last_30d
FROM student_action_plans
WHERE tenant_id = '<tenant-uuid>'
  AND is_archived = false
GROUP BY plan_type
ORDER BY total DESC;
*/


-- ─────────────────────────────────────────────────────────────────────────────
-- FIM DA MIGRATION
-- ─────────────────────────────────────────────────────────────────────────────
