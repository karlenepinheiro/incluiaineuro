// services/documentModel/studentProfile.ts
// [FASE 2 · BLOCO B] Adaptador: Perfil do Aluno (dossiê cadastral) → DocSection[].
//
// Documento DIFERENTE do Perfil Inteligente: usa os dados PERSISTIDOS do aluno
// (cadastro), nunca o JSON do Perfil Inteligente. As seções seguem o
// generateStudentProfilePDF (dossiê), respeitando o `config` de quais blocos
// mostrar. `extraData` traz agregações (evoluções, documentos, protocolos).

import type { DocSection, SchoolConfig, Student } from '../../types';
import {
  buildSections, gridField, kvField, listField, proseField, resetFieldSeq, section,
} from './sectionBuilders';

export interface StudentProfileConfig {
  dadosAluno?: boolean; enderecoCompleto?: boolean; codigoUnico?: boolean;
  perfilPedagogico?: boolean; conhecimentoPrevio?: boolean;
  dadosSociofamiliares?: boolean; responsaveisContatos?: boolean;
  ultimaAvaliacao?: boolean; agendamentos?: boolean; controleAtendimento?: boolean;
  documentosGerados?: boolean; analiseLaudo?: boolean; fichasComplementares?: boolean;
}

export interface StudentProfileExtra {
  evolutions?: any[]; appointments?: any[]; serviceRecords?: any[];
  documents?: any[]; protocols?: any[]; fichas?: any[]; medicalReports?: any[];
}

const DEFAULT_CFG: Required<StudentProfileConfig> = {
  dadosAluno: true, enderecoCompleto: false, codigoUnico: true,
  perfilPedagogico: true, conhecimentoPrevio: true,
  dadosSociofamiliares: true, responsaveisContatos: true,
  ultimaAvaliacao: true, agendamentos: true, controleAtendimento: true,
  documentosGerados: true, analiseLaudo: true, fichasComplementares: true,
};

export function studentProfileTitle(): string {
  return 'Perfil do Aluno — Dossiê Pedagógico';
}

function joinArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(x => String(x ?? '').trim()).filter(Boolean) : [];
}

export function studentProfileToSections(
  student: Student,
  opts: { config?: StudentProfileConfig; extra?: StudentProfileExtra } = {},
): DocSection[] {
  resetFieldSeq();
  const cfg = { ...DEFAULT_CFG, ...(opts.config ?? {}) };
  const s = student as any;
  const extra = opts.extra ?? {};
  const cid = typeof student.cid === 'string' ? student.cid : joinArr(student.cid).join(', ');

  const address = [
    student.street, student.streetNumber, student.complement,
    student.neighborhood, student.city, student.state, student.zipcode,
  ].filter(Boolean).join(', ');

  return buildSections([
    cfg.dadosAluno && section('Identificação do Aluno', [
      kvField('id', 'Nome', student.name),
      kvField('id', 'Data de nascimento', student.birthDate),
      kvField('id', 'Sexo', student.gender),
      kvField('id', 'Série / Turma', student.grade),
      kvField('id', 'Turno', student.shift),
      kvField('id', 'Escola', student.schoolName || student.externalSchoolName || ''),
      kvField('id', 'Professor(a) regente', student.regentTeacher),
      kvField('id', 'Professor(a) AEE', student.aeeTeacher || ''),
      kvField('id', 'Coordenação', student.coordinator || ''),
      ...(cfg.codigoUnico ? [kvField('id', 'Código único', student.unique_code || student.id?.slice(-8) || '')] : []),
      ...(cfg.enderecoCompleto ? [kvField('id', 'Endereço', address)] : []),
    ]),

    cfg.analiseLaudo && section('Diagnóstico e Laudo', [
      listField('dg', 'Diagnóstico(s)', student.diagnosis),
      kvField('dg', 'CID', cid),
      kvField('dg', 'Nível de suporte', student.supportLevel),
      kvField('dg', 'Medicação', student.medication),
      kvField('dg', 'Situação do cadastro', s.tipo_aluno === 'com_laudo' ? 'Com laudo'
        : s.tipo_aluno === 'em_triagem' ? 'Em triagem' : 'Em preenchimento'),
      listField('dg', 'Profissionais que acompanham', student.professionals),
    ]),

    cfg.perfilPedagogico && section('Perfil Pedagógico', [
      listField('pp', 'Habilidades', student.abilities),
      listField('pp', 'Dificuldades', student.difficulties),
      listField('pp', 'Estratégias que funcionam', student.strategies),
      listField('pp', 'Formas de comunicação', student.communication),
      proseField('pp', 'Observações', student.observations, { optional: true }),
      listField('pp', 'Adaptações e recursos', [...joinArr(s.adaptacoes ?? s.adaptations), ...joinArr(s.recursos ?? s.resources)]),
      proseField('pp', 'Recomendações', s.recomendacoes ?? s.recommendations, { optional: true }),
      proseField('pp', 'Encaminhamentos', s.encaminhamentos ?? s.referrals, { optional: true }),
    ]),

    cfg.conhecimentoPrevio && section('Histórico Escolar', [
      proseField('he', '', student.schoolHistory || student.history),
    ]),

    cfg.dadosSociofamiliares && section('Contexto Sociofamiliar', [
      proseField('sf', '', student.familyContext, { optional: true }),
    ]),

    cfg.responsaveisContatos && section('Responsáveis e Contatos', [
      kvField('rc', 'Responsável legal', student.guardianName),
      kvField('rc', 'Telefone', student.guardianPhone),
      kvField('rc', 'E-mail', student.guardianEmail || ''),
    ]),

    // ── Agregações (extraData) — resumo, mesma origem do PDF ──
    cfg.documentosGerados && (extra.protocols?.length || extra.documents?.length)
      ? section('Documentos e Protocolos', [
          gridField('doc', 'Protocolos formais', ['Tipo', 'Status', 'Data'],
            (extra.protocols ?? []).map((p: any) => [
              String(p.type ?? p.doc_type ?? ''),
              String(p.status ?? ''),
              p.lastEditedAt || p.createdAt ? new Date(p.lastEditedAt || p.createdAt).toLocaleDateString('pt-BR') : '',
            ])),
          gridField('doc', 'Documentos da biblioteca', ['Tipo', 'Data'],
            (extra.documents ?? []).map((d: any) => [
              String(d.doc_type ?? d.type ?? ''),
              d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : '',
            ])),
        ])
      : null,

    cfg.ultimaAvaliacao && extra.evolutions?.length
      ? section('Avaliações de Evolução (resumo)', [
          gridField('ev', '', ['Data', 'Média'],
            (extra.evolutions ?? []).slice(0, 12).map((e: any) => {
              const sc = e.scores ?? [];
              const avg = sc.length ? (sc.reduce((a: number, b: number) => a + (Number(b) || 0), 0) / sc.length).toFixed(1) : '';
              return [
                e.createdAt || e.date ? new Date(e.createdAt || e.date).toLocaleDateString('pt-BR') : '',
                avg ? `${avg}/5` : '',
              ];
            })),
        ])
      : null,

    cfg.controleAtendimento && extra.serviceRecords?.length
      ? section('Controle de Atendimentos (resumo)', [
          kvField('ca', 'Total de registros', String(extra.serviceRecords.length)),
          kvField('ca', 'Presenças', String(extra.serviceRecords.filter((r: any) => r.attendance === 'Presente').length)),
        ])
      : null,

    cfg.fichasComplementares && extra.fichas?.length
      ? section('Fichas Complementares (resumo)', [
          listField('fc', '', (extra.fichas ?? []).map((f: any) =>
            `${f.form_type ?? f.type ?? 'Ficha'} — ${f.created_at ? new Date(f.created_at).toLocaleDateString('pt-BR') : ''}`)),
        ])
      : null,
  ]);
}
