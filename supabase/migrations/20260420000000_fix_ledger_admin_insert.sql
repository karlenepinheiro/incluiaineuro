-- Fix: ledger_super_admin policy missing WITH CHECK (INSERT blocked for admins)
-- The original policy only had USING (covers SELECT/UPDATE/DELETE) but not WITH CHECK (INSERT).

DROP POLICY IF EXISTS "ledger_super_admin" ON "public"."credits_ledger";

CREATE POLICY "ledger_super_admin" ON "public"."credits_ledger"
  USING ("public"."is_super_admin"())
  WITH CHECK ("public"."is_super_admin"());
