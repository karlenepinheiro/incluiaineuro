// services/documentModel/matricula.ts
// [FASE 2 · BLOCO B] Adaptador: documentos de Matrícula → DocSection[].
//
//   - termo_aee                → Termo de Compromisso do Aluno no AEE
//   - declaracao_matricula_srm → Declaração de Matrícula na SRM
//   - declaracao_compromisso   → Declaração de Compromisso Familiar
//
// O texto das cláusulas é o MESMO do PDF canônico (PDFGenerator.generateMatriculaDoc,
// ~L6440-6534). MANTER EM SINCRONIA se aquele texto mudar. Nenhum dado é
// inventado — as cláusulas são texto institucional fixo parametrizado por
// aluno/escola/data.

import type { DocSection, SchoolConfig, Student } from '../../types';
import {
  buildSections, kvField, listField, proseField, resetFieldSeq, section,
} from './sectionBuilders';

export type MatriculaTipo = 'termo_aee' | 'declaracao_matricula_srm' | 'declaracao_compromisso';

const TITLES: Record<MatriculaTipo, string> = {
  termo_aee: 'Termo de Compromisso do Aluno no AEE',
  declaracao_matricula_srm: 'Declaração de Matrícula na Sala de Recursos Multifuncionais',
  declaracao_compromisso: 'Declaração de Compromisso Familiar',
};

export function matriculaTitle(tipo: MatriculaTipo): string {
  return TITLES[tipo] ?? 'Documento de Matrícula';
}

export function matriculaDocLabel(tipo: MatriculaTipo): string {
  return ({
    termo_aee: 'Termo de Compromisso AEE',
    declaracao_matricula_srm: 'Declaracao de Matricula SRM',
    declaracao_compromisso: 'Declaracao de Compromisso Familiar',
  } as Record<MatriculaTipo, string>)[tipo] ?? 'Documento de Matricula';
}

export function matriculaToSections(
  tipo: MatriculaTipo,
  student: Student,
  school?: SchoolConfig | null,
): DocSection[] {
  resetFieldSeq();
  const sName = school?.schoolName || student.schoolName || 'Escola não informada';
  const ano = new Date().getFullYear();

  const identificacao = section('Identificação do Aluno', [
    kvField('id', 'Aluno(a)', student.name),
    kvField('id', 'Data de nascimento', student.birthDate),
    kvField('id', 'Série / Turma', student.grade),
    kvField('id', 'Turno', student.shift),
    kvField('id', 'Responsável legal', student.guardianName),
    kvField('id', 'Telefone', student.guardianPhone),
    kvField('id', 'Instituição', sName),
  ]);

  let corpo: DocSection | null = null;

  if (tipo === 'termo_aee') {
    corpo = section('Termos e Condições', [
      listField('tc', '', [
        `1. O(A) aluno(a) ${student.name} é formalmente matriculado(a) no Atendimento Educacional Especializado (AEE) da instituição ${sName}, conforme previsto pela Resolução CNE/CEB nº 4, de 2 de outubro de 2009 e pela Política Nacional de Educação Especial na Perspectiva da Educação Inclusiva.`,
        `2. O responsável legal declara ciência de que o AEE é um serviço complementar e não substitutivo ao ensino regular, sendo realizado preferencialmente na Sala de Recursos Multifuncionais (SRM) no contraturno escolar.`,
        `3. O responsável compromete-se a colaborar com as orientações do professor do AEE, participar das reuniões de acompanhamento e comunicar à instituição qualquer alteração relevante nas condições de saúde ou desenvolvimento do(a) aluno(a).`,
        `4. A instituição compromete-se a garantir atendimento individualizado, elaboração de Plano de AEE e comunicação regular com a família sobre o desenvolvimento do(a) aluno(a).`,
        `5. Este termo tem validade pelo ano letivo vigente, podendo ser renovado mediante nova avaliação pedagógica.`,
      ]),
    ]);
  } else if (tipo === 'declaracao_matricula_srm') {
    corpo = section('Declaração Oficial', [
      proseField('do', '',
        `Declaramos, para os devidos fins, que o(a) aluno(a) ${student.name}, regularmente matriculado(a) no Ensino Regular na série ${student.grade || 'não informada'}, turno ${student.shift || 'não informado'}, encontra-se igualmente matriculado(a) na Sala de Recursos Multifuncionais (SRM) desta instituição, conforme deliberado pelo Conselho Pedagógico.\n\nO Atendimento Educacional Especializado (AEE) prestado na SRM tem como objetivo eliminar as barreiras que possam obstruir o processo de escolarização dos alunos público-alvo da Educação Especial, em conformidade com a Resolução CNE/CEB nº 4/2009 e o Decreto nº 7.611/2011.\n\nEsta declaração é fornecida a pedido do(a) interessado(a) para os fins que se fizerem necessários.`),
    ]);
  } else {
    corpo = section('Declaração de Compromisso Familiar', [
      proseField('cf', '',
        `Eu, ${student.guardianName || '______________________________'}, responsável legal pelo(a) aluno(a) ${student.name}, declaro estar ciente e de acordo com as condições do Atendimento Educacional Especializado (AEE) oferecido pela instituição ${sName}, comprometendo-me a:`),
      listField('cf', '', [
        'Comparecer às reuniões de acompanhamento convocadas pela equipe pedagógica;',
        'Manter a frequência regular do(a) aluno(a) nos atendimentos do AEE;',
        'Comunicar à instituição quaisquer mudanças relevantes na condição de saúde, medicação ou contexto familiar do(a) aluno(a);',
        'Colaborar com as orientações e estratégias definidas no Plano de AEE;',
        'Respeitar e contribuir com o processo pedagógico especializado.',
      ]),
      proseField('cf', '',
        'Declaro ainda ter recebido orientações claras sobre o funcionamento do AEE e sobre os direitos e deveres previstos na legislação vigente de Educação Especial Inclusiva.'),
    ]);
  }

  const baseLegal = section('Base Legal', [
    proseField('bl', '',
      `Resolução CNE/CEB nº 4/2009; Decreto nº 7.611/2011; Lei nº 13.146/2015 (LBI); Lei nº 9.394/1996 (LDB Art. 59). Documento pedagógico institucional referente ao Ano Letivo ${ano}. Dados pessoais protegidos pela Lei nº 13.709/2018 (LGPD) — uso restrito à equipe escolar.`),
  ]);

  return buildSections([identificacao, corpo, baseLegal]);
}
