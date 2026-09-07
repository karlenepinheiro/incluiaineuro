-- ============================================================
-- USER LGPD CONSENT — IncluiAI
-- ============================================================
-- Tabela: public.users
-- Colunas propostas:
--   lgpd_accepted       boolean, default false
--   lgpd_accepted_at    timestamptz, nullable
--   lgpd_term_version   text, nullable
--
-- Problema que resolve:
-- O aceite do modal "Privacidade e Segurança (LGPD)" era controlado só por
-- localStorage (chave por navegador). Um mesmo usuário entrando por outro
-- computador/navegador via novamente o modal, mesmo já tendo aceitado.
--
-- Impacto:
-- - Permite persistir o aceite LGPD por usuário, sincronizado entre
--   dispositivos (fonte de verdade passa a ser o banco).
-- - `lgpd_term_version` guarda a versão exata aceita — nova versão dos termos
--   (ver CURRENT_LGPD_TERMS_VERSION em src/types.ts) só pede novo aceite de
--   quem aceitou uma versão desatualizada, não reseta todo mundo.
-- - Não cria tabela nova e não altera créditos, IA, documentos ou billing.
--
-- NÃO APLICADA REMOTAMENTE por esta tarefa — arquivo preparado localmente
-- apenas. O código (databaseService.ts: getUserProfile/acceptLGPD) já
-- degrada com segurança quando estas colunas ainda não existem no ambiente
-- (erro 42703 tratado com fallback local por usuário, como já era antes).
--
-- Rollback:
-- ALTER TABLE public.users
--   DROP COLUMN IF EXISTS lgpd_accepted,
--   DROP COLUMN IF EXISTS lgpd_accepted_at,
--   DROP COLUMN IF EXISTS lgpd_term_version;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS lgpd_accepted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS lgpd_term_version text;
