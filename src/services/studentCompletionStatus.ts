import type { Student } from '../types';

type CompletionStudent = Partial<Student> & { age?: number | string };

/** Sections present in StudentForm. Optional blocks never prevent completion.
 * Detailed assessments, clinical data and address are not universally applicable.
 */
export const STUDENT_REGISTRATION_SECTIONS = [
  { id: 'identification', label: 'Identificação / dados pessoais', required: true },
  { id: 'address', label: 'Endereço Residencial', required: false },
  { id: 'school', label: 'Dados Escolares & Equipe', required: true },
  { id: 'health', label: 'Dados Clínicos e de Saúde', required: false },
  { id: 'context', label: 'Contexto e Histórico', required: true },
  { id: 'pedagogical', label: 'Perfil Pedagógico', required: true },
  { id: 'priorKnowledge', label: 'Conhecimento Prévio e Perfil Pedagógico', required: false },
  { id: 'family', label: 'Dados Sociofamiliares e Responsáveis', required: true },
] as const;

/** A section appears once, regardless of how many key fields are absent. */
export function getStudentCompletionStatus(student: CompletionStudent) {
  const present = (value?: string) => typeof value === 'string' && value.trim().length > 0;
  const hasItems = (values?: string[]) => Array.isArray(values) && values.some(present);
  const hasAge = (typeof student.age === 'number' || (typeof student.age === 'string' && present(student.age))) &&
    Number.isFinite(Number(student.age)) && Number(student.age) >= 0;
  const family = student.sociofamilyData;
  const fields = [
    { section: 'identification', key: 'name', label: 'Nome do aluno', present: present(student.name) },
    { section: 'identification', key: 'birthDate', label: 'Data de nascimento ou idade', present: present(student.birthDate) || hasAge },
    { section: 'school', key: 'grade', label: 'Série/ano/turma', present: present(student.grade) },
    { section: 'school', key: 'schoolName', label: 'Escola', present: present(student.schoolName) || present(student.schoolId) ||
      (student.isExternalStudent === true && present(student.externalSchoolName)) },
    { section: 'school', key: 'shift', label: 'Turno', present: present(student.shift) },
    // Same guardian data appears in identification and in the sociofamily block: count it once.
    { section: 'family', key: 'guardianName', label: 'Nome do responsável', present: present(student.guardianName) ||
      present(family?.familyStatus?.mainGuardianName) || present(family?.guardian1?.fullName) },
    { section: 'family', key: 'guardianPhone', label: 'Telefone ou e-mail do responsável', present: present(student.guardianPhone) ||
      present(student.guardianEmail) || present(family?.familyStatus?.schoolPrimaryPhone) || present(family?.guardian1?.phone) },
    // One real contextual record suffices; all three narratives are not required.
    { section: 'context', key: 'context', label: 'Registro de contexto ou histórico', present:
      present(student.schoolHistory) || present(student.familyContext) || present(student.observations) },
    // Both controls belong to Perfil Pedagógico. A recorded absence of barriers is valid text.
    { section: 'pedagogical', key: 'abilities', label: 'Habilidades / Potencialidades', present: hasItems(student.abilities) },
    { section: 'pedagogical', key: 'difficulties', label: 'Dificuldades / Barreiras', present: hasItems(student.difficulties) },
  ];
  const missing = fields.filter(field => !field.present);
  const incompleteSections = STUDENT_REGISTRATION_SECTIONS
    .filter(section => section.required && missing.some(field => field.section === section.id))
    .map(({ id, label }) => ({ id, label }));
  return {
    isComplete: incompleteSections.length === 0,
    incompleteSections,
    missingFields: missing.map(({ key, label }) => ({ key, label })),
  };
}
