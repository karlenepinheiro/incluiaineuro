// Reuse the existing RPC suite unchanged, adding the proposed table ACL after RPC DDL.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const original=new URL('./credit_rpc_security.test.mjs',import.meta.url);
let code=readFileSync(original,'utf8')
 .replaceAll('import.meta.url',JSON.stringify(original.href))
 .replace('process.argv[2]','process.argv[1]')
 .replace("await db.exec(migration); // Replacement", "await db.exec(migration); await db.exec(read('docs/audits/20260911000001_harden_credit_tables.PROPOSED.sql')); // Replacement");
const result=spawnSync(process.execPath,['--input-type=module','-e',code,process.argv[2]],{stdio:'inherit'});
if(result.error) throw result.error;
process.exitCode=result.status??1;
