/**
 * Real PostgreSQL (PGlite) role/transaction tests, entirely in memory.
 * Install PGlite 0.3.14 outside the repo, then:
 * node supabase/tests/credit_rpc_security.test.mjs <absolute path to pglite/dist/index.js>
 * Never reads .env, connects to Supabase, or loads application/customer data.
 * auth helpers model verified JWT claims; JWT verification itself is PostgREST's responsibility.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = p => readFileSync(path.join(root, p), 'utf8');
const modulePath = process.argv[2];
if (!modulePath) throw new Error('Supply the absolute local path to PGlite dist/index.js (see file header).');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const migrationPath = 'supabase/migrations/20260910000001_harden_credit_rpcs.sql';
const atomicSource = read('supabase/migrations/20260520000002_atomic_credit_transactions.sql');
const migration = read(migrationPath);
const fn = (source, name) => {
  const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`));
  assert.ok(match, `missing function ${name}`);
  return match[0];
};
const A = '10000000-0000-0000-0000-000000000001';
const B = '10000000-0000-0000-0000-000000000002';
const S = '10000000-0000-0000-0000-000000000003';
const M = '10000000-0000-0000-0000-000000000004';
const U = '20000000-0000-0000-0000-000000000001';
const V = '20000000-0000-0000-0000-000000000002';
const ADMIN = '20000000-0000-0000-0000-000000000003';
const GHOST = '20000000-0000-0000-0000-000000000004';
const SUB = '30000000-0000-0000-0000-000000000001';
const q = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;

await test('credit RPC hardening: disposable PostgreSQL', async t => {
  const db = new PGlite();
  try {
    await db.exec(read('supabase/tests/fixtures/credit_rpc_security.sql'));
    // Execute real historical DDL/functions, stopping before unrelated observability views.
    await db.exec(atomicSource.slice(0, atomicSource.indexOf('-- 5. Views de observabilidade')).replace(/-- =+\s*$/, '') + '\nCOMMIT;');
    await db.exec(fn(read('supabase/migrations/20260616000003_grant_missing_monthly_credits_rpc.sql'), 'grant_missing_monthly_credits_for_active_subscriptions'));
    await db.exec(fn(read('supabase/migrations/20260616000004_admin_cycle_management.sql'), 'grant_missing_monthly_credits_for_subscription'));
    // Reproduce explicit remote ACL drift, not just PostgreSQL's default PUBLIC grant.
    const rpcNames = [...migration.matchAll(/REVOKE ALL ON FUNCTION public\.(\w+)\(([^;]+?)\) FROM/g)].map(m => `${m[1]}(${m[2]})`);
    assert.equal(rpcNames.length, 12);
    await db.exec(fn(read('supabase/rollback/20260910000001_harden_credit_rpcs.sql'), 'reset_monthly_credits'));
    for (const signature of rpcNames) await db.exec(`GRANT EXECUTE ON FUNCTION public.${signature} TO PUBLIC, anon, authenticated, service_role;`);
    await db.exec(migration);
    await db.exec(migration); // Replacement is repeatable without changing data/signatures.
    await db.exec(`
      INSERT INTO tenants(id,name) VALUES (${q(A)},'A'),(${q(B)},'B'),(${q(S)},'CEO'),(${q(M)},'Monthly');
      INSERT INTO users(id,tenant_id,email,is_super_admin) VALUES
        (${q(U)},${q(A)},'a@example.invalid',false),(${q(V)},${q(B)},'b@example.invalid',false),
        (${q(ADMIN)},${q(S)},'ceo@example.invalid',true);
      INSERT INTO credits_wallet(tenant_id,balance) SELECT id,100 FROM tenants;
      INSERT INTO plans VALUES ('40000000-0000-0000-0000-000000000001','PRO');
      INSERT INTO subscriptions VALUES (${q(SUB)},${q(M)},'40000000-0000-0000-0000-000000000001','MONTHLY',now()+interval '1 month','ACTIVE');
    `);
    const as = async (role, uid, sql) => {
      await db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
      try {
        await db.query("SELECT set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)", [role, uid ?? '']);
        const result = await db.query(sql);
        await db.exec('COMMIT;');
        return result.rows;
      } catch (e) { await db.exec('ROLLBACK;'); throw e; }
    };
    const rpc = async (role, uid, name, args) => (await as(role, uid, `SELECT public.${name}(${args.map(q).join(',')}) AS result`))[0].result;
    const balance = async tenant => (await db.query('SELECT balance FROM credits_wallet WHERE tenant_id=$1', [tenant])).rows[0].balance;
    const count = async (table, op) => Number((await db.query(`SELECT count(*) AS n FROM ${table} WHERE operation_id=$1`, [op])).rows[0].n);
    const denied = promise => assert.rejects(promise, e => e.code === '42501');

    await t.test('anon has no EXECUTE on any of the 12 RPCs, including explicit former grants', async () => {
      for (const sig of rpcNames) {
        const { rows } = await db.query('SELECT has_function_privilege($1,$2,$3) AS allowed', ['anon', `public.${sig}`, 'EXECUTE']);
        assert.equal(rows[0].allowed, false, sig);
      }
      await denied(rpc('anon', null, 'atomic_grant_credits', ['anon', 999999, 'attack', A]));
      assert.equal(await balance(A), 100);
    });
    await t.test('ordinary authenticated user cannot choose any administrative grant type/amount', async () => {
      for (const type of ['manual_grant', 'monthly_grant', 'purchase_extra', 'courtesy', 'refund']) {
        await denied(rpc('authenticated', U, 'atomic_grant_credits', [`attack:${type}`, 999999, 'attack', A, U, '{}', type]));
      }
      assert.equal(await balance(A), 100);
    });
    await t.test('normal user cannot debit, reserve or grant across tenants', async () => {
      for (const name of ['atomic_debit_credits', 'atomic_reserve_credits', 'atomic_grant_credits']) {
        await denied(rpc('authenticated', U, name, [`cross:${name}`, 8, 'cross', B, U]));
      }
      assert.equal(await balance(B), 100);
    });
    await t.test('missing uid/user row and spoofed actor fail closed', async () => {
      await denied(rpc('authenticated', null, 'atomic_reserve_credits', ['missing-uid', 8, 'x', A]));
      await denied(rpc('authenticated', GHOST, 'atomic_reserve_credits', ['missing-user', 8, 'x', A]));
      await denied(rpc('authenticated', U, 'atomic_reserve_credits', ['spoof', 8, 'x', A, V]));
    });
    await t.test('CEO may grant across tenants, with one ledger entry on duplicate', async () => {
      const args = ['ceo-grant', 25, 'CEO grant', A, ADMIN];
      assert.equal((await rpc('authenticated', ADMIN, 'atomic_grant_credits', args)).ok, true);
      assert.equal((await rpc('authenticated', ADMIN, 'atomic_grant_credits', args)).idempotent, true);
      assert.equal(await balance(A), 125);
      assert.equal(await count('credits_ledger', 'ceo-grant'), 1);
    });
    await t.test('service_role with no uid can grant/debit/reserve/commit/release', async () => {
      assert.equal((await rpc('service_role', null, 'atomic_grant_credits', ['server-grant', 20, 'x', B])).ok, true);
      assert.equal((await rpc('service_role', null, 'atomic_debit_credits', ['server-debit', 3, 'x', B, V])).ok, true);
      const hold = await rpc('service_role', null, 'atomic_reserve_credits', ['server-reserve', 8, 'x', B, V]);
      assert.equal((await rpc('service_role', null, 'atomic_commit_reserved_credits', ['server-commit', hold.reservation_id, 'x', B, V])).ok, true);
      const fail = await rpc('service_role', null, 'atomic_reserve_credits', ['server-fail', 8, 'x', B, V]);
      assert.equal((await rpc('service_role', null, 'atomic_release_reserved_credits', ['server-release', fail.reservation_id, 'x', B, V])).ok, true);
      assert.equal(await balance(B), 109);
    });
    await t.test('ordinary browser refund is denied', async () => {
      await denied(rpc('authenticated', U, 'atomic_refund_credits', ['bad-refund', 999999, 'x', A]));
    });
    await t.test('authorized refund uses refund kind and ledger; duplicate never adds twice', async () => {
      const before = await balance(A);
      const args = ['refund-once', 8, 'Authorized administrative refund', A, U];
      assert.equal((await rpc('service_role', null, 'atomic_refund_credits', args)).ok, true);
      assert.equal((await rpc('service_role', null, 'atomic_refund_credits', args)).idempotent, true);
      assert.equal(await balance(A), before + 8);
      const { rows } = await db.query("SELECT cl.type, cl.operation, cl.amount, co.operation_kind FROM credits_ledger cl JOIN credit_operations co USING(operation_id) WHERE cl.operation_id='refund-once'");
      assert.deepEqual(rows, [{ type: 'refund', operation: 'refund', amount: 8, operation_kind: 'refund' }]);
      assert.equal((await db.query("SELECT metadata->>'refund' AS marker FROM credits_ledger WHERE operation_id='refund-once'")).rows[0].marker, 'true');
      assert.equal((await rpc('authenticated', ADMIN, 'atomic_refund_credits', ['ceo-refund', 1, 'x', A, ADMIN])).ok, true);
    });
    await t.test('idempotency key cannot cross tenants or change amount/kind', async () => {
      await denied(rpc('service_role', null, 'atomic_refund_credits', ['refund-once', 900, 'x', A, U]));
      await denied(rpc('authenticated', V, 'atomic_debit_credits', ['refund-once', 8, 'x', B, V]));
      await denied(rpc('authenticated', U, 'atomic_debit_credits', ['refund-once', 8, 'x', A, U]));
      assert.equal(await count('credits_ledger', 'refund-once'), 1);
    });
    await t.test('legacy reset is service-only, including CEO browser denial', async () => {
      for (const [role, uid] of [['anon', null], ['authenticated', U], ['authenticated', ADMIN]]) {
        await denied(rpc(role, uid, 'reset_monthly_credits', [A, 999999]));
      }
      await rpc('service_role', null, 'reset_monthly_credits', [A, 42]);
      assert.equal((await db.query('SELECT ai_credits FROM users WHERE id=$1', [U])).rows[0].ai_credits, 42);
    });
    await t.test('helpers cannot be called directly even by service_role or CEO', async () => {
      for (const sig of rpcNames.filter(s => s.startsWith('credit_'))) {
        for (const role of ['anon', 'authenticated', 'service_role']) {
          assert.equal((await db.query('SELECT has_function_privilege($1,$2,$3) AS allowed', [role, `public.${sig}`, 'EXECUTE'])).rows[0].allowed, false);
        }
      }
      await denied(rpc('authenticated', ADMIN, 'credit_resolve_actor', [A, U]));
    });
    await t.test('normal reserve/commit charges once; duplicate and release-after-commit cannot mint credits', async () => {
      const before = await balance(A);
      const hold = await rpc('authenticated', U, 'atomic_reserve_credits', ['lab-visual', 8, 'IncluiLab visual', A, U, '{}', '2099-01-01T00:00:00Z', 'incluilab']);
      assert.equal(hold.ok, true);
      assert.equal(await balance(A), before - 8);
      const args = ['lab-visual-commit', hold.reservation_id, 'IncluiLab visual', A, U];
      assert.equal((await rpc('authenticated', U, 'atomic_commit_reserved_credits', args)).ok, true);
      assert.equal((await rpc('authenticated', U, 'atomic_commit_reserved_credits', args)).idempotent, true);
      assert.equal(await balance(A), before - 8);
      assert.equal((await rpc('authenticated', U, 'atomic_release_reserved_credits', ['late-release', hold.reservation_id, 'x', A, U])).ok, false);
      assert.equal(await balance(A), before - 8);
    });
    await t.test('normal release after generation failure refunds reservation once (IncluiLab premium)', async () => {
      const before = await balance(A);
      const hold = await rpc('authenticated', U, 'atomic_reserve_credits', ['lab-premium', 15, 'IncluiLab premium']);
      assert.equal(await balance(A), before - 15);
      const args = ['lab-premium-release', hold.reservation_id, 'Generation failed'];
      assert.equal((await rpc('authenticated', U, 'atomic_release_reserved_credits', args)).ok, true);
      assert.equal((await rpc('authenticated', U, 'atomic_release_reserved_credits', args)).idempotent, true);
      assert.equal(await balance(A), before);
      assert.equal(await count('credits_ledger', 'lab-premium-release'), 1);
    });
    await t.test('other tenant cannot commit or release an existing reservation', async () => {
      const hold = await rpc('authenticated', V, 'atomic_reserve_credits', ['other-hold', 8, 'x']);
      const before = await balance(B);
      for (const name of ['atomic_commit_reserved_credits', 'atomic_release_reserved_credits']) {
        assert.equal((await rpc('authenticated', U, name, [`other:${name}`, hold.reservation_id, 'x'])).ok, false);
      }
      assert.equal(await balance(B), before);
    });
    await t.test('normal debit succeeds and insufficient balance cannot go negative', async () => {
      const before = await balance(A);
      assert.equal((await rpc('authenticated', U, 'atomic_debit_credits', ['normal-debit', 2, 'x'])).ok, true);
      assert.equal((await rpc('authenticated', U, 'atomic_debit_credits', ['too-much', 999999, 'x'])).ok, false);
      assert.equal(await balance(A), before - 2);
    });
    await t.test('batch maintenance is denied to anon and authenticated, even CEO', async () => {
      for (const [role, uid] of [['anon', null], ['authenticated', U], ['authenticated', ADMIN]]) {
        await denied(as(role, uid, 'SELECT * FROM grant_missing_monthly_credits_for_active_subscriptions(true)'));
      }
      const rows = await as('service_role', null, 'SELECT * FROM grant_missing_monthly_credits_for_active_subscriptions(true)');
      assert.equal(rows[0].grant_status, 'DRY_RUN');
    });
    await t.test('individual monthly grant fails closed for missing user, uid, null admin flag and normal user', async () => {
      for (const uid of [U, GHOST, null]) {
        const rows = await as('authenticated', uid, `SELECT * FROM grant_missing_monthly_credits_for_subscription(${q(SUB)},false)`);
        assert.equal(rows[0].grant_status, 'PERMISSION_DENIED');
      }
      await db.exec(`UPDATE users SET is_super_admin=NULL WHERE id=${q(U)}`);
      const rows = await as('authenticated', U, `SELECT * FROM grant_missing_monthly_credits_for_subscription(${q(SUB)},false)`);
      assert.equal(rows[0].grant_status, 'PERMISSION_DENIED');
      await db.exec(`UPDATE users SET is_super_admin=false WHERE id=${q(U)}`);
      assert.equal(await balance(M), 100);
    });
    await t.test('CEO individual monthly grant works and backend replay is idempotent', async () => {
      const rows = await as('authenticated', ADMIN, `SELECT * FROM grant_missing_monthly_credits_for_subscription(${q(SUB)},false)`);
      assert.equal(rows[0].grant_status, 'GRANTED', rows[0].detail);
      assert.equal(await balance(M), 600);
      const again = await as('service_role', null, `SELECT * FROM grant_missing_monthly_credits_for_subscription(${q(SUB)},false)`);
      assert.equal(again[0].grant_status, 'ALREADY_GRANTED');
      assert.equal(await balance(M), 600);
    });
    await t.test('backend monthly batch grants once and records renewal dates', async () => {
      await db.exec(`INSERT INTO subscriptions VALUES ('30000000-0000-0000-0000-000000000002',${q(B)},'40000000-0000-0000-0000-000000000001','MONTHLY',now()+interval '1 month','ACTIVE')`);
      const before = await balance(B);
      const rows = await as('service_role', null, 'SELECT * FROM grant_missing_monthly_credits_for_active_subscriptions(false)');
      assert.equal(rows.find(r => r.tenant_id === B).grant_status, 'GRANTED');
      assert.equal(await balance(B), before + 500);
      await as('service_role', null, 'SELECT * FROM grant_missing_monthly_credits_for_active_subscriptions(false)');
      assert.equal(await balance(B), before + 500);
      assert.ok((await db.query('SELECT next_credit_grant_at FROM credits_wallet WHERE tenant_id=$1', [B])).rows[0].next_credit_grant_at);
    });
    await t.test('internal authorization still denies anon if an EXECUTE grant accidentally returns', async () => {
      const sig = 'public.atomic_grant_credits(text, integer, text, uuid, uuid, jsonb, text, text)';
      await db.exec(`GRANT EXECUTE ON FUNCTION ${sig} TO anon`);
      try { await denied(rpc('anon', null, 'atomic_grant_credits', ['acl-drift', 100, 'x', A])); }
      finally { await db.exec(`REVOKE EXECUTE ON FUNCTION ${sig} FROM anon`); }
    });
    await t.test('manual rollback compiles; reapplying hardening closes privileges again', async () => {
      await db.exec(read('supabase/rollback/20260910000001_harden_credit_rpcs.sql'));
      assert.equal((await db.query("SELECT has_function_privilege('anon','public.credit_resolve_actor(uuid,uuid)','EXECUTE') AS allowed")).rows[0].allowed, true);
      await db.exec(migration);
      await denied(rpc('anon', null, 'atomic_grant_credits', ['after-rollback', 1, 'x', A]));
    });
  } finally { await db.close(); }
});
