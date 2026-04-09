-- ============================================================
-- fix_billing_v7_mark_free_bootstrap.sql
--
-- OBJETIVO:
--   Marcar lançamentos legados de créditos FREE iniciais com
--   source = 'free_bootstrap' para que a UI os filtre corretamente
--   quando o tenant já tiver um plano pago ativo.
--
-- AUDITORIA:
--   Nenhum dado é removido. O ledger permanece íntegro.
--   O painel CEO (getGlobalHistory) continua exibindo esses
--   lançamentos — apenas a tela do usuário final os oculta.
--
-- Execute INTEIRO no Supabase SQL Editor.
-- Seguro para rodar múltiplas vezes (idempotente).
-- ============================================================


-- ============================================================
-- BLOCO A — Garantir que a coluna source existe
-- (foi adicionada em fix_billing_v5.sql, mas o ADD IF NOT EXISTS
--  é seguro repetir)
-- ============================================================

ALTER TABLE public.credits_ledger
  ADD COLUMN IF NOT EXISTS source TEXT;


-- ============================================================
-- BLOCO B — Marcar entradas FREE legadas existentes
--
-- Padrão seguro: apenas entradas em que TODOS os critérios batem:
--   - amount entre 1 e 60 (nunca mais que o limite FREE)
--   - description contém 'iniciais' E 'free' (case-insensitive)
--   - source ainda NULL ou 'signup' (não sobrescreve 'kiwify_activation')
-- ============================================================

UPDATE public.credits_ledger
SET source = 'free_bootstrap'
WHERE amount BETWEEN 1 AND 60
  AND lower(description) LIKE '%iniciais%'
  AND lower(description) LIKE '%free%'
  AND (source IS NULL OR source NOT IN ('kiwify_activation', 'free_bootstrap'));

-- Verificação — deve retornar as linhas marcadas
SELECT id, tenant_id, type, amount, description, source, created_at
FROM public.credits_ledger
WHERE source = 'free_bootstrap'
ORDER BY created_at DESC
LIMIT 50;


-- ============================================================
-- BLOCO C — Atualizar handle_new_user para novos signups
--
-- A trigger existente (última versão em migrations/) insere
-- sem source. Recriamos com source = 'free_bootstrap' para que
-- novas contas já nasçam marcadas corretamente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  v_tenant_id    UUID;
  v_free_plan_id UUID;
BEGIN
  -- Verifica se foi passado um tenant_id nos metadados (seed / migração)
  v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;

  IF v_tenant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id) THEN
    -- Tenant já existe: apenas vincula o usuário
    NULL;
  ELSE
    -- Signup normal: cria tenant + subscription + wallet + ledger inicial
    SELECT id INTO v_free_plan_id FROM public.plans WHERE name = 'FREE' LIMIT 1;

    INSERT INTO public.tenants (name, plan_id)
    VALUES (
      COALESCE(NEW.raw_user_meta_data->>'organization_name', 'Minha Escola'),
      v_free_plan_id
    ) RETURNING id INTO v_tenant_id;

    INSERT INTO public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
    VALUES (v_tenant_id, v_free_plan_id, 'ACTIVE', NOW(), NOW() + INTERVAL '30 days')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.credits_wallet (tenant_id, balance, last_reset_at)
    VALUES (v_tenant_id, 60, NOW())
    ON CONFLICT (tenant_id) DO UPDATE
      SET balance = EXCLUDED.balance,
          last_reset_at = EXCLUDED.last_reset_at;

    -- Lançamento inicial marcado como free_bootstrap para filtro na UI
    INSERT INTO public.credits_ledger (tenant_id, amount, type, description, source)
    VALUES (v_tenant_id, 60, 'monthly_grant', 'Créditos iniciais plano FREE', 'free_bootstrap')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Cria o perfil em public.users (ON CONFLICT ignora se já existir)
  INSERT INTO public.users (id, tenant_id, full_name, email, role, is_super_admin)
  VALUES (
    NEW.id,
    v_tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'TEACHER'),
    COALESCE((NEW.raw_user_meta_data->>'is_super_admin')::BOOLEAN, false)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca deixa o signup do Auth falhar por erro no trigger
  RETURN NEW;
END;
$$;


-- ============================================================
-- BLOCO D — Verificação final
-- ============================================================

-- 1. Lançamentos marcados por tenant
SELECT
  cl.tenant_id,
  cl.type,
  cl.amount,
  cl.description,
  cl.source,
  cl.created_at,
  upper(p.name) AS plan_atual
FROM public.credits_ledger cl
LEFT JOIN public.subscriptions s  ON s.tenant_id = cl.tenant_id AND s.status = 'ACTIVE'
LEFT JOIN public.plans p           ON p.id = s.plan_id
WHERE cl.source = 'free_bootstrap'
ORDER BY cl.created_at DESC
LIMIT 30;

-- 2. Contagem por source
SELECT source, count(*) FROM public.credits_ledger GROUP BY source ORDER BY count DESC;
