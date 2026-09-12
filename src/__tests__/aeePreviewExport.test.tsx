import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it, expect, vi} from 'vitest';
import fs from 'node:fs';
import {AEEPrintModal} from '../components/AEEActionPlanTab';
import {StudentCompletionBadge} from '../components/StudentCompletionBadge';
import {PlanoAcaoExportRow} from '../components/fichas/PlanoAcaoExportRow';
const spies=vi.hoisted(()=>({legacyPdf:vi.fn(), actions:null as any}));
vi.mock('../services/aiService',()=>({AIService:{}}));
vi.mock('../services/aeeActionPlanService',()=>({AEEActionPlanService:{}}));
vi.mock('../services/supabase',()=>({supabase:{}}));
vi.mock('../components/document-workspace/useFormalDocumentExport',()=>({useFormalDocumentExport:(options:any)=>({onDownloadPdf:spies.legacyPdf,onPrint:options.onPrint})}));
vi.mock('../components/document-workspace/DocumentExportActions',()=>({DocumentExportActions:(props:any)=>{spies.actions=props;return null;}}));
const block={title:'Roteiro de atendimento',items:[{id:'one',text:'Organizar cartões de comunicação sobre a mesa.',done:false},{id:'two',text:'Registrar a resposta observada durante a atividade.',done:true}]};
const plan:any={period:'mensal',generatedAt:'2026-09-12T12:00:00Z',generatedByName:'Professora exemplo',registrationNumber:'REG-20260912-TESTE',sessionObjective:'Usar cartões para comunicar escolhas durante a atividade.',welcomeRoutine:block,priorityBarrier:block,sessionScript:block,materials:block,applicationGuide:block,responseRecord:block,nextStep:'Revisar os registros na próxima sessão.'};
const student:any={id:'fixture',name:'Aluno de demonstração'};
it('AEE PDF and print dispatch the identical renderer; Regente still uses formal PDF',()=>{
  const print=vi.fn();
  renderToStaticMarkup(<PlanoAcaoExportRow variant="aee" plan={plan} student={student} onPrint={print}/>);
  expect(spies.actions.onDownloadPdf).toBe(print);
  spies.actions.onDownloadPdf();expect(print).toHaveBeenCalledOnce();expect(spies.legacyPdf).not.toHaveBeenCalled();
  renderToStaticMarkup(<PlanoAcaoExportRow variant="regente" plan={plan} student={student} onPrint={print}/>);
  expect(spies.actions.onDownloadPdf).toBe(spies.legacyPdf);
});
it('approved preview preserves selectable content, checklists, identity and document number',()=>{
  const html=renderToStaticMarkup(<AEEPrintModal plan={plan} studentName={student.name} student={student} user={{}} onClose={()=>{}}/>);
  expect(html).toContain('REG-20260912-TESTE');expect(html).toContain('IncluiAI');expect(html).toContain('☐');expect(html).toContain('✓');expect(html).toContain(block.items[0].text);
  if(process.env.UX_VISUAL_FIXTURES){
    fs.writeFileSync('ux-preview.html',html);
    fs.writeFileSync('ux-badge.html',renderToStaticMarkup(<StudentCompletionBadge student={student}/>));
  }
});
