-- ============================================================
-- USER PROFILE EXTENDED — Minha Conta (Sprint Perfil Premium)
-- ============================================================
-- Adiciona campos de perfil pessoal, endereço e preferências
-- de documentos à tabela users.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cargo                  text,
  ADD COLUMN IF NOT EXISTS profile_photo_url      text,
  ADD COLUMN IF NOT EXISTS cep                    text,
  ADD COLUMN IF NOT EXISTS rua                    text,
  ADD COLUMN IF NOT EXISTS numero                 text,
  ADD COLUMN IF NOT EXISTS complemento            text,
  ADD COLUMN IF NOT EXISTS bairro                 text,
  ADD COLUMN IF NOT EXISTS cidade                 text,
  ADD COLUMN IF NOT EXISTS estado                 text,
  ADD COLUMN IF NOT EXISTS display_name           text,
  ADD COLUMN IF NOT EXISTS professional_signature text,
  ADD COLUMN IF NOT EXISTS doc_phone              text;

-- Política: o próprio usuário pode atualizar seus dados de perfil
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'users'
      AND policyname = 'users_update_own_profile'
  ) THEN
    CREATE POLICY users_update_own_profile ON public.users
      FOR UPDATE TO authenticated
      USING     (id = auth.uid())
      WITH CHECK(id = auth.uid());
  END IF;
END $$;
