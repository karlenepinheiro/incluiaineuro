import {describe,it,expect,vi} from 'vitest';
import {CREDIT_CATALOG,canonicalOperation,serverCreditOperation} from '../../supabase/functions/_shared/creditCatalog';
import {createKiwifyHandler} from '../../supabase/functions/kiwify-webhook/handler';
import {runLabPipeline} from '../../supabase/functions/ai-gateway/_pipeline';
import fs from 'node:fs';
import path from 'node:path';

it('browser has zero direct financial table writers',()=>{
 const violations:string[]=[];
 const walk=(dir:string)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory())walk(file);
  else if(/\.tsx?$/.test(file)&&!file.includes('__tests__')){
   const source=fs.readFileSync(file,'utf8');
   if(/\.from\(\s*['"`](credits_wallet|credits_ledger|credit_operations|credit_reservations)['"`]\s*\)\s*\.(insert|upsert|update|delete)\s*\(/.test(source))violations.push(file);
  }
 }};
 walk('src');expect(violations).toEqual([]);
});
describe('canonical server prices',()=>{
 it.each(Object.entries(CREDIT_CATALOG))('%s charges %i despite an adulterated amount',(operation,cost)=>{
  for(const creditsRequired of [0,1,-1,999])expect(serverCreditOperation({operation,task:'json',creditsRequired} as any).cost).toBe(cost);
 });
 it('rejects unknown ids and text-price image tasks',()=>{
  expect(()=>serverCreditOperation({operation:'OCR',requestType:'plano_acao_aee'})).toThrow('MISMATCH');
  expect(()=>serverCreditOperation({operation:'OCR',targetDocType:'pei'})).toThrow('MISMATCH');
  expect(()=>canonicalOperation('missing')).toThrow('UNKNOWN_CREDIT_OPERATION');
  expect(()=>serverCreditOperation({operation:'OCR',task:'image'})).toThrow('MISMATCH');
  expect(canonicalOperation('protocol_estudo de caso')).toBe('ESTUDO_DE_CASO');
  expect(canonicalOperation('protocol_plano de ação aee')).toBe('PLANO_AEE');
 });
});
describe('Kiwify authentication before every write',()=>{
 const payload={event:'order_approved',order_id:'order1',Customer:{email:'buyer@example.invalid'},Product:{product_id:'product1'},paid_at:'2026-09-11T12:00:00Z',tracking:{sck:'evil'},tenant_id:'evil',credits:999};
 it.each(['','bad'])('invalid signature %s causes zero database calls',async(signature)=>{
  const process=vi.fn();const handler=createKiwifyHandler('secret',process);
  const r=await handler(new Request('https://example.invalid',{method:'POST',headers:{'kiwify-signature':signature},body:JSON.stringify(payload)}));
  expect(r.status).toBe(401);expect(process).not.toHaveBeenCalled();
 });
 it('missing secret fails closed',async()=>{
  const process=vi.fn();const r=await createKiwifyHandler('',process)(new Request('https://example.invalid',{method:'POST'}));
  expect(r.status).toBe(503);expect(process).not.toHaveBeenCalled();
 });
 it('only verified identity/event fields reach the single transaction',async()=>{
  const process=vi.fn(async()=>({ok:true}));
  const r=await createKiwifyHandler('secret',process)(new Request('https://example.invalid',{method:'POST',headers:{'kiwify-signature':'secret'},body:JSON.stringify(payload)}));
  expect(r.status).toBe(200);expect(process).toHaveBeenCalledExactlyOnceWith({p_order_id:'order1',p_event:'paid',p_email:'buyer@example.invalid',p_product_id:'product1',p_paid_at:'2026-09-11T12:00:00.000Z'});
 });
});
describe('IncluiLAB server orchestration',()=>{
 it('visual generates guide then image in one operation',async()=>{
  const provider={text:vi.fn(),json:vi.fn(async()=>JSON.stringify({guia_pedagogico:'Guide',descricao_folha:'Sheet'})),image:vi.fn(async()=> 'data:image/png;base64,AAAA')};
  const result=await runLabPipeline('INCLUILAB_VISUAL','guide',undefined,{imagePrompt:'render {{description}}'},provider,async s=>JSON.parse(s));
  expect(provider.json).toHaveBeenCalledTimes(1);expect(provider.image).toHaveBeenCalledWith('render Sheet');expect(result.imageUrl).toContain('data:image');
 });
 it('image failure rejects whole pipeline for financial release',async()=>{
  const provider={text:vi.fn(),json:vi.fn(async()=>JSON.stringify({guia_pedagogico:'Guide',descricao_folha:'Sheet'})),image:vi.fn(async()=>{throw Error('provider');})};
  await expect(runLabPipeline('INCLUILAB_PREMIUM','guide',undefined,{imagePrompt:'render'},provider,async s=>JSON.parse(s))).rejects.toThrow('provider');
 });
 it('economic cannot smuggle an image stage',async()=>{
  const provider={text:vi.fn(),json:vi.fn(),image:vi.fn()};
  await expect(runLabPipeline('INCLUILAB_ECONOMICO','guide',undefined,{imagePrompt:'render'},provider,async s=>JSON.parse(s))).rejects.toThrow('IMAGE_NOT_ALLOWED');
  expect(provider.image).not.toHaveBeenCalled();
 });
});
