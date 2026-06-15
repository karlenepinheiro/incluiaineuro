-- ============================================================
-- PROPOSTA DE CORREÇÃO — NÃO EXECUTAR SEM CONFIRMAÇÃO
-- ============================================================
-- Conta:        novo_master_final@incluiai.com
-- Data:         2026-06-12
-- Status:       RASCUNHO — aguardando resultado do diagnóstico
-- ============================================================
-- ATENÇÃO: Este arquivo contém SQL de correção COMENTADO.
-- Nenhuma linha ativa aqui altera dados.
-- Só executar após:
--   1. Rodar o diagnóstico e analisar os resultados
--   2. Confirmar qual bloco se aplica ao problema identificado
--   3. Revisar e aprovar explicitamente cada bloco
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- PROBLEMA IDENTIFICADO (preencher após diagnóstico)
-- ────────────────────────────────────────────────────────────
-- [ ] users.plan diverge de subscriptions.plan_id
-- [ ] subscription com status incorreto (ex: 'free' em vez de 'active')
-- [ ] billing_cycle incorreto (ex: 'monthly' em vez de 'annual')
-- [ ] current_period_end no passado (expirada)
-- [ ] credit_wallets.balance incorreto
-- [ ] tenant_id inconsistente entre tabelas
-- [ ] max_students do plano incorreto na tabela plans
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- BLOCO A — Corrigir users.plan para bater com a subscription ativa
-- Usar quando: users.plan = 'free' mas subscription.plan_id = 'master'
-- ============================================================
/*
UPDATE public.users
SET
  plan      = 'master',          -- ajustar para o plan_id correto
  updated_at = NOW()
WHERE email = 'novo_master_final@incluiai.com';
*/

-- ============================================================
-- BLOCO B — Corrigir subscription: status, billing_cycle e período
-- Usar quando: status errado OU billing_cycle 'monthly' no lugar de 'annual'
--             OU current_period_end expirado
-- ============================================================
/*
UPDATE public.subscriptions
SET
  status               = 'active',
  billing_cycle        = 'annual',           -- ajustar se necessário
  current_period_start = '2026-01-01',       -- substituir pela data real de ativação
  current_period_end   = '2027-01-01',       -- substituir pela data real de vencimento
  plan_id              = 'master',           -- ajustar para o plan_id correto
  updated_at           = NOW()
WHERE tenant_id = (
  SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
)
AND status != 'active';                      -- proteção: só atualiza se não está ativo
*/

-- ============================================================
-- BLOCO C — Corrigir saldo da carteira de créditos
-- Usar quando: credit_wallets.balance está incorreto
--             (ex: 0 em vez de 700, ou valor de plano FREE)
-- ============================================================
/*
UPDATE public.credit_wallets
SET
  balance      = 700,    -- créditos mensais do plano Master (ajustar se necessário)
  updated_at   = NOW()
WHERE tenant_id = (
  SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
);
*/

-- ============================================================
-- BLOCO D — Registrar lançamento de correção no ledger
-- Usar quando: saldo for ajustado para manter auditoria consistente
-- Executar JUNTO com o Bloco C, NUNCA separado
-- ============================================================
/*
INSERT INTO public.credits_ledger (tenant_id, type, amount, description, created_at)
VALUES (
  (SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'),
  'admin_correction',                                -- tipo auditável
  700,                                               -- ajustar conforme delta real
  'Correção manual: saldo zerado indevidamente — conta Master anual',
  NOW()
);
*/

-- ============================================================
-- BLOCO E — Corrigir max_students no plano Master (tabela plans)
-- Usar somente se o plano em si estiver com max_students = 5
-- ATENÇÃO: afeta TODOS os usuários do plano, não só este
-- ============================================================
/*
UPDATE public.plans
SET
  max_students        = 9999,
  ai_credits_per_month = 700,
  updated_at           = NOW()
WHERE id = 'master';    -- confirmar o plan_id correto no resultado do diagnóstico
*/

-- ============================================================
-- BLOCO F — Desativar assinaturas duplicadas (se houver)
-- Usar quando: houver mais de uma subscription com status 'active'
--             para o mesmo tenant, deixando apenas a mais recente
-- ============================================================
/*
UPDATE public.subscriptions
SET
  status     = 'cancelled',
  updated_at = NOW()
WHERE tenant_id = (
  SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
)
AND status = 'active'
AND id NOT IN (
  -- mantém a subscription mais recente
  SELECT id FROM public.subscriptions
  WHERE tenant_id = (
    SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
  )
  AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
);
*/

-- ============================================================
-- VERIFICAÇÃO PÓS-CORREÇÃO (rodar após aplicar blocos acima)
-- Estes SELECTs podem ser executados livremente para confirmar
-- ============================================================
/*
SELECT u.email, u.plan, s.plan_id, s.status, s.billing_cycle,
       s.current_period_start, s.current_period_end, w.balance
FROM public.users u
LEFT JOIN public.subscriptions s ON s.tenant_id = u.tenant_id AND s.status = 'active'
LEFT JOIN public.credit_wallets w ON w.tenant_id = u.tenant_id
WHERE u.email = 'novo_master_final@incluiai.com';
*/

-- ============================================================
-- FIM DA PROPOSTA DE CORREÇÃO
-- NÃO EXECUTAR SEM CONFIRMAÇÃO EXPLÍCITA
-- ============================================================