/**
 * Edge Function: credit-maintenance
 *
 * FASE 0 / C-2 — Manutenção GLOBAL de reservas técnicas de crédito.
 * Chama a RPC public.expire_stale_credit_reservations(), que:
 *   - devolve créditos de reservas 'reserved' vencidas (expires_at <= now())
 *   - recupera o legado (expires_at NULL há mais de 30 min)
 *   - marca cada reserva como 'expired' e grava 'reservation_release' no ledger
 *
 * SEGURANÇA
 *   - service_role apenas: o caller precisa apresentar o SERVICE_ROLE_KEY no header
 *     Authorization: Bearer <key>. Sem isso -> 401.
 *   - NÃO aceita identificador de tenant nem qualquer alvo vindo do cliente.
 *     É manutenção global (a RPC varre todas as reservas vencidas).
 *   - Sem endpoint público irrestrito.
 *
 * AGENDAMENTO
 *   - NENHUM schedule remoto é configurado agora (pg_cron não está instalado).
 *   - Futuro: Supabase Scheduled Edge Function (preferido) ou pg_cron.
 *
 * Deploy (quando autorizado):
 *   supabase functions deploy credit-maintenance
 *
 * Chamada:
 *   POST /functions/v1/credit-maintenance
 *   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *   body (opcional): { "limit": 500, "nullGraceMinutes": 30 }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function unauthorized(reqId: string) {
  console.warn(`[credit-maintenance/${reqId}] 401 — service role ausente/incorreto`);
  return new Response(
    JSON.stringify({ ok: false, error: 'unauthorized' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
}

Deno.serve(async (req: Request) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  console.log(`[credit-maintenance/${reqId}] ═══ START method=${req.method}`);

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error(`[credit-maintenance/${reqId}] env ausente`);
    return new Response(
      JSON.stringify({ ok: false, error: 'server_misconfigured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // service_role only — o token do header tem que ser exatamente o service role key.
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token || token !== SUPABASE_SERVICE_KEY) {
    return unauthorized(reqId);
  }

  let limit = 500;
  let nullGraceMinutes = 30;
  try {
    const body = await req.json();
    if (body && typeof body === 'object') {
      if (Number.isFinite(body.limit)) limit = Math.max(1, Math.min(5000, Math.trunc(body.limit)));
      if (Number.isFinite(body.nullGraceMinutes)) {
        nullGraceMinutes = Math.max(1, Math.min(1440, Math.trunc(body.nullGraceMinutes)));
      }
    }
  } catch {
    // body vazio ou nao-JSON: usa os defaults
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data, error } = await db.rpc('expire_stale_credit_reservations', {
    p_limit: limit,
    p_null_grace_minutes: nullGraceMinutes,
  });

  if (error) {
    console.error(`[credit-maintenance/${reqId}] ❌ RPC error: ${error.message}`);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  console.log(`[credit-maintenance/${reqId}] ✅ ${JSON.stringify(data)}`);

  return new Response(
    JSON.stringify({ ok: true, result: data }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
