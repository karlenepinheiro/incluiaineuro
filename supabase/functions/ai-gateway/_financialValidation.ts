import type {CreditOperation} from '../_shared/creditCatalog.ts';
export function financialValidationKey(code: CreditOperation): string {
 return ({PLANO_REGENTE:'plano_acao',PLANO_AEE:'plano_acao_aee',PERFIL_INTELIGENTE:'perfil_inteligente'} as Record<string,string>)[code]??code.toLowerCase();
}
export function validateFinancialDelivery(code: CreditOperation,result: any,task: string): void {
 if(result==null||result===''||(typeof result==='object'&&Object.keys(result).length===0))throw Error('EMPTY_DELIVERY');
 const protocols=['ESTUDO_DE_CASO','PAEE','PEI','PDI','DOCUMENTO_UNICO_PAEE_PEI'];
 if((protocols.includes(code)&&task==='json')||code==='UPLOAD_MODELO') {
  if(!Array.isArray(result.sections)||!result.sections.some((s:any)=>Array.isArray(s.fields)&&s.fields.length>0))throw Error('UNUSABLE_DOCUMENT_SECTIONS');
 }
 if(code==='ANALISAR_MODELO_DOCX'&&(!Array.isArray(result.replacements)||!result.replacements.length))throw Error('UNUSABLE_DOCX_MODEL');
 if(code==='IMPORTAR_DOCUMENTO_TEXTO'||code==='IMPORTAR_DOCUMENTO_VISUAL') {
  if(!Array.isArray(result.students)||!result.students.length)throw Error('UNUSABLE_STUDENT_IMPORT');
 }
}
