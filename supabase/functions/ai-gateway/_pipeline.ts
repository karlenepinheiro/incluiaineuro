import type { CreditOperation } from '../_shared/creditCatalog.ts';
export interface LabPipeline { analysisPrompt?: string; imagePrompt?: string }
export async function runLabPipeline(code: CreditOperation,prompt: string,image: string|undefined,pipeline: LabPipeline,
 provider: {text:(p:string,i?:string)=>Promise<string>;json:(p:string)=>Promise<string>;image:(p:string)=>Promise<string>},
 parse:(raw:string)=>Promise<any>) {
 const adapt=code.startsWith('INCLUILAB_ADAPTAR_');
 const visual=code.endsWith('_VISUAL')||code.endsWith('_PREMIUM');
 if(!code.startsWith('INCLUILAB_'))throw Error('INVALID_PIPELINE_OPERATION');
 if(adapt&&(!image||!pipeline.analysisPrompt))throw Error('MISSING_ADAPTATION_INPUT');
 if(visual&&!pipeline.imagePrompt)throw Error('MISSING_IMAGE_PROMPT');
 if(!visual&&pipeline.imagePrompt)throw Error('IMAGE_NOT_ALLOWED_FOR_ECONOMIC');
 const analysis=adapt?await provider.text(pipeline.analysisPrompt!,image):'';
 if(adapt&&!analysis.trim())throw Error('EMPTY_ANALYSIS');
 const schema=await parse(await provider.json(prompt.replaceAll('{{analysis}}',analysis)));
 if(!schema||typeof schema!=='object'||Array.isArray(schema)||Object.keys(schema).length===0)throw Error('EMPTY_ACTIVITY');
 if(!visual && ![schema.sections,schema.blocks,schema.exercises,schema.atividades].some(v=>Array.isArray(v)&&v.length>0))throw Error('INVALID_ACTIVITY_CONTENT');
 if(visual&&(!schema.descricao_folha||!schema.guia_pedagogico))throw Error('INVALID_ACTIVITY_GUIDE');
 const imageUrl=visual?await provider.image(pipeline.imagePrompt!.replaceAll('{{description}}',String(schema.descricao_folha))):undefined;
 if(visual&&!imageUrl?.trim())throw Error('EMPTY_ACTIVITY_IMAGE');
 return {schema,analysisText:analysis,imageUrl};
}
