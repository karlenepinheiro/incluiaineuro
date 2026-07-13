-- ============================================================
-- 20260616000002_kiwify_products_uuid_patch.sql
--
-- SPRINT P1.3-B — Patch de produtos Kiwify com UUIDs reais
--
-- OBJETIVO:
--   Atualizar os registros dos 2 produtos anuais já cadastrados
--   com price_brl correto e checkout_url oficial.
--   A migration 20260509000004 inseriu esses registros com
--   price_brl = 0 e checkout_url = ''.
--
-- UUIDS REAIS APLICADOS NESTA MIGRATION:
--   MASTER_ANNUAL  → fa763da0-2d2c-11f1-a3f6-2761766c7eda
--   PRO_ANNUAL     → da18e220-2d30-11f1-b691-1b4aa493422c
--
-- TODO — AGUARDANDO UUIDs REAIS DO PAINEL KIWIFY:
--   PRO_MONTHLY    → [acessar Kiwify > Products > copiar product_id]
--   MASTER_MONTHLY → [acessar Kiwify > Products > copiar product_id]
--   Quando os UUIDs forem obtidos, criar migration
--   20260616000003_kiwify_products_monthly_uuid_patch.sql
--
-- NÃO ALTERA:
--   - billing_cycle (já correto: 'annual')
--   - plan_code (já correto: 'PRO' / 'MASTER')
--   - product_key (já correto)
--   - Créditos, saldos de usuários
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- A. MASTER_ANNUAL — Premium Anual
--    UUID real: fa763da0-2d2c-11f1-a3f6-2761766c7eda
--    Preço: R$ 1.188,00 (99/mês × 12 meses)
--    Checkout: https://pay.kiwify.com.br/Ux6O9pR
-- ────────────────────────────────────────────────────────────

-- Diagnóstico antes (confirmar que o registro existe e o que está errado):
-- SELECT kiwify_product_id, product_key, billing_cycle, price_brl, checkout_url
-- FROM public.kiwify_products
-- WHERE kiwify_product_id = 'fa763da0-2d2c-11f1-a3f6-2761766c7eda';

UPDATE public.kiwify_products
SET
  price_brl    = 1188.00,
  checkout_url = 'https://pay.kiwify.com.br/Ux6O9pR',
  updated_at   = now()
WHERE kiwify_product_id = 'fa763da0-2d2c-11f1-a3f6-2761766c7eda'
  AND product_key       = 'MASTER_ANNUAL';


-- ────────────────────────────────────────────────────────────
-- B. PRO_ANNUAL — Plano Pro Anual
--    UUID real: da18e220-2d30-11f1-b691-1b4aa493422c
--    Preço: R$ 708,00 (59/mês × 12 meses)
--    Checkout: https://pay.kiwify.com.br/Mqcsie2
-- ────────────────────────────────────────────────────────────

-- Diagnóstico antes (confirmar que o registro existe e o que está errado):
-- SELECT kiwify_product_id, product_key, billing_cycle, price_brl, checkout_url
-- FROM public.kiwify_products
-- WHERE kiwify_product_id = 'da18e220-2d30-11f1-b691-1b4aa493422c';

UPDATE public.kiwify_products
SET
  price_brl    = 708.00,
  checkout_url = 'https://pay.kiwify.com.br/Mqcsie2',
  updated_at   = now()
WHERE kiwify_product_id = 'da18e220-2d30-11f1-b691-1b4aa493422c'
  AND product_key       = 'PRO_ANNUAL';


-- ────────────────────────────────────────────────────────────
-- C. PRO_MONTHLY — Plano Pro Mensal
--    UUID real: [PENDENTE — obter no painel Kiwify]
--
-- Quando o UUID real for obtido, executar:
--
-- INSERT INTO public.kiwify_products (
--   kiwify_product_id,
--   product_name,
--   product_type,
--   plan_code,
--   billing_cycle,
--   product_key,
--   credits_amount,
--   price_brl,
--   checkout_url,
--   is_active,
--   display_order
-- ) VALUES (
--   '<UUID_REAL_PRO_MONTHLY>',     -- substituir pelo UUID real
--   'PLANO PRO MENSAL',
--   'subscription',
--   'PRO',
--   'monthly',
--   'PRO_MONTHLY',
--   500,
--   79.00,
--   'https://pay.kiwify.com.br/U0RRsel',
--   true,
--   30
-- )
-- ON CONFLICT (kiwify_product_id) DO UPDATE
--   SET product_name   = EXCLUDED.product_name,
--       billing_cycle  = EXCLUDED.billing_cycle,
--       price_brl      = EXCLUDED.price_brl,
--       checkout_url   = EXCLUDED.checkout_url,
--       updated_at     = now();
-- ────────────────────────────────────────────────────────────


-- ────────────────────────────────────────────────────────────
-- D. MASTER_MONTHLY — Premium Mensal
--    UUID real: [PENDENTE — obter no painel Kiwify]
--
-- Quando o UUID real for obtido, executar:
--
-- INSERT INTO public.kiwify_products (
--   kiwify_product_id,
--   product_name,
--   product_type,
--   plan_code,
--   billing_cycle,
--   product_key,
--   credits_amount,
--   price_brl,
--   checkout_url,
--   is_active,
--   display_order
-- ) VALUES (
--   '<UUID_REAL_MASTER_MONTHLY>',  -- substituir pelo UUID real
--   'PREMIUM MENSAL',
--   'subscription',
--   'MASTER',
--   'monthly',
--   'MASTER_MONTHLY',
--   700,
--   147.00,
--   'https://pay.kiwify.com.br/yVg81A2',
--   true,
--   40
-- )
-- ON CONFLICT (kiwify_product_id) DO UPDATE
--   SET product_name   = EXCLUDED.product_name,
--       billing_cycle  = EXCLUDED.billing_cycle,
--       price_brl      = EXCLUDED.price_brl,
--       checkout_url   = EXCLUDED.checkout_url,
--       updated_at     = now();
-- ────────────────────────────────────────────────────────────


-- ────────────────────────────────────────────────────────────
-- Verificação pós-patch (executar para confirmar resultado)
-- ────────────────────────────────────────────────────────────
SELECT
  kp.kiwify_product_id,
  kp.product_key,
  kp.plan_code,
  kp.billing_cycle,
  kp.price_brl,
  left(kp.checkout_url, 40) AS checkout_url_preview,
  kp.is_active,
  kp.updated_at
FROM public.kiwify_products kp
WHERE kp.is_active = true
ORDER BY kp.plan_code NULLS LAST, kp.billing_cycle;