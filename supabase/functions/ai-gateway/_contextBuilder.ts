import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface CanonicalContextResult {
  data: any;
  warnings: string[];
  missingOptionalSources: string[];
}

export async function buildCanonicalContext(
  supabase: SupabaseClient,
  studentId: string,
  tenantId: string
): Promise<CanonicalContextResult> {
  const warnings: string[] = [];
  const missingOptionalSources: string[] = [];

  // ── 1. ÚNICO DADO REALMENTE CRÍTICO: o aluno ───────────────────────────────
  const studentRes = await supabase
    .from('students')
    .select('*')
    .eq('id', studentId)
    .eq('tenant_id', tenantId)
    .single();

  if (studentRes.error || !studentRes.data) {
    throw new Error(
      `CRITICAL_DATA_MISSING: Aluno não encontrado. (${studentRes.error?.message ?? 'vazio'})`
    );
  }

  // ── 2. TODOS OS DEMAIS DADOS SÃO OPCIONAIS (Promise.allSettled) ────────────
  // Se qualquer query falhar (coluna inexistente, RLS, row not found) a IA
  // continua com o que tem — nunca derruba a geração por dado secundário.
  const optionalQueries: Promise<{ sourceName: string; data: any }>[] = [
    // student_profiles: pode não existir ainda para alunos recém-cadastrados
    supabase
      .from('student_profiles')
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) throw new Error(`[student_profiles] ${error.message}`);
        return { sourceName: 'student_profiles', data };
      }),

    // tenant_appointments: usa created_at (appointment_date pode não existir)
    supabase
      .from('tenant_appointments')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(15)
      .then(({ data, error }) => {
        if (error) throw new Error(`[tenant_appointments] ${error.message}`);
        return { sourceName: 'tenant_appointments', data: data ?? [] };
      }),

    // student_timeline
    supabase
      .from('student_timeline')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (error) throw new Error(`[student_timeline] ${error.message}`);
        return { sourceName: 'student_timeline', data: data ?? [] };
      }),

    // observation_forms
    supabase
      .from('observation_forms')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (error) throw new Error(`[observation_forms] ${error.message}`);
        return { sourceName: 'observation_forms', data: data ?? [] };
      }),

    // medical_reports
    supabase
      .from('medical_reports')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (error) throw new Error(`[medical_reports] ${error.message}`);
        return { sourceName: 'medical_reports', data: data ?? [] };
      }),
  ];

  const results = await Promise.allSettled(optionalQueries);

  const extract = (res: PromiseSettledResult<{ sourceName: string; data: any }>, fallback: any) => {
    if (res.status === 'fulfilled') return res.value.data ?? fallback;
    const errMsg = res.reason instanceof Error ? res.reason.message : String(res.reason);
    warnings.push(`Fonte opcional indisponível: ${errMsg}`);
    const match = errMsg.match(/^\[(.*?)\]/);
    if (match?.[1]) missingOptionalSources.push(match[1]);
    return fallback;
  };

  const profile          = extract(results[0], null);
  const appointments     = extract(results[1], []);
  const timeline         = extract(results[2], []);
  const observationForms = extract(results[3], []);
  const medicalReports   = extract(results[4], []);

  const mergedData = {
    student:    studentRes.data,
    profile,
    history: {
      tenant_appointments: appointments,
      student_timeline:    timeline,
      observation_forms:   observationForms,
      medical_reports:     medicalReports,
    },
  };

  return { data: mergedData, warnings, missingOptionalSources };
}
