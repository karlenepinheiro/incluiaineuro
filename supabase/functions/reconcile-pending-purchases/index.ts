/**
 * Edge Function: reconcile-pending-purchases
 *
 * Reprocessa todas as compras Kiwify APPROVED com activated_at = NULL
 * que já têm usuário no sistema (ativação que o webhook não concluiu).
 *
 * Quando chamar:
 *   - Via botão "Reconciliar compras" no painel CEO (já implementado)
 *   - Via cron (supabase/config.toml) para automação periódica
 *   - Via trigger manual após suporte identificar caso pendente
 *
 * Deploy:
 *   supabase functions deploy reconcile-pending-purchases --no-verify-jwt
 *
 * Exemplo de chamada:
 *   POST https://<projeto>.supabase.co/functions/v1/reconcile-pending-purchases
 *   Authorization: Bearer <service_role_key>
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface ReconcileRow {
  purchase_email:  string;
  purchase_plan:   string | null;
  found_tenant_id: string | null;
  result_action:   string;
}

Deno.serve(async (req: Request) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  console.log(`[reconcile/${reqId}] ═══ START method=${req.method}`);

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data, error } = await db.rpc('reconcile_pending_activations');

  if (error) {
    console.error(`[reconcile/${reqId}] ❌ RPC error: ${error.message}`);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const rows = (data ?? []) as ReconcileRow[];
  const activated = rows.filter(r => r.result_action === 'activated').length;
  const noAccount = rows.filter(r => r.result_action === 'no_account_yet').length;
  const failed    = rows.filter(r => !['activated', 'no_account_yet'].includes(r.result_action)).length;

  console.log(
    `[reconcile/${reqId}] ✅ Concluído — total=${rows.length}` +
    ` activated=${activated} no_account=${noAccount} failed=${failed}`
  );

  return new Response(
    JSON.stringify({
      ok:         true,
      summary:    { total: rows.length, activated, no_account: noAccount, failed },
      results:    rows,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
