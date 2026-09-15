import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import PizZip from 'pizzip';
import { ServiceRecordService } from '../persistenceService';
import { serviceRecordToSections, serviceRecordTitle } from '../documentModel/serviceRecord';
import { PDFGenerator } from '../PDFGenerator';
import { exportGenericDocumentToWord } from '../wordExportService';
import type { ServiceRecord, Student, User } from '../../types';

const db = vi.hoisted(() => ({ rows: new Map<string, any>(), fail: false }));
vi.mock('../supabase', () => ({ supabase: { from: (table: string) => ({
  upsert: (row: any) => ({ select: () => ({ single: async () => {
    if (db.fail) return { error: new Error('offline'), data: null };
    const saved = { created_at: '2026-09-14T12:00:00Z', ...db.rows.get(row.id), ...row };
    db.rows.set(row.id, saved);
    return { data: saved, error: null };
  } }) }),
  insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'timeline' }, error: null }) }) }),
}) } }));

const record: ServiceRecord = {
  id: 'record-1', studentId: 'student-1', studentName: 'Ana', date: '2026-09-14',
  type: 'AEE', professional: 'Professora Ana', duration: 50, attendance: 'Falta',
  observation: 'SENT_OBSERVATION', createdAt: '2026-09-14T12:00:00Z',
  pedagogical: { objective: 'SENT_OBJECTIVE', activities: 'SENT_ACTIVITIES',
    studentResponse: 'SENT_RESPONSE', strategies: 'SENT_STRATEGIES', nextSteps: 'SENT_NEXT' },
  dailyChecklist: { desempenho: 8, interacao: 6, comportamento: 'adequado',
    progressoAtividade: 'SENT_PROGRESS', estrategiasUsadas: 'SENT_LEGACY_STRATEGIES', proximosPassos: 'SENT_LEGACY_NEXT' },
};

afterEach(() => { db.rows.clear(); db.fail = false; vi.unstubAllGlobals(); });

describe('Registro de Atendimento — persistência e compatibilidade', () => {
  it('cria, reabre e edita o mesmo ID sem perder ficha, vínculo ou criação', async () => {
    const saved = await ServiceRecordService.save(record, 'tenant-1');
    expect(saved).toMatchObject(record);
    const edited = await ServiceRecordService.save({ ...saved, observation: 'EDITADO' }, 'tenant-1');
    expect(db.rows.size).toBe(1);
    expect(edited).toMatchObject({ ...record, observation: 'EDITADO' });
  });
  it('propaga falha e permite repetir com o mesmo ID', async () => {
    db.fail = true;
    await expect(ServiceRecordService.save(record, 'tenant-1')).rejects.toThrow('offline');
    db.fail = false;
    await ServiceRecordService.save(record, 'tenant-1');
    await ServiceRecordService.save(record, 'tenant-1');
    expect(db.rows.size).toBe(1);
  });
  it('aceita registros antigos, checklist em texto/JSON e não inventa avaliação', () => {
    const row = ServiceRecordService.toRow(record, 'tenant-1');
    expect(ServiceRecordService.fromRow({ ...row, daily_checklist: record.dailyChecklist }).dailyChecklist).toEqual(record.dailyChecklist);
    const legacy = ServiceRecordService.fromRow({ ...row, pedagogical: null, daily_checklist: null });
    expect(legacy.pedagogical).toBeUndefined();
    expect(legacy.dailyChecklist).toBeUndefined();
    expect(serviceRecordToSections(legacy).map(s => s.title)).toEqual(['Dados do Atendimento', 'Observações do Atendimento']);
  });
});

describe('Registro de Atendimento — PDF real e DOCX', () => {
  it('exporta todos os campos nos dois formatos e mantém atendimento curto em uma página', async () => {
    let pdf: jsPDF;
    const texts: string[] = [];
    class CapturedPdf extends jsPDF {
      constructor(options: any) {
        super(options);
        pdf = this;
        const originalText = this.text.bind(this);
        this.text = ((text: any, ...args: any[]) => {
          texts.push(...(Array.isArray(text) ? text : [text]));
          return (originalText as any)(text, ...args);
        }) as any;
      }
    }
    vi.stubGlobal('window', { jspdf: { jsPDF: CapturedPdf } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline font fallback')));
    const sections = serviceRecordToSections(record);
    const student = { id: record.studentId, name: record.studentName } as Student;
    const user = { name: record.professional } as User;
    const blob = await PDFGenerator.generateFromSections({ docType: 'Registro de Atendimento',
      title: serviceRecordTitle(), student, user, sections, auditCode: 'REG-20260914-120000-ABCD', compactServiceRecord: true });
    expect(blob.size).toBeGreaterThan(1000);
    expect(pdf!.getNumberOfPages()).toBe(1);
    const word = await exportGenericDocumentToWord({ title: serviceRecordTitle(), data: { sections },
      student, user, compactServiceRecord: true });
    const xml = new PizZip(await word.arrayBuffer()).file('word/document.xml')!.asText();
    for (const sentinel of ['SENT_OBSERVATION', ...Object.values(record.pedagogical!),
      'SENT_PROGRESS', 'SENT_LEGACY_STRATEGIES', 'SENT_LEGACY_NEXT', '8/8', '6/8', '14/09/2026']) {
      expect(texts.join('\n')).toContain(sentinel);
      expect(xml).toContain(sentinel);
    }
    expect(xml).not.toContain('w:type="page"');
    texts.length = 0;
    const longer = serviceRecordToSections({ ...record,
      observation: 'Atividade com apoio e resposta observada. '.repeat(50) + 'SENT_FINAL_LONGO' });
    await PDFGenerator.generateFromSections({ docType: 'Registro de Atendimento',
      title: serviceRecordTitle(), student, user, sections: longer,
      auditCode: 'REG-20260914-120000-ABCD', compactServiceRecord: true });
    expect(pdf!.getNumberOfPages()).toBe(2);
    expect(texts.join('\n')).toContain('SENT_FINAL_LONGO');
  });
});
