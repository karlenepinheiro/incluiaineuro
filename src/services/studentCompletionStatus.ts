import type { Student } from '../types';

type CompletionStudent = Partial<Pick<Student,
  'name' | 'birthDate' | 'grade' | 'schoolId' | 'schoolName' | 'shift' |
  'guardianName' | 'guardianPhone' | 'guardianEmail' | 'isExternalStudent' | 'externalSchoolName'
>> & { age?: number | string };

/** Basic registration only: pedagogical and clinical fields never determine completion. */
export function getStudentCompletionStatus(student: CompletionStudent): {
  isComplete: boolean;
  missingFields: { key: string; label: string }[];
} {
  const present = (value?: string) => typeof value === 'string' && value.trim().length > 0;
  const hasAge = (typeof student.age === 'number' || (typeof student.age === 'string' && present(student.age))) &&
    Number.isFinite(Number(student.age)) && Number(student.age) >= 0;
  const essentials = [
    { key: 'name', label: 'Nome do aluno', present: present(student.name) },
    { key: 'birthDate', label: 'Data de nascimento ou idade', present: present(student.birthDate) || hasAge },
    { key: 'grade', label: 'Série/ano/turma', present: present(student.grade) },
    { key: 'schoolName', label: 'Escola', present: present(student.schoolName) || present(student.schoolId) ||
      (student.isExternalStudent === true && present(student.externalSchoolName)) },
    { key: 'shift', label: 'Turno', present: present(student.shift) },
    { key: 'guardianName', label: 'Nome do responsável', present: present(student.guardianName) },
    { key: 'guardianPhone', label: 'Telefone ou e-mail do responsável', present: present(student.guardianPhone) || present(student.guardianEmail) },
  ];
  const missingFields = essentials.filter(field => !field.present).map(({ key, label }) => ({ key, label }));
  return { isComplete: missingFields.length === 0, missingFields };
}
