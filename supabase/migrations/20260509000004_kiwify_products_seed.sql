-- ============================================================
-- 20260509000004_kiwify_products_seed.sql
--
-- Registra os IDs reais dos produtos da Kiwify na tabela
-- kiwify_products para que o webhook os reconheça via DB.
--
-- Os product_ids abaixo são os valores reais enviados pela
-- Kiwify no campo payload.Product.product_id em produção.
-- ============================================================

INSERT INTO public.kiwify_products (
  kiwify_product_id,
  product_name,
  product_type,
  plan_code,
  billing_cycle,
  product_key,
  credits_amount,
  price_brl,
  checkout_url,
  is_active,
  is_featured,
  display_order
) VALUES
  (
    'fa763da0-2d2c-11f1-a3f6-2761766c7eda',
    'PREMIUM ANUAL',
    'subscription',
    'MASTER',
    'annual',
    'MASTER_ANNUAL',
    700,
    0,
    '',
    true,
    true,
    10
  ),
  (
    'da18e220-2d30-11f1-b691-1b4aa493422c',
    'PLANO PRO ANUAL',
    'subscription',
    'PRO',
    'annual',
    'PRO_ANNUAL',
    500,
    0,
    '',
    true,
    false,
    20
  )
ON CONFLICT (kiwify_product_id) DO UPDATE
  SET product_name   = EXCLUDED.product_name,
      plan_code      = EXCLUDED.plan_code,
      billing_cycle  = EXCLUDED.billing_cycle,
      product_key    = EXCLUDED.product_key,
      credits_amount = EXCLUDED.credits_amount,
      is_active      = EXCLUDED.is_active,
      updated_at     = now();
