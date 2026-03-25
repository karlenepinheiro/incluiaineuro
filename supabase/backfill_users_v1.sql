-- ============================================================
-- BACKFILL v1 — Usuários auth.users sem perfil em public.users
-- Executar no SQL Editor do Supabase (com permissões de admin)
-- Seguro para re-execução: usa ON CONFLICT DO NOTHING em todo insert
-- ============================================================

-- ─── Verificação prévia ───────────────────────────────────────────────────────
-- Mostra quantos usuários auth precisam de backfill antes de rodar
DO $$
DECLARE
  v_pending INT;
BEGIN
  SELECT COUNT(*)
  INTO v_pending
  FROM auth.users au
  WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.id = au.id);

  RAISE NOTICE '[backfill_users_v1] Usuários sem perfil encontrados: %', v_pending;
END;
$$;

-- ─── Função principal de backfill ─────────────────────────────────────────────
DO $$
DECLARE
  v_auth_user     RECORD;
  v_tenant_id     UUID;
  v_nome          TEXT;
  v_email         TEXT;
  v_count_created INT := 0;
  v_count_skipped INT := 0;
BEGIN
  -- Itera sobre todos os usuários auth.users sem entrada em public.users
  FOR v_auth_user IN
    SELECT au.id, au.email, au.raw_user_meta_data, au.created_at
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.users pu WHERE pu.id = au.id
    )
    ORDER BY au.created_at
  LOOP
    BEGIN
      v_email := COALESCE(v_auth_user.email, 'sem-email-' || v_auth_user.id::text || '@placeholder.local');
      v_nome  := COALESCE(
        v_auth_user.raw_user_meta_data->>'full_name',
        v_auth_user.raw_user_meta_data->>'name',
        split_part(v_auth_user.email, '@', 1),
        'Usuário'
      );

      -- ── 1. Cria tenant dedicado ─────────────────────────────────────────────
      INSERT INTO public.tenants (
        id,
        name,
        type,
        status_assinatura,
        creditos_ia_restantes,
        created_at,
        updated_at
      )
      VALUES (
        gen_random_uuid(),
        COALESCE(
          v_auth_user.raw_user_meta_data->>'school_name',
          'Escola de ' || v_nome
        ),
        'SCHOOL',
        'ACTIVE',
        0,  -- FREE começa sem créditos IA
        COALESCE(v_auth_user.created_at, NOW()),
        NOW()
      )
      RETURNING id INTO v_tenant_id;

      -- ── 2. Cria registro na tabela users ────────────────────────────────────
      INSERT INTO public.users (
        id,
        tenant_id,
        nome,
        email,
        role,
        plan,
        active,
        created_at,
        updated_at
      )
      VALUES (
        v_auth_user.id,
        v_tenant_id,
        v_nome,
        v_email,
        'DOCENTE',   -- role padrão; ajustar manualmente se necessário
        'FREE',      -- plano padrão; atualizado por webhook de pagamento
        true,
        COALESCE(v_auth_user.created_at, NOW()),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;

      -- ── 3. Cria carteira de créditos (se tabela existir) ────────────────────
      BEGIN
        INSERT INTO public.credits_wallet (
          tenant_id,
          credits_avail,
          credits_total,
          credits_used,
          created_at,
          updated_at
        )
        VALUES (
          v_tenant_id,
          0, 0, 0,
          NOW(), NOW()
        )
        ON CONFLICT (tenant_id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '[backfill] credits_wallet skipped para tenant %: %', v_tenant_id, SQLERRM;
      END;

      -- ── 4. Cria subscription FREE (se tabela existir) ───────────────────────
      BEGIN
        INSERT INTO public.subscriptions (
          tenant_id,
          plan,
          status,
          billing_provider,
          created_at,
          updated_at
        )
        VALUES (
          v_tenant_id,
          'FREE',
          'ACTIVE',
          'NONE',
          NOW(),
          NOW()
        )
        ON CONFLICT DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '[backfill] subscriptions skipped para tenant %: %', v_tenant_id, SQLERRM;
      END;

      v_count_created := v_count_created + 1;
      RAISE NOTICE '[backfill] ✅ Criado: id=% email=%', v_auth_user.id, v_email;

    EXCEPTION WHEN OTHERS THEN
      -- Não interrompe o loop por causa de um usuário com problema
      v_count_skipped := v_count_skipped + 1;
      RAISE WARNING '[backfill] ❌ Falha no usuário % (%): %', v_auth_user.id, v_email, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '[backfill_users_v1] Concluído — criados: %, erros: %', v_count_created, v_count_skipped;
END;
$$;

-- ─── Verificação pós-backfill ─────────────────────────────────────────────────
-- Deve retornar 0 se todos os usuários agora têm perfil
SELECT COUNT(*) AS usuarios_sem_perfil_restantes
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.id = au.id);

-- Lista os usuários criados com seus tenants (audit)
SELECT
  pu.id,
  pu.email,
  pu.nome,
  pu.role,
  pu.plan,
  pu.tenant_id,
  t.name AS tenant_name,
  pu.created_at
FROM public.users pu
JOIN public.tenants t ON t.id = pu.tenant_id
ORDER BY pu.created_at DESC
LIMIT 50;
