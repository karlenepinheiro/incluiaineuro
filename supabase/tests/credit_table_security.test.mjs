// Offline PostgreSQL tests. Pass the local PGlite dist/index.js path as argv[2].
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
await test('proposed table ACL/RLS on disposable PostgreSQL', async t=>{
 const db=new PGlite();
 const tables=['credits_wallet','credits_ledger','credit_operations','credit_reservations'];
 const A='10000000-0000-0000-0000-000000000001',B='10000000-0000-0000-0000-000000000002';
 const U='20000000-0000-0000-0000-000000000001';
 const as=async(role,sql)=>{
  await db.exec(`BEGIN; SET LOCAL ROLE ${role}; SELECT set_config('request.jwt.claim.sub','${U}',true); SELECT set_config('request.jwt.claim.role','${role}',true);`);
  try {const r=await db.query(sql);await db.exec('COMMIT');return r.rows;}catch(e){await db.exec('ROLLBACK');throw e;}
 };
 try {
  await db.exec(read('supabase/tests/fixtures/credit_rpc_security.sql'));
  const atomic=read('supabase/migrations/20260520000002_atomic_credit_transactions.sql');
  await db.exec(atomic.slice(0,atomic.indexOf('-- 5. Views de observabilidade')).replace(/-- =+\s*$/,'')+'\nCOMMIT;');
  await db.exec(`INSERT INTO tenants(id) VALUES ('${A}'),('${B}'); INSERT INTO users(id,tenant_id) VALUES ('${U}','${A}'); INSERT INTO credits_wallet(tenant_id,balance) VALUES ('${A}',100),('${B}',100); GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role; GRANT UPDATE(balance) ON credits_wallet TO PUBLIC; ALTER TABLE credits_wallet ENABLE ROW LEVEL SECURITY; CREATE POLICY unsafe ON credits_wallet USING (tenant_id=my_tenant_id()) WITH CHECK (tenant_id=my_tenant_id());`);
  await t.test('historical authenticated own balance write is reproducible',async()=>{
   await as('authenticated',`UPDATE credits_wallet SET balance=999 WHERE tenant_id='${A}'`);
   assert.equal((await db.query(`SELECT balance FROM credits_wallet WHERE tenant_id='${A}'`)).rows[0].balance,999);
  });
  const proposal=read('docs/audits/20260911000001_harden_credit_tables.PROPOSED.sql');
  await db.exec(proposal);await db.exec(proposal);
  for(const role of ['anon','authenticated']) for(const table of tables) {
   await t.test(`${role} cannot INSERT/UPDATE/DELETE ${table}, including cross tenant`,async()=>{
    for(const sql of [`INSERT INTO ${table}(tenant_id) VALUES ('${B}')`,`UPDATE ${table} SET tenant_id='${B}'`,`DELETE FROM ${table}`])
     await assert.rejects(as(role,sql),e=>e.code==='42501');
    for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE']) assert.equal((await db.query(`SELECT has_table_privilege('${role}','${table}','${privilege}') AS ok`)).rows[0].ok,false);
   });
  }
  await t.test('own read, cross tenant hidden, CEO read, anon denied',async()=>{
   assert.equal((await as('authenticated','SELECT * FROM credits_wallet')).length,1);
   await assert.rejects(as('anon','SELECT * FROM credits_wallet'),e=>e.code==='42501');
   await db.exec(`UPDATE users SET is_super_admin=true WHERE id='${U}'`);
   assert.equal((await as('authenticated','SELECT * FROM credits_wallet')).length,2);
   await assert.rejects(as('authenticated','UPDATE credits_wallet SET balance=8'),e=>e.code==='42501');
   await db.exec(`UPDATE users SET is_super_admin=false WHERE id='${U}'`);
  });
  await t.test('service role wallet and ledger writer remains functional',async()=>{
   await as('service_role',`UPDATE credits_wallet SET balance=120 WHERE tenant_id='${A}'`);
   await as('service_role',`INSERT INTO credits_ledger(tenant_id,type,amount) VALUES ('${A}','purchase_extra',20)`);
   for(const table of tables) for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']) assert.equal((await db.query(`SELECT has_table_privilege('service_role','${table}','${privilege}') AS ok`)).rows[0].ok,true);
  });
  await t.test('legacy ai_credits cannot be changed directly; profile update and backend remain available',async()=>{
   await assert.rejects(as('authenticated','UPDATE users SET ai_credits=1000'),e=>e.code==='42501');
   await as('authenticated',`UPDATE users SET email='updated@example.invalid' WHERE id='${U}'`);
   await as('service_role',`UPDATE users SET ai_credits=10 WHERE id='${U}'`);
  });
 } finally {await db.close();}
});
