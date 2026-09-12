// Local-only PostgreSQL suite. PGlite module path in argv[2]; never reads .env.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const fn=(s,n)=>s.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${n}\\([\\s\\S]*?\\n\\$\\$;`))[0];
const A='10000000-0000-0000-0000-000000000001',B='10000000-0000-0000-0000-000000000002';
const U='20000000-0000-0000-0000-000000000001',V='20000000-0000-0000-0000-000000000002',CEO='20000000-0000-0000-0000-000000000003';
const FREE='30000000-0000-0000-0000-000000000001',PRO='30000000-0000-0000-0000-000000000002';
await test('financial sprint integration',async t=>{
 const db=new PGlite();
 const as=async(role,uid,sql,params=[])=>{
  await db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
  try {await db.query("SELECT set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,uid??'']);const r=await db.query(sql,params);await db.exec('COMMIT');return r.rows;}catch(e){await db.exec('ROLLBACK');throw e;}
 };
 const rpc=async(name,params=[],role='service_role',uid=null)=>(await as(role,uid,`SELECT public.${name}(${params.map((_,i)=>'$'+(i+1)).join(',')}) AS r`,params))[0].r;
 const bal=async tenant=>(await db.query('SELECT balance FROM credits_wallet WHERE tenant_id=$1',[tenant])).rows[0]?.balance;
 const denied=promise=>assert.rejects(promise,e=>e.code==='42501');
 try{
  await db.exec(read('supabase/tests/fixtures/credit_rpc_security.sql'));
  await db.exec(`
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
   ALTER TABLE users ADD COLUMN is_active boolean DEFAULT true,ADD COLUMN role text DEFAULT 'TEACHER',ADD COLUMN sex text,ADD COLUMN phone text;
   ALTER TABLE tenants ADD COLUMN plan_id uuid;
   ALTER TABLE plans ADD COLUMN is_active boolean DEFAULT true,ADD COLUMN ai_credits_per_month integer DEFAULT 60;
   ALTER TABLE subscriptions ADD COLUMN updated_at timestamptz DEFAULT now(),ADD COLUMN current_period_start timestamptz,ADD COLUMN provider text;
   ALTER TABLE subscriptions ALTER COLUMN id SET DEFAULT gen_random_uuid();
   CREATE TABLE profiles(id uuid PRIMARY KEY,plan text,role text DEFAULT 'user',updated_at timestamptz);
   CREATE TABLE students(id uuid PRIMARY KEY,tenant_id uuid);
   CREATE TABLE documents(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,student_id uuid,created_by uuid,doc_type text,title text,structured_data jsonb,status text);
   CREATE TABLE kiwify_products(id uuid DEFAULT gen_random_uuid(),kiwify_product_id text UNIQUE,product_name text,product_type text,plan_code text,credits_amount integer,is_active boolean DEFAULT true);
   CREATE TABLE kiwify_purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,product_key text,plan_code text,credits_amount integer,provider_order_id text UNIQUE,status text,paid_at timestamptz,activated_at timestamptz,tenant_id uuid);
  `);
  const atomic=read('supabase/migrations/20260520000002_atomic_credit_transactions.sql');
  await db.exec(atomic.slice(0,atomic.indexOf('-- 5. Views de observabilidade')).replace(/-- =+\s*$/,'')+'\nCOMMIT;');
  await db.exec(fn(read('supabase/migrations/20260616000003_grant_missing_monthly_credits_rpc.sql'),'grant_missing_monthly_credits_for_active_subscriptions'));
  await db.exec(fn(read('supabase/migrations/20260616000004_admin_cycle_management.sql'),'grant_missing_monthly_credits_for_subscription'));
  await db.exec(fn(read('supabase/rollback/20260910000001_harden_credit_rpcs.sql'),'reset_monthly_credits'));
  await db.exec(read('supabase/migrations/20260910000001_harden_credit_rpcs.sql'));
  await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
    INSERT INTO tenants(id,name) VALUES('${A}','A'),('${B}','B');
    INSERT INTO users(id,tenant_id,email,is_super_admin) VALUES('${U}','${A}','a@example.invalid',false),('${V}','${B}','b@example.invalid',false),('${CEO}','${A}','ceo@example.invalid',true);
    INSERT INTO auth.users SELECT id,email FROM users;
    INSERT INTO profiles(id,plan) SELECT id,'FREE' FROM users;
    INSERT INTO plans(id,name,ai_credits_per_month) VALUES('${FREE}','FREE',60),('${PRO}','PRO',500);
    INSERT INTO subscriptions(tenant_id,plan_id,status) VALUES('${A}','${FREE}','ACTIVE'),('${B}','${FREE}','ACTIVE');
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    CREATE POLICY users_own ON users USING(id=auth.uid()) WITH CHECK(id=auth.uid());
  `);
  for(const file of ['20260911000001_credit_entrypoints_and_authority.sql','20260911000002_kiwify_transactional.sql','20260911000003_harden_credit_tables.sql','20260911000004_ai_financial_jobs.sql']) await db.exec(read('supabase/migrations/'+file));
  await t.test('authority denied, profile fields preserved, service can maintain authority',async()=>{
   for(const patch of ["tenant_id='"+B+"'","is_super_admin=true","role='ADMIN'","ai_credits=999","email='ceo@example.invalid'"])
    await denied(as('authenticated',U,`UPDATE users SET ${patch} WHERE id='${U}'`));
   await as('authenticated',U,`UPDATE users SET sex='F',phone='555' WHERE id='${U}'`);
   await as('service_role',null,`UPDATE users SET role='AEE' WHERE id='${U}'`);
  });
  await t.test('bootstrap is server priced and idempotent',async()=>{
   assert.equal((await rpc('ensure_my_credit_wallet',[],'authenticated',U)).balance,60);
   assert.equal((await rpc('ensure_my_credit_wallet',[],'authenticated',U)).balance,60);
   await rpc('ensure_my_credit_wallet',[],'authenticated',V);
   assert.equal((await db.query("SELECT count(*)::int n FROM credits_ledger WHERE operation_id=$1",['bootstrap:'+A])).rows[0].n,1);
  });
  await t.test('no public financial DML or amount-based generation RPC',async()=>{
   for(const role of ['anon','authenticated']) for(const table of ['credits_wallet','credits_ledger','credit_operations','credit_reservations'])
    for(const query of [`INSERT INTO ${table}(tenant_id) VALUES('${B}')`,`UPDATE ${table} SET tenant_id='${B}'`,`DELETE FROM ${table}`,`TRUNCATE ${table} CASCADE`]) await denied(as(role,U,query));
   await denied(rpc('atomic_reserve_credits',['evil',1,'fake',A,U],'authenticated',U));
   assert.equal((await as('authenticated',U,'SELECT * FROM credits_wallet')).length,1);
  });
  await t.test('CEO plan change is atomic and replay-safe; normal user denied',async()=>{
   await denied(rpc('admin_change_subscription_plan',[A,'PRO','change1'],'authenticated',U));
   assert.equal((await rpc('admin_change_subscription_plan',[A,'PRO','change1'],'authenticated',CEO)).final_balance,500);
   await rpc('admin_change_subscription_plan',[A,'PRO','change1'],'authenticated',CEO);
   assert.equal(await bal(A),500);
  });
  await t.test('Kiwify catalog/identity validation, paid replay and rollback',async()=>{
   await db.exec("INSERT INTO kiwify_products(kiwify_product_id,product_name,product_type,plan_code,credits_amount,billing_cycle) VALUES('pro','Pro mensal','subscription','PRO',500,'monthly'),('extra','Extra','credits',NULL,100,NULL)");
   const args=['order1','paid','a@example.invalid','extra','2026-09-11T12:00:00Z'];
   assert.equal((await rpc('process_verified_kiwify_event',args)).final_balance,600);
   // PGlite queues requests on one backend. This tests burst replays; real multi-session
   // contention additionally needs PostgreSQL (the RPC uses an advisory xact lock).
   await db.exec("SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',false);");
   const burst=await Promise.all(Array.from({length:8},()=>db.query('SELECT process_verified_kiwify_event($1,$2,$3,$4,$5) r',args)));
   assert.ok(burst.every(r=>r.rows[0].r.idempotent));
   await db.exec('RESET ROLE');
   assert.equal((await rpc('process_verified_kiwify_event',args)).idempotent,true);
   assert.equal(await bal(A),600);
   await assert.rejects(rpc('process_verified_kiwify_event',['bad','paid','a@example.invalid','unknown',args[4]]));
   await db.exec("CREATE FUNCTION fail_ledger_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation_id='kiwify:paid:fail' THEN RAISE EXCEPTION 'injected ledger failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_test BEFORE INSERT ON credits_ledger FOR EACH ROW EXECUTE FUNCTION fail_ledger_test();");
   await assert.rejects(rpc('process_verified_kiwify_event',['fail','paid','a@example.invalid','extra',args[4]]));
   assert.equal(await bal(A),600);
   assert.equal((await db.query("SELECT count(*)::int n FROM kiwify_purchases WHERE provider_order_id='fail'")).rows[0].n,0);
   await rpc('process_verified_kiwify_event',['plan','paid','b@example.invalid','pro',args[4]]);
   assert.equal(await bal(B),500);
   await rpc('process_verified_kiwify_event',['plan','canceled','b@example.invalid','pro',null]);
   assert.equal((await db.query('SELECT status FROM subscriptions WHERE tenant_id=$1',[B])).rows[0].status,'CANCELLED');
   assert.equal(await bal(B),500);
  });
  await t.test('document save failure rolls back commit and release restores balance',async()=>{
   const before=await bal(A);
   const j=await rpc('begin_ai_financial_job',['save-failure',A,U,'PEI','save-hash',3]);
   await assert.rejects(rpc('finish_ai_financial_job',['save-failure',j.attempt,{result:{sections:[]},_document:{studentId:V,docType:'PEI',title:'PEI'}},true]));
   assert.equal((await db.query("SELECT status FROM ai_financial_jobs WHERE id='save-failure'")).rows[0].status,'running');
   await rpc('finish_ai_financial_job',['save-failure',j.attempt,{error:'save_failed'},false]);
   assert.equal(await bal(A),before);
  });
  await t.test('canonical amounts reserve and ledger; failure net zero; retry once; cached delivery',async()=>{
   for(const [code,cost] of Object.entries({ESTUDO_DE_CASO:3,PAEE:3,PEI:3,PDI:3,DOCUMENTO_UNICO_PAEE_PEI:5,PERFIL_INTELIGENTE:6,PLANO_REGENTE:6,PLANO_AEE:7,UPLOAD_MODELO:5,ANALISAR_MODELO_DOCX:5,INCLUILAB_ECONOMICO:2,INCLUILAB_VISUAL:8,INCLUILAB_PREMIUM:15})){
    const before=await bal(A); const args=[code,A,U,code,'hash',cost];
    let j=await rpc('begin_ai_financial_job',args);
    assert.equal(await bal(A),before-cost);
    assert.equal((await rpc('begin_ai_financial_job',args)).state,'busy');
    await rpc('finish_ai_financial_job',[code,j.attempt,{error:'provider'},false]);
    assert.equal(await bal(A),before);
    j=await rpc('begin_ai_financial_job',args);
    await rpc('finish_ai_financial_job',[code,j.attempt,{result:'valid delivery'},true]);
    const replay=await rpc('begin_ai_financial_job',args);
    assert.equal(replay.state,'cached');assert.equal(replay.response.result,'valid delivery');
    assert.equal(await bal(A),before-cost);
    const ledger=await db.query("SELECT amount FROM credits_ledger WHERE reservation_id=$1 AND type='usage_ai'",[j.reservation_id]);
    assert.equal(ledger.rows[0].amount,-cost);
    await assert.rejects(rpc('begin_ai_financial_job',[code,B,V,code,'hash',cost]));
   }
  });
 }finally{await db.close();}
});
