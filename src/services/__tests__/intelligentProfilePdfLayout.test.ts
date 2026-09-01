/**
 * intelligentProfilePdfLayout.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * [COMPACTAÇÃO E REDESIGN DOCUMENTAL — 09/2026]
 * Regressão de paginação do PDF do Perfil Inteligente.
 *
 * Contexto: a homologação visual identificou o Perfil saindo com 7 páginas.
 * A meta é compactar para ~4 páginas SEM cortar conteúdo, sem reduzir a fonte
 * de forma inadequada e sem gerar páginas vazias ou uma página isolada só de
 * assinaturas.
 *
 * Estes testes NÃO fixam exatamente 4 páginas — asseguram um teto (<= 4 para um
 * perfil realista completo) e invariantes estruturais.
 */
import { describe, expect, it } from 'vitest';
import type { SchoolConfig, Student } from '../../types';
import type { IntelligentProfileJSON } from '../intelligentProfileService';
import { buildIntelligentProfilePdf } from '../IntelligentProfilePDFDocument';

const P = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    `Frase ${i + 1} do parágrafo, com extensão suficiente para exercitar a quebra de linha real do gerador e refletir um conteúdo pedagógico plausível.`,
  ).join(' ');

const student: Student = {
  id: 'stu-1',
  name: 'Maria Aparecida de Souza Lima',
  birthDate: '2015-03-12',
  grade: '4º ano',
  shift: 'Manhã',
  diagnosis: ['TEA'],
  cid: ['F84.0'],
  supportLevel: 'Moderado',
  regentTeacher: 'Prof.ª Joana Ribeiro',
  aeeTeacher: 'Prof. Carlos Menezes',
  medication: 'Metilfenidato 10mg',
} as unknown as Student;

const school: SchoolConfig = {
  schoolName: 'Escola Municipal Padre Anchieta',
  city: 'Belo Horizonte',
  state: 'MG',
} as unknown as SchoolConfig;

/** Perfil realista e "cheio" — representa o pior caso plausível de volume. */
const fullProfile: IntelligentProfileJSON = {
  studentName: student.name,
  generatedAt: '2026-08-20T13:00:00Z',
  generatedBy: 'Equipe Multidisciplinar',
  version: 3,
  firstPersonLetter: P(4),
  humanizedIntroduction: { title: 'Quem sou eu', text: P(3) },
  pedagogicalReport: {
    text: P(5),
    checklist: [
      { label: 'Leitura de palavras e frases curtas', status: 'em_desenvolvimento' },
      { label: 'Produção escrita autônoma', status: 'nao_observado' },
      { label: 'Contagem e correspondência numérica até 20', status: 'presente' },
      { label: 'Permanência em atividades dirigidas', status: 'em_desenvolvimento' },
      { label: 'Interação com pares em atividades em grupo', status: 'em_desenvolvimento' },
      { label: 'Seguimento de rotina visual', status: 'presente' },
    ],
  },
  neuroPedagogicalReport: {
    text: P(5),
    checklist: [
      { label: 'Atenção sustentada', status: 'em_desenvolvimento' },
      { label: 'Memória de trabalho', status: 'nao_observado' },
      { label: 'Funções executivas — planejamento', status: 'em_desenvolvimento' },
      { label: 'Processamento sensorial (auditivo)', status: 'nao_observado' },
      { label: 'Regulação emocional', status: 'em_desenvolvimento' },
    ],
  },
  bestLearningStrategies: {
    text: '',
    items: [
      'Apoios visuais concretos (imagens, pictogramas e objetos) antes de instruções verbais.',
      'Rotina previsível com antecipação de transições.',
      'Tarefas curtas e segmentadas, com pausas sensoriais planejadas.',
      'Reforço positivo imediato e específico.',
      'Uso de interesses restritos (dinossauros) como ponte para novos conteúdos.',
    ],
  },
  recommendedActivities: [
    { title: 'Trilha dos números', objective: P(2), howToApply: P(3), whyItHelps: P(2), supportLevel: 'Médio', incluiLabPrompt: 'x' },
    { title: 'Caixa de histórias sensoriais', objective: P(2), howToApply: P(3), whyItHelps: P(2), supportLevel: 'Alto', incluiLabPrompt: 'x' },
    { title: 'Quadro de rotina com velcro', objective: P(2), howToApply: P(2), whyItHelps: P(2), supportLevel: 'Baixo', incluiLabPrompt: 'x' },
    { title: 'Jogo de pareamento de emoções', objective: P(2), howToApply: P(3), whyItHelps: P(2), supportLevel: 'Médio', incluiLabPrompt: 'x' },
  ],
  strengths: [
    'Excelente memória visual para sequências e trajetos.',
    'Alto engajamento em atividades com tema de interesse.',
    'Boa coordenação motora fina em tarefas de encaixe.',
    'Responde bem a elogios e a combinados claros.',
  ],
  challenges: [
    { title: 'Transições', description: P(2) },
    { title: 'Ambientes ruidosos', description: P(2) },
    { title: 'Frustração com erro', description: P(2) },
  ],
  observationPoints: {
    text: P(3),
    checklist: [
      'Registrar duração da permanência em atividade dirigida.',
      'Anotar gatilhos de desregulação e estratégias que funcionaram.',
      'Observar iniciativa de comunicação espontânea.',
      'Marcar aceitação de alimentos novos no lanche.',
    ],
  },
  carePoints: [],
  nextSteps: [],
};

const minimalProfile: IntelligentProfileJSON = {
  studentName: student.name,
  generatedAt: '2026-08-20T13:00:00Z',
  generatedBy: 'Equipe',
  version: 1,
  firstPersonLetter: 'Eu gosto de desenhar e de brincar no pátio.',
  humanizedIntroduction: { title: 'Quem sou eu', text: 'Aluno comunicativo.' },
  pedagogicalReport: { text: P(1), checklist: [{ label: 'Leitura inicial', status: 'em_desenvolvimento' }] },
  neuroPedagogicalReport: { text: P(1), checklist: [{ label: 'Atenção', status: 'em_desenvolvimento' }] },
  bestLearningStrategies: { text: '', items: ['Apoio visual.'] },
  recommendedActivities: [
    { title: 'Atividade única', objective: P(1), howToApply: P(1), whyItHelps: P(1), supportLevel: 'Médio', incluiLabPrompt: 'x' },
  ],
  strengths: ['Boa memória visual.'],
  challenges: [{ title: 'Transições', description: 'Precisa de antecipação.' }],
  observationPoints: { text: P(1), checklist: ['Registrar permanência.'] },
  carePoints: [],
  nextSteps: [],
};

const baseParams = {
  student,
  versionNumber: 3,
  generatedAt: '2026-08-20T13:00:00Z',
  generatedByName: 'Equipe Multidisciplinar',
  school,
};

describe('Perfil Inteligente — regressão de paginação (compactação 7 → ~4)', () => {
  it('perfil realista completo cabe em no máximo 4 páginas', async () => {
    const { pageCount } = await buildIntelligentProfilePdf({ ...baseParams, profile: fullProfile });
    expect(pageCount).toBeLessThanOrEqual(4);
    expect(pageCount).toBeGreaterThanOrEqual(3);
  });

  it('perfil mínimo não infla o documento (<= 2 páginas)', async () => {
    const { pageCount } = await buildIntelligentProfilePdf({
      ...baseParams, versionNumber: 1, profile: minimalProfile,
    });
    expect(pageCount).toBeLessThanOrEqual(2);
  });

  it('as assinaturas NÃO criam uma página isolada (mesmo nº de páginas com e sem o bloco)', async () => {
    const withSig = await buildIntelligentProfilePdf({ ...baseParams, profile: fullProfile });
    const withoutSig = await buildIntelligentProfilePdf(
      { ...baseParams, profile: fullProfile },
      { includeSignatures: false },
    );
    expect(withSig.pageCount).toBe(withoutSig.pageCount);
  });

  it('não gera página final vazia — a última página tem conteúdo de corpo real', async () => {
    const { doc, pageCount } = await buildIntelligentProfilePdf({ ...baseParams, profile: fullProfile });
    // jsPDF guarda o stream de operações de cada página em doc.internal.pages[i].
    const lastPageOps = (doc.internal as any).pages[pageCount] as string[];
    const lastPageStream = Array.isArray(lastPageOps) ? lastPageOps.join('\n') : String(lastPageOps ?? '');
    // Cabeçalho corrido + rodapé + moldura sozinhos produzem um stream curto;
    // uma página com conteúdo real de seção é substancialmente maior.
    expect(lastPageStream.length).toBeGreaterThan(1500);
  });

  it('gera um Blob de PDF não vazio', async () => {
    const { blob } = await buildIntelligentProfilePdf({ ...baseParams, profile: fullProfile });
    expect(blob.size).toBeGreaterThan(2000);
  });
});
