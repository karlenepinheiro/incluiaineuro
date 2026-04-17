/**
 * csvImportService.ts
 * Serviço de importação de alunos por CSV.
 *
 * Responsabilidades:
 *  - Gerar/baixar modelo CSV e exemplo preenchido
 *  - Fazer parse robusto de CSV (vírgula ou ponto-e-vírgula, BOM, aspas)
 *  - Mapear cabeçalhos em português (com/sem acento, variações) para campos Student
 *  - Calcular registration_status de cada linha
 *  - Persistir lote (import_batches) e alunos no Supabase
 */

import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS PÚBLICOS
// ─────────────────────────────────────────────────────────────────────────────

export type RegistrationStatus = 'complete' | 'incomplete' | 'pre_registered';

export interface ImportStudentRow {
  rowIndex: number;
  // Campos reconhecidos (todos opcionais — só nome é obrigatório para importar)
  name?: string;
  birthDate?: string;
  gender?: string;
  grade?: string;
  shift?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  regentTeacher?: string;
  aeeTeacher?: string;
  coordinator?: string;
  cid?: string;
  diagnosis?: string;
  schoolName?: string;
  supportLevel?: string;
  observations?: string;
  // Metadados de validação
  registrationStatus: RegistrationStatus;
  missingRequiredFields: string[];  // nomes legíveis (ex: ["Responsável","Telefone"])
  // Raw original
  rawRow: Record<string, string>;
  // Flag de erro (linha sem nome = não importável)
  hasError: boolean;
  errorMessage?: string;
  // Aviso não-fatal: gênero não reconhecido (campo salvo como null)
  genderWarning?: string;
}

export interface ParsedCSVResult {
  validRows: ImportStudentRow[];    // linhas importáveis (com nome)
  errorRows: ImportStudentRow[];    // linhas ignoradas (sem nome ou vazias)
  totalRows: number;                // total de linhas de dados (sem cabeçalho)
  unrecognizedHeaders: string[];    // colunas que o parser não reconheceu
  detectedSeparator: ',' | ';';
}

export interface ImportBatchResult {
  batchId: string;
  totalRows: number;
  importedRows: number;
  errorRows: number;
  completeRows: number;
  incompleteRows: number;
  preRegRows: number;
  importedStudents: any[];
  errors: { rowIndex: number; name?: string; error: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// MODELO CSV: cabeçalhos canônicos e linha de exemplo
// ─────────────────────────────────────────────────────────────────────────────

export const TEMPLATE_HEADERS = [
  'nome',
  'data_nascimento',
  'genero',
  'serie_ano',
  'turno',
  'responsavel',
  'telefone_responsavel',
  'email_responsavel',
  'professor_regente',
  'professor_aee',
  'coordenacao',
  'cid',
  'diagnostico',
  'escola',
  'nivel_suporte',
  'observacoes',
] as const;

// Valores aceitos na coluna gênero: M, F, Masculino, Feminino, male, female, Outro, Other
export const TEMPLATE_EXAMPLE_ROWS = [
  [
    'Maria Clara dos Santos',
    '15/03/2018',
    'Feminino',
    '3º ano EF',
    'Manhã',
    'Ana dos Santos',
    '(11) 99999-1234',
    'ana@email.com',
    'Prof. João Silva',
    'Prof. Carla AEE',
    'Coord. Pedro Lima',
    'F84.0',
    'TEA Nível 1',
    'EMEF Monteiro Lobato',
    'Moderado',
    'Boa receptividade a atividades visuais e rotinas estruturadas',
  ],
  [
    'Lucas Ferreira',
    '22/07/2016',
    'Masculino',
    '5º ano EF',
    'Tarde',
    'Roberto Ferreira',
    '(11) 98888-5678',
    '',
    'Profa. Márcia',
    '',
    '',
    'F90.0',
    'TDAH',
    'EMEF João Pessoa',
    'Leve',
    'Necessita pausas frequentes e espaço de trabalho individualizado',
  ],
  [
    'Sofia Ramos',
    '',
    'F',
    '1º ano EF',
    'Manhã',
    'Carla Ramos',
    '(11) 97777-9012',
    '',
    '',
    '',
    '',
    '',
    'Em Triagem',
    '',
    '',
    '',
  ],
];

// ─────────────────────────────────────────────────────────────────────────────
// MAPEAMENTO DE CABEÇALHOS
// Aceita cabeçalhos em português, com ou sem acento, maiúsculo/minúsculo,
// com espaço ou underline, com variações comuns de nomenclatura.
// ─────────────────────────────────────────────────────────────────────────────

type RecognizedField = keyof Omit<
  ImportStudentRow,
  'rowIndex' | 'registrationStatus' | 'missingRequiredFields' | 'rawRow' | 'hasError' | 'errorMessage'
>;

const HEADER_ALIASES: Record<string, RecognizedField> = {
  // nome
  'nome': 'name',
  'nome do aluno': 'name',
  'nome do estudante': 'name',
  'aluno': 'name',
  'estudante': 'name',
  'crianca': 'name',
  'criança': 'name',
  'paciente': 'name',
  // data de nascimento
  'data_nascimento': 'birthDate',
  'data nascimento': 'birthDate',
  'data de nascimento': 'birthDate',
  'nascimento': 'birthDate',
  'dt nascimento': 'birthDate',
  'dt_nascimento': 'birthDate',
  'data nasc': 'birthDate',
  'nasc': 'birthDate',
  // gênero
  'genero': 'gender',
  'gênero': 'gender',
  'sexo': 'gender',
  'gender': 'gender',
  // série/ano
  'serie_ano': 'grade',
  'serie/ano': 'grade',
  'série/ano': 'grade',
  'serie': 'grade',
  'série': 'grade',
  'ano': 'grade',
  'turma': 'grade',
  'ano escolar': 'grade',
  'serie escolar': 'grade',
  'grau': 'grade',
  // turno
  'turno': 'shift',
  'periodo': 'shift',
  'período': 'shift',
  // responsável
  'responsavel': 'guardianName',
  'responsável': 'guardianName',
  'nome responsavel': 'guardianName',
  'nome do responsavel': 'guardianName',
  'nome do responsável': 'guardianName',
  'familiar': 'guardianName',
  'mae': 'guardianName',
  'mãe': 'guardianName',
  'pai': 'guardianName',
  'pai ou mae': 'guardianName',
  'pai ou mãe': 'guardianName',
  // telefone
  'telefone_responsavel': 'guardianPhone',
  'telefone responsavel': 'guardianPhone',
  'telefone': 'guardianPhone',
  'tel': 'guardianPhone',
  'celular': 'guardianPhone',
  'fone': 'guardianPhone',
  'whatsapp': 'guardianPhone',
  'contato': 'guardianPhone',
  'numero': 'guardianPhone',
  'número': 'guardianPhone',
  // e-mail
  'email_responsavel': 'guardianEmail',
  'email responsavel': 'guardianEmail',
  'email': 'guardianEmail',
  'e-mail': 'guardianEmail',
  'e_mail': 'guardianEmail',
  'correio eletronico': 'guardianEmail',
  // professor regente
  'professor_regente': 'regentTeacher',
  'professor regente': 'regentTeacher',
  'professor': 'regentTeacher',
  'docente': 'regentTeacher',
  'prof regente': 'regentTeacher',
  'regente': 'regentTeacher',
  'prof': 'regentTeacher',
  // professor AEE
  'professor_aee': 'aeeTeacher',
  'professor aee': 'aeeTeacher',
  'prof aee': 'aeeTeacher',
  'aee': 'aeeTeacher',
  'profissional aee': 'aeeTeacher',
  'educador especial': 'aeeTeacher',
  // coordenação
  'coordenacao': 'coordinator',
  'coordenação': 'coordinator',
  'coordenador': 'coordinator',
  'coordenadora': 'coordinator',
  'gestor': 'coordinator',
  'gestora': 'coordinator',
  // CID
  'cid': 'cid',
  'cid-10': 'cid',
  'cid10': 'cid',
  'codigo cid': 'cid',
  'código cid': 'cid',
  'cod cid': 'cid',
  // diagnóstico
  'diagnostico': 'diagnosis',
  'diagnóstico': 'diagnosis',
  'laudo': 'diagnosis',
  'diagnostico principal': 'diagnosis',
  'diagnóstico principal': 'diagnosis',
  'condicao': 'diagnosis',
  'condição': 'diagnosis',
  // escola
  'escola': 'schoolName',
  'escola_origem': 'schoolName',
  'escola de origem': 'schoolName',
  'unidade escolar': 'schoolName',
  'nome da escola': 'schoolName',
  // nível de suporte
  'nivel_suporte': 'supportLevel',
  'nivel suporte': 'supportLevel',
  'nível de suporte': 'supportLevel',
  'nivel de suporte': 'supportLevel',
  'nivel': 'supportLevel',
  'suporte': 'supportLevel',
  'intensidade': 'supportLevel',
  // observações
  'observacoes': 'observations',
  'observações': 'observations',
  'obs': 'observations',
  'notas': 'observations',
  'anotacoes': 'observations',
  'anotações': 'observations',
  'descricao': 'observations',
  'descrição': 'observations',
  'informacoes_adicionais': 'observations',
  'informações adicionais': 'observations',
};

// ─────────────────────────────────────────────────────────────────────────────
// CAMPOS PARA CALCULAR STATUS DE REGISTRO
// ─────────────────────────────────────────────────────────────────────────────

// Para status 'complete': esses 3 campos devem estar preenchidos (além de nome)
const REQUIRED_FOR_COMPLETE: Array<{ field: RecognizedField; label: string }> = [
  { field: 'guardianName',  label: 'Responsável' },
  { field: 'guardianPhone', label: 'Telefone' },
  { field: 'grade',         label: 'Série/Ano' },
];

// Campos que, se presentes, elevam de 'pre_registered' para 'incomplete'
const IMPORTANT_FIELDS: RecognizedField[] = [
  'birthDate', 'grade', 'guardianName', 'guardianPhone', 'cid', 'diagnosis',
];

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZAÇÃO DE VALORES
// ─────────────────────────────────────────────────────────────────────────────

// Valores aceitos pelo DB: CHECK (gender = ANY (ARRAY['M','F','OTHER']))
// Converte entradas comuns para o padrão do banco.
// Valores não reconhecidos retornam '' (salvo como null) + mensagem amigável.
function normalizeGender(v: string): { value: 'M' | 'F' | 'OTHER' | ''; warning?: string } {
  const s = v.toLowerCase().trim();
  if (['f', 'fem', 'feminino', 'menina', 'female', 'mulher', 'garota'].includes(s))
    return { value: 'F' };
  if (['m', 'mas', 'masc', 'masculino', 'menino', 'male', 'homem', 'garoto'].includes(s))
    return { value: 'M' };
  if (['outro', 'other', 'outros', 'others', 'nao_binario', 'nao binario',
       'não binário', 'nao informado', 'não informado', 'nb'].includes(s))
    return { value: 'OTHER' };
  if (s)
    return {
      value: '',
      warning: `Gênero "${v.trim()}" não reconhecido — salvo como não informado. Valores aceitos: Masculino (M), Feminino (F) ou Outro.`,
    };
  return { value: '' };
}

function normalizeShift(v: string): string {
  const s = v.toLowerCase().trim().replace(/[^\w]/g, '');
  if (['m', 'man', 'manha', 'manha'].includes(s) || s.startsWith('man')) return 'Manhã';
  if (['t', 'tar', 'tarde'].includes(s) || s.startsWith('tard')) return 'Tarde';
  if (['n', 'noi', 'noite'].includes(s)) return 'Noite';
  if (['int', 'integral'].includes(s) || s.startsWith('int')) return 'Integral';
  return v.trim();
}

/** Normaliza data: DD/MM/YYYY ou DD-MM-YYYY → YYYY-MM-DD. Já no formato ISO: retorna. */
function normalizeDate(v: string): string {
  const s = v.trim();
  if (!s) return '';
  // ISO já
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // DD/MM/YYYY ou DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s; // mantém como está se não reconheceu
}

function normalizeCID(v: string): string {
  // Garante maiúsculas e remove espaços extras, mantém o formato CID (ex: F84.0)
  return v.trim().toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// CÁLCULO DO STATUS DE REGISTRO
// ─────────────────────────────────────────────────────────────────────────────

function computeRegistrationStatus(row: Partial<ImportStudentRow>): {
  status: RegistrationStatus;
  missingFields: string[];
} {
  const missingComplete = REQUIRED_FOR_COMPLETE
    .filter(({ field }) => !row[field])
    .map(({ label }) => label);

  if (missingComplete.length === 0) {
    return { status: 'complete', missingFields: [] };
  }

  // Verifica se tem pelo menos 1 campo importante preenchido → incomplete
  const hasAnyImportant = IMPORTANT_FIELDS.some(f => !!row[f]);
  if (hasAnyImportant) {
    return { status: 'incomplete', missingFields: missingComplete };
  }

  // Nada além do nome → pre_registered
  return {
    status: 'pre_registered',
    missingFields: [
      ...missingComplete,
      ...IMPORTANT_FIELDS
        .filter(f => !row[f] && !missingComplete.includes(f as string))
        .map(f => {
          const found = REQUIRED_FOR_COMPLETE.find(r => r.field === f);
          return found?.label ?? String(f);
        }),
    ].filter((v, i, a) => a.indexOf(v) === i),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER CSV
// ─────────────────────────────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos
    .replace(/[_\-]/g, ' ')          // underline/hífen → espaço
    .trim();
}

function detectSeparator(firstLine: string): ',' | ';' {
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis  = (firstLine.match(/;/g) ?? []).length;
  return semis > commas ? ';' : ',';
}

function parseLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSV(rawContent: string): ParsedCSVResult {
  // Remove BOM (UTF-8, UTF-16)
  const content = rawContent.replace(/^\uFEFF/, '').replace(/^\xFF\xFE/, '');

  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(l => l.trim().length > 0);

  if (lines.length < 2) {
    return { validRows: [], errorRows: [], totalRows: 0, unrecognizedHeaders: [], detectedSeparator: ',' };
  }

  const detectedSeparator = detectSeparator(lines[0]);
  const rawHeaders = parseLine(lines[0], detectedSeparator);

  // Mapeia cada cabeçalho para um campo reconhecido (ou null se não reconhecido)
  const fieldMap: Array<RecognizedField | null> = rawHeaders.map(h => {
    const normalized = normalizeHeader(h);
    return HEADER_ALIASES[normalized] ?? null;
  });

  const unrecognizedHeaders = rawHeaders
    .filter((_, i) => fieldMap[i] === null && rawHeaders[i].trim() !== '')
    .map(h => h.trim());

  const validRows: ImportStudentRow[] = [];
  const errorRows: ImportStudentRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i], detectedSeparator);
    const rawRow: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => {
      rawRow[h.trim()] = (cells[idx] ?? '').trim();
    });

    // Verifica se a linha está completamente vazia
    const allEmpty = Object.values(rawRow).every(v => !v);
    if (allEmpty) continue;

    // Monta objeto parcial com os campos reconhecidos
    const partial: Partial<ImportStudentRow> = { rowIndex: i, rawRow };

    fieldMap.forEach((field, idx) => {
      if (!field) return;
      const raw = (cells[idx] ?? '').trim();
      if (!raw) return;

      switch (field) {
        case 'gender': {
          const { value, warning } = normalizeGender(raw);
          if (value) (partial as any).gender = value;
          if (warning) (partial as any).genderWarning = warning;
          break;
        }
        case 'shift':     (partial as any)[field] = normalizeShift(raw); break;
        case 'birthDate': (partial as any)[field] = normalizeDate(raw); break;
        case 'cid':       (partial as any)[field] = normalizeCID(raw); break;
        default:          (partial as any)[field] = raw;
      }
    });

    const name = partial.name?.trim();

    // Linha sem nome: erro
    if (!name) {
      errorRows.push({
        ...partial,
        rowIndex: i,
        registrationStatus: 'pre_registered',
        missingRequiredFields: ['Nome'],
        rawRow,
        hasError: true,
        errorMessage: 'Coluna "nome" não encontrada ou vazia nesta linha.',
      } as ImportStudentRow);
      continue;
    }

    const { status, missingFields } = computeRegistrationStatus(partial);

    validRows.push({
      ...partial,
      name,
      rowIndex: i,
      registrationStatus: status,
      missingRequiredFields: missingFields,
      rawRow,
      hasError: false,
    } as ImportStudentRow);
  }

  return {
    validRows,
    errorRows,
    totalRows: lines.length - 1,
    unrecognizedHeaders,
    detectedSeparator,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD DE ARQUIVOS
// ─────────────────────────────────────────────────────────────────────────────

function downloadCSVFile(content: string, filename: string) {
  const BOM = '\uFEFF'; // BOM para compatibilidade com Excel no Windows
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadTemplate() {
  const header = TEMPLATE_HEADERS.join(',');
  downloadCSVFile(header + '\n', 'modelo_importacao_incluiai.csv');
}

export function downloadExample() {
  const header = TEMPLATE_HEADERS.join(',');
  const rows = TEMPLATE_EXAMPLE_ROWS.map(r =>
    r.map(cell => (cell.includes(',') || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')
  ).join('\n');
  downloadCSVFile(header + '\n' + rows + '\n', 'exemplo_preenchido_incluiai.csv');
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTÊNCIA: cria lote + alunos no Supabase
// ─────────────────────────────────────────────────────────────────────────────

export async function importStudentsBatch(
  rows: ImportStudentRow[],
  tenantId: string,
  userId: string,
  filename: string,
  onProgress?: (pct: number) => void,
): Promise<ImportBatchResult> {
  // 1. Cria o registro de lote
  const { data: batchData, error: batchErr } = await supabase
    .from('import_batches')
    .insert({
      tenant_id:      tenantId,
      created_by:     userId,
      filename:       filename || 'importacao.csv',
      import_source:  'csv',
      total_rows:     rows.length,
      status:         'processing',
    })
    .select('id')
    .single();

  if (batchErr || !batchData) {
    throw new Error(`Erro ao criar lote de importação: ${batchErr?.message ?? 'desconhecido'}`);
  }

  const batchId: string = batchData.id;
  const importedStudents: any[] = [];
  const errors: { rowIndex: number; name?: string; error: string }[] = [];
  let completeRows = 0;
  let incompleteRows = 0;
  let preRegRows = 0;

  // 2. Insere cada aluno
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    onProgress?.(Math.round(((i + 1) / rows.length) * 90));

    try {
      const payload: Record<string, any> = {
        tenant_id:               tenantId,
        created_by:              userId,
        full_name:               row.name ?? '',
        birth_date:              row.birthDate || null,
        gender:                  row.gender || null,
        school_year:             row.grade || null,
        shift:                   row.shift || null,
        guardian_name:           row.guardianName || null,
        guardian_phone:          row.guardianPhone || null,
        guardian_email:          row.guardianEmail || null,
        teacher_name:            row.regentTeacher || null,
        aee_teacher:             row.aeeTeacher || null,
        coordinator:             row.coordinator || null,
        cid_codes:               row.cid ? [row.cid] : [],
        primary_diagnosis:       row.diagnosis || null,
        school_name:             row.schoolName || null,
        support_level:           row.supportLevel || null,
        observations:            row.observations || null,
        is_active:               true,
        student_type:            'com_laudo',
        // campos de importação (schema_v24)
        import_source:           'csv',
        import_batch_id:         batchId,
        registration_status:     row.registrationStatus,
        missing_required_fields: row.missingRequiredFields,
        is_pre_registered:       row.registrationStatus !== 'complete',
      };

      const { data: studentData, error: studentErr } = await supabase
        .from('students')
        .insert(payload)
        .select('id, full_name, registration_status')
        .single();

      if (studentErr) {
        // Fallback: tenta sem colunas de importação se migration ainda não rodou
        if (studentErr.message?.includes('column') && studentErr.message?.includes('does not exist')) {
          const { import_source, import_batch_id, registration_status, missing_required_fields, is_pre_registered, ...basePayload } = payload;
          const { data: fallbackData, error: fallbackErr } = await supabase
            .from('students')
            .insert(basePayload)
            .select('id, full_name')
            .single();
          if (fallbackErr) throw fallbackErr;
          importedStudents.push(fallbackData);
        } else {
          throw studentErr;
        }
      } else {
        importedStudents.push(studentData);
      }

      if (row.registrationStatus === 'complete')        completeRows++;
      else if (row.registrationStatus === 'incomplete') incompleteRows++;
      else                                               preRegRows++;

    } catch (e: any) {
      // Traduz erros técnicos do banco para mensagens amigáveis
      let friendlyError: string = e?.message ?? String(e);
      const msg = String(e?.message ?? '').toLowerCase();
      if (msg.includes('gender') && msg.includes('check')) {
        friendlyError = `O campo gênero do aluno "${row.name}" está em formato inválido. Use: M, F ou OTHER.`;
      } else if (msg.includes('check constraint')) {
        const constraint = String(e?.message ?? '').match(/"([^"]+)"/)?.[1] ?? 'desconhecida';
        friendlyError = `Valor inválido em "${row.name}". Restrição: ${constraint}.`;
      } else if (msg.includes('violates') || msg.includes('constraint')) {
        friendlyError = `Valor inválido em "${row.name}". Verifique os campos e tente novamente.`;
      }
      errors.push({ rowIndex: row.rowIndex, name: row.name, error: friendlyError });
    }
  }

  // 3. Atualiza o lote com o resultado final
  await supabase
    .from('import_batches')
    .update({
      imported_rows:  importedStudents.length,
      error_rows:     errors.length,
      complete_rows:  completeRows,
      incomplete_rows: incompleteRows,
      pre_reg_rows:   preRegRows,
      status:         errors.length === rows.length ? 'failed' : 'completed',
    })
    .eq('id', batchId);

  onProgress?.(100);

  return {
    batchId,
    totalRows:      rows.length,
    importedRows:   importedStudents.length,
    errorRows:      errors.length,
    completeRows,
    incompleteRows,
    preRegRows,
    importedStudents,
    errors,
  };
}
