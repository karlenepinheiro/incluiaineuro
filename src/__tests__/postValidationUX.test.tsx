import { getStudentCompletionStatus } from '../services/studentCompletionStatus';
import { getAeeGenerationAttempt } from '../services/aeeGenerationAttempt';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { getStudentBasicCompletionStatus } from '../services/csvImportService';
import { StudentCompletionBadge } from '../components/StudentCompletionBadge';
import { DOCUMENT_TEMPLATE_UPLOAD_ENABLED } from '../config/features';
import { serverCreditOperation } from '../../supabase/functions/_shared/creditCatalog';
vi.mock('../services/supabase', () => ({ supabase: {} }));
const read = (p: string) => fs.readFileSync(p, 'utf8');
describe('post-validation UX', () => {
  it('requires every essential field and lists only missing essentials', () => {
    const student = { name: 'Ana', birthDate: '2015-01-01', grade: ' ', schoolHistory:'Registro escolar', abilities:['Comunicação'], difficulties:['Atenção'] };
    expect(getStudentCompletionStatus(student)).toMatchObject({ isComplete: false, missingFields: [
      {key:'grade',label:'Série/ano/turma'}, {key:'schoolName',label:'Escola'}, {key:'shift',label:'Turno'},
      {key:'guardianName',label:'Nome do responsável'}, {key:'guardianPhone',label:'Telefone ou e-mail do responsável'},
    ] });
    expect(getStudentBasicCompletionStatus(student)).toBe('invalid');
  });
  it('complete has no missing fields and is green with accessible text', () => {
    const student = {name:'Ana',birthDate:'2015-01-01',grade:'3',schoolId:'school',shift:'Manhã',guardianName:'Maria',guardianPhone:'63999999999',schoolHistory:'Registro escolar',abilities:['Comunicação'],difficulties:['Atenção']};
    expect(getStudentCompletionStatus(student)).toMatchObject({isComplete:true,missingFields:[]});
    expect(getStudentBasicCompletionStatus(student)).toBe('enriched');
    const html=renderToStaticMarkup(<StudentCompletionBadge student={student as any}/>);
    expect(html).toContain('text-emerald-800'); expect(html).toContain('Cadastro completo'); expect(html).not.toContain('<ul');
  });
  it('incomplete is red and uses an auto-dismiss keyboard-accessible popover', () => {
    const html=renderToStaticMarkup(<StudentCompletionBadge student={{name:' '} as any}/>);
    expect(html).toContain('text-red-800'); expect(html).toContain('popover="auto"');
    expect(html).toContain('Identificação / dados pessoais'); expect(html.toLowerCase()).toContain('popovertarget');
  });
  it('hides upload and navigation while preserving canonical historical price', () => {
    expect(DOCUMENT_TEMPLATE_UPLOAD_ENABLED).toBe(false);
    expect(read('src/components/Sidebar.tsx')).toContain("DOCUMENT_TEMPLATE_UPLOAD_ENABLED && (isPaid");
    expect(read('src/components/DocumentBuilder.tsx')).toContain('DOCUMENT_TEMPLATE_UPLOAD_ENABLED && <>');
    expect(serverCreditOperation({operation:'UPLOAD_MODELO'}).cost).toBe(5);
  });
  it('AEE PDF invokes the same print action instead of formal PDF export', () => {
    const source=read('src/components/fichas/PlanoAcaoExportRow.tsx');
    expect(source).toContain("variant === 'aee' ? { onDownloadPdf: onPrint");
    const modal=read('src/components/AEEActionPlanTab.tsx');
    expect(modal).toContain('onPrint={handlePrint}');
    expect(modal).toContain('ref.current.innerHTML');
    expect(modal).not.toContain('PDFGenerator');
  });
  it('real AEE request maps to exactly seven, server ignores frontend amount', () => {
    const source=read('src/services/aiService.ts').split('async generateAEEActionPlan(')[1];
    expect(source).toContain("requestType: 'plano_acao_aee'");
    expect(source).toContain('operationId: attempt.operationId');
    expect(serverCreditOperation({requestType:'plano_acao_aee',targetDocType:'plano_acao_aee',task:'json',creditsRequired:0} as any)).toEqual({code:'PLANO_AEE',cost:7});
    expect(read('src/components/AEEActionPlanTab.tsx')).toContain("new CustomEvent('incluiai:credits-changed'");
  });
});

it('AEE retries keep operation id and prompt timestamp; next successful generation is new', async () => {
  const input = { studentId:'test-aee', period:'mensal' };
  const first = await getAeeGenerationAttempt(input, 'first-operation');
  const retry = await getAeeGenerationAttempt(input, 'new-id-from-click');
  expect(retry.operationId).toBe(first.operationId);
  expect(retry.generatedAt).toBe(first.generatedAt);
  first.complete();
  const next = await getAeeGenerationAttempt(input, 'next-operation');
  expect(next.operationId).toBe('next-operation');
  next.complete();
});
