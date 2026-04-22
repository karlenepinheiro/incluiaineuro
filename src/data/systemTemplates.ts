/**
 * systemTemplates.ts
 * Templates padrão do sistema IncluiAI para ESTUDO_CASO e PEI.
 *
 * Estes templates são IMUTÁVEIS — vivem em código, nunca no banco.
 * source = 'system' | isDefault implícito quando o usuário não tem um próprio.
 *
 * Estrutura espelha o buildStandardSections (versão completa) do DocumentBuilder,
 * mas sem dados de aluno: todos os values estão vazios (defaultValue: '').
 *
 * Escopo Fase 1: ESTUDO_CASO e PEI.
 */

import { TemplateData, UserDocumentTemplate, UserDocTemplateType } from '../types';

// ---------------------------------------------------------------------------
// Template padrão: ESTUDO DE CASO
// ---------------------------------------------------------------------------
const ESTUDO_CASO_TEMPLATE_DATA: TemplateData = {
  metadata: {
    schemaVersion: '1.0',
    docType: 'ESTUDO_CASO',
    lang: 'pt-BR',
    createdFrom: 'system',
  },
  sections: [
    {
      id: 'header',
      title: 'Identificação',
      description: 'Dados de identificação do aluno — preenchidos automaticamente.',
      order: 0,
      isLocked: true,
      fields: [
        { id: 'name',   label: 'Nome do Aluno',      type: 'text', order: 0, isLocked: true,  allowAudio: 'none', defaultValue: '' },
        { id: 'age',    label: 'Data de Nascimento',  type: 'text', order: 1, isLocked: true,  allowAudio: 'none', defaultValue: '' },
        { id: 'school', label: 'Unidade Escolar',    type: 'text', order: 2, isLocked: true,  allowAudio: 'none', defaultValue: '' },
        { id: 'grade',  label: 'Ano/Série',           type: 'text', order: 3, isLocked: true,  allowAudio: 'none', defaultValue: '' },
        { id: 'regent', label: 'Professor Regente',   type: 'text', order: 4, isLocked: true,  allowAudio: 'none', defaultValue: '' },
        { id: 'aee',    label: 'Prof. AEE',           type: 'text', order: 5, isLocked: true,  allowAudio: 'none', defaultValue: '' },
        { id: 'coord',  label: 'Coordenação',         type: 'text', order: 6, isLocked: true,  allowAudio: 'none', defaultValue: '' },
      ],
    },
    {
      id: 'hist',
      title: 'Histórico Escolar e Familiar',
      order: 1,
      isLocked: false,
      fields: [
        {
          id: 'h1',
          label: 'Histórico Completo (Escolar, Familiar, Saúde)',
          type: 'textarea',
          order: 0,
          isLocked: false,
          allowAudio: 'optional',
          placeholder: 'Descreva o histórico escolar, repetências, transferências, composição familiar e dinâmica...',
          defaultValue: '',
        },
      ],
    },
    {
      id: 'diag',
      title: 'Diagnóstico e Impactos',
      order: 2,
      isLocked: false,
      fields: [
        {
          id: 'd1',
          label: 'Diagnósticos e Condições',
          type: 'checklist',
          order: 0,
          isLocked: false,
          allowAudio: 'optional',
          options: ['TEA', 'TDAH', 'Deficiência Intelectual', 'Síndrome de Down', 'Deficiência Auditiva', 'Deficiência Visual', 'Deficiência Física', 'Altas Habilidades', 'Outros'],
          defaultValue: '',
        },
        {
          id: 'd2',
          label: 'Áreas Impactadas',
          type: 'checklist',
          order: 1,
          isLocked: false,
          allowAudio: 'optional',
          options: ['Comunicação', 'Interação Social', 'Cognição', 'Motricidade Fina', 'Motricidade Global', 'Sensorial', 'Autonomia'],
          defaultValue: '',
        },
      ],
    },
    {
      id: 'eval',
      title: 'Avaliação Funcional / Pedagógica',
      order: 3,
      isLocked: false,
      fields: [
        {
          id: 'e1',
          label: 'Habilidades e Potencialidades',
          type: 'textarea',
          order: 0,
          isLocked: false,
          allowAudio: 'optional',
          placeholder: 'O que o aluno já sabe fazer? Quais seus interesses?',
          defaultValue: '',
        },
        {
          id: 'e2',
          label: 'Dificuldades e Barreiras',
          type: 'textarea',
          order: 1,
          isLocked: false,
          allowAudio: 'optional',
          placeholder: 'Quais as principais dificuldades observadas?',
          defaultValue: '',
        },
      ],
    },
    {
      id: 'obs',
      title: 'Observações Comportamentais',
      order: 4,
      isLocked: false,
      fields: [
        {
          id: 'o1',
          label: 'Comportamento em Sala/Atendimento',
          type: 'textarea',
          order: 0,
          isLocked: false,
          allowAudio: 'optional',
          placeholder: 'Descreva o comportamento observado em sala ou no atendimento especializado...',
          defaultValue: '',
        },
      ],
    },
    {
      id: 'concl',
      title: 'Hipótese Diagnóstica / Conclusão',
      order: 5,
      isLocked: false,
      fields: [
        {
          id: 'c1',
          label: 'Parecer Final da Equipe',
          type: 'textarea',
          order: 0,
          isLocked: false,
          allowAudio: 'optional',
          placeholder: 'Hipótese diagnóstica e encaminhamentos sugeridos...',
          defaultValue: '',
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Template padrão: PEI
// ---------------------------------------------------------------------------
const PEI_TEMPLATE_DATA: TemplateData = {
  metadata: {
    schemaVersion: '1.0',
    docType: 'PEI',
    lang: 'pt-BR',
    createdFrom: 'system',
  },
  sections: [
    {
      id: 'header',
      title: 'Identificação',
      description: 'Dados de identificação do aluno — preenchidos automaticamente.',
      order: 0,
      isLocked: true,
      fields: [
        { id: 'name',   label: 'Nome do Aluno',      type: 'text', order: 0, isLocked: true, allowAudio: 'none', defaultValue: '' },
        { id: 'age',    label: 'Data de Nascimento',  type: 'text', order: 1, isLocked: true, allowAudio: 'none', defaultValue: '' },
        { id: 'school', label: 'Unidade Escolar',    type: 'text', order: 2, isLocked: true, allowAudio: 'none', defaultValue: '' },
        { id: 'grade',  label: 'Ano/Série',           type: 'text', order: 3, isLocked: true, allowAudio: 'none', defaultValue: '' },
        { id: 'regent', label: 'Professor Regente',   type: 'text', order: 4, isLocked: true, allowAudio: 'none', defaultValue: '' },
        { id: 'aee',    label: 'Prof. AEE',           type: 'text', order: 5, isLocked: true, allowAudio: 'none', defaultValue: '' },
        { id: 'coord',  label: 'Coordenação',         type: 'text', order: 6, isLocked: true, allowAudio: 'none', defaultValue: '' },
      ],
    },
    {
      id: 'barreiras',
      title: 'Barreiras e Impedimentos',
      order: 1,
      isLocked: false,
      fields: [
        {
          id: 'b1',
          label: 'Barreiras Identificadas',
          type: 'checklist',
          order: 0,
          isLocked: false,
          allowAudio: 'optional',
          options: ['Arquitetônicas', 'Comunicacionais', 'Metodológicas', 'Instrumentais', 'Programáticas', 'Atitudinais'],
          defaultValue: '',
        },
      ],
    },
    {
      id: 'base',
      title: 'Habilidades de Base',
      order: 2,
      isLocked: false,
      fields: [
        {
          id: 'hb1',
          label: 'Nível Atual de Desempenho',
          type: 'textarea',
          order: 0,
          isLocked: false,
          allowAudio: 'optional',
          placeholder: 'Descreva o nível atual nas áreas acadêmicas e funcionais...',
          defaultValue: '',
        },
      ],
    },
    {
      id: 'objs',
      title: 'Objetivos e Metas (SMART)',
      order: 3,
      isLocked: false,
      fields: [
        {
          id: 'obj1',
          label: 'Objetivos de Curto Prazo',
          type: 'textarea',
          order: 0,
          isLocked: false,
          allowAudio: 'optional',
          placeholder: 'Metas específicas, mensuráveis e atingíveis nos próximos 2-3 meses...',
          defaultValue: '',
        },
        {
          id: 'obj2',
          label: 'Objetivos de Médio/Longo Prazo',
          type: 'textarea',
          order: 1,
          isLocked: false,
          allowAudio: 'optional',
          placeholder: 'Metas para o semestre ou ano letivo...',
          defaultValue: '',
        },
      ],
    },
    {
      id: 'strat',
      title: 'Estratégias e Recursos',
      order: 4,
      isLocked: false,
      fields: [
        {
          id: 'st1',
          label: 'Estratégias Pedagógicas',
          type: 'textarea',
          order: 0,
          isLocked: false,
          allowAudio: 'optional',
          placeholder: 'Descreva as estratégias de ensino e adaptações curriculares...',
          defaultValue: '',
        },
        {
          id: 'res1',
          label: 'Recursos de Tecnologia Assistiva',
          type: 'checklist',
          order: 1,
          isLocked: false,
          allowAudio: 'optional',
          options: ['Prancha de Comunicação', 'Engrossadores', 'Tesoura Adaptada', 'Tablet/Software', 'Mobiliário Adaptado', 'Material Ampliado', 'Recursos Táteis'],
          defaultValue: '',
        },
      ],
    },
    {
      id: 'aval',
      title: 'Avaliação e Monitoramento',
      order: 5,
      isLocked: false,
      fields: [
        {
          id: 'av1',
          label: 'Parecer Avaliativo',
          type: 'scale',
          order: 0,
          isLocked: false,
          allowAudio: 'optional',
          minScale: 1,
          maxScale: 5,
          defaultValue: '',
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Mapa público: tipo → TemplateData
// ---------------------------------------------------------------------------
export const SYSTEM_TEMPLATE_DATA: Record<UserDocTemplateType, TemplateData> = {
  ESTUDO_CASO: ESTUDO_CASO_TEMPLATE_DATA,
  PEI: PEI_TEMPLATE_DATA,
};

/**
 * Retorna um UserDocumentTemplate sintético representando o template padrão
 * do sistema para o tipo informado. Nunca persiste no banco.
 */
export function getSystemTemplate(docType: UserDocTemplateType): UserDocumentTemplate {
  return {
    id: `system_${docType}`,
    tenantId: '',
    createdBy: 'system',
    name: docType === 'ESTUDO_CASO' ? 'Modelo Padrão IncluiAI — Estudo de Caso' : 'Modelo Padrão IncluiAI — PEI',
    description: 'Estrutura oficial IncluiAI. Baseie seu modelo personalizado neste.',
    documentType: docType,
    source: 'system',
    templateData: SYSTEM_TEMPLATE_DATA[docType],
    version: 1,
    isDefault: false,
    isActive: true,
    timesUsed: 0,
    createdAt: '',
    updatedAt: '',
  };
}
