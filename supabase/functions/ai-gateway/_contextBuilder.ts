import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface CanonicalContextResult {
  data: CanonicalData;
  warnings: string[];
  missingOptionalSources: string[];
}

export interface CanonicalData {
  student: any;
  profile: any | null;
  history: {
    tenant_appointments: any[];
    student_timeline: any[];
    observation_forms: any[];
    medical_reports: any[];
  };
  // Sprint IA-9 — fontes adicionais (paridade com frontend)
  attached_documents: any[];
  saved_documents: any[];
  saved_action_plans: any[];
  saved_aee_action_plans: any[];
  saved_intelligent_profile: any | null;
  generated_activities: any[];
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
    .eq('tenant_id', tenantId)  // garante isolamento de tenant
    .single();

  if (studentRes.error || !studentRes.data) {
    throw new Error(
      `CRITICAL_DATA_MISSING: Aluno não encontrado no tenant. (${studentRes.error?.message ?? 'vazio'})`
    );
  }

  // ── 2. TODOS OS DEMAIS DADOS SÃO OPCIONAIS (Promise.allSettled) ────────────
  type OptResult = { sourceName: string; data: any };

  const optionalQueries: Promise<OptResult>[] = [
    // student_profiles: pode não existir ainda para alunos recém-cadastrados
    supabase
      .from('student_profiles')
      .select('*')
      .eq('student_id', studentId)
      .order('evaluated_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (error) throw new Error(`[student_profiles] ${error.message}`);
        return { sourceName: 'student_profiles', data: data ?? [] };
      }),

    // tenant_appointments
    supabase
      .from('tenant_appointments')
      .select('*')
      .eq('student_id', studentId)
      .order('date', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) throw new Error(`[tenant_appointments] ${error.message}`);
        return { sourceName: 'tenant_appointments', data: data ?? [] };
      }),

    // student_timeline
    supabase
      .from('student_timeline')
      .select('*')
      .eq('student_id', studentId)
      .order('event_date', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) throw new Error(`[student_timeline] ${error.message}`);
        return { sourceName: 'student_timeline', data: data ?? [] };
      }),

    // observation_forms — apenas finalizados
    supabase
      .from('observation_forms')
      .select('*')
      .eq('student_id', studentId)
      .eq('status', 'finalizado')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (error) throw new Error(`[observation_forms] ${error.message}`);
        return { sourceName: 'observation_forms', data: data ?? [] };
      }),

    // medical_reports
    supabase
      .from('medical_reports')
      .select('id, report_type, synthesis, pedagogical_points, suggestions, raw_content')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (error) throw new Error(`[medical_reports] ${error.message}`);
        return { sourceName: 'medical_reports', data: data ?? [] };
      }),

    // student_documents (laudos subidos — metadados + notes)
    supabase
      .from('student_documents')
      .select('name, document_type, created_at, notes')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) throw new Error(`[student_documents] ${error.message}`);
        return { sourceName: 'student_documents', data: data ?? [] };
      }),

    // documents — PEI, PAEE, PDI, Estudo de Caso etc. gerados e salvos
    supabase
      .from('documents')
      .select('id, doc_type, title, status, structured_data, audit_code, created_at, updated_at')
      .eq('student_id', studentId)
      .is('deleted_at', null)
      .in('status', ['APPROVED', 'DRAFT', 'approved', 'draft'])
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) throw new Error(`[documents] ${error.message}`);
        return { sourceName: 'documents', data: data ?? [] };
      }),

    // student_action_plans — Planos do Professor Regente
    supabase
      .from('student_action_plans')
      .select('id, plan_type, title, summary, content_json, register_code, version_number, created_at')
      .eq('student_id', studentId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data, error }) => {
        if (error) throw new Error(`[student_action_plans] ${error.message}`);
        return { sourceName: 'student_action_plans', data: data ?? [] };
      }),

    // student_aee_action_plans — Planos AEE salvos
    supabase
      .from('student_aee_action_plans')
      .select('id, plan_type, title, content_json, register_code, version_number, created_at')
      .eq('student_id', studentId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data, error }) => {
        if (error) throw new Error(`[student_aee_action_plans] ${error.message}`);
        return { sourceName: 'student_aee_action_plans', data: data ?? [] };
      }),

    // student_intelligent_profiles — Perfil Inteligente
    supabase
      .from('student_intelligent_profiles')
      .select('id, version_number, profile_json, created_at')
      .eq('student_id', studentId)
      .order('version_number', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) throw new Error(`[student_intelligent_profiles] ${error.message}`);
        return { sourceName: 'student_intelligent_profiles', data: data ?? [] };
      }),

    // generated_activities — atividades geradas para o aluno
    supabase
      .from('generated_activities')
      .select('id, title, discipline, grade, created_at, content, content_json, bncc_codes, difficulty_level, is_adapted, mode')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (error) throw new Error(`[generated_activities] ${error.message}`);
        return { sourceName: 'generated_activities', data: data ?? [] };
      }),
  ];

  const results = await Promise.allSettled(optionalQueries);

  const extract = (res: PromiseSettledResult<OptResult>, fallback: any) => {
    if (res.status === 'fulfilled') return res.value.data ?? fallback;
    const errMsg = res.reason instanceof Error ? res.reason.message : String(res.reason);
    warnings.push(`Fonte opcional indisponível: ${errMsg}`);
    const match = errMsg.match(/^\[(.*?)\]/);
    if (match?.[1]) missingOptionalSources.push(match[1]);
    return fallback;
  };

  const profiles           = extract(results[0], []);
  const appointments       = extract(results[1], []);
  const timeline           = extract(results[2], []);
  const observationForms   = extract(results[3], []);
  const medicalReports     = extract(results[4], []);
  const attachedDocuments  = extract(results[5], []);
  const savedDocuments     = extract(results[6], []);
  const actionPlans        = extract(results[7], []);
  const aeeActionPlans     = extract(results[8], []);
  const intelligentProfileArr = extract(results[9], []);
  const generatedActivities   = extract(results[10], []);

  // Student profile: usa o mais recente
  const profile = profiles.length > 0 ? profiles[0] : null;

  // Intelligent profile: usa o mais recente se existir
  const savedIntelligentProfile = intelligentProfileArr.length > 0
    ? intelligentProfileArr[0]
    : null;

  const data: CanonicalData = {
    student: studentRes.data,
    profile,
    history: {
      tenant_appointments: appointments,
      student_timeline:    timeline,
      observation_forms:   observationForms,
      medical_reports:     medicalReports,
    },
    attached_documents:        attachedDocuments,
    saved_documents:           savedDocuments,
    saved_action_plans:        actionPlans,
    saved_aee_action_plans:    aeeActionPlans,
    saved_intelligent_profile: savedIntelligentProfile,
    generated_activities:      generatedActivities,
  };

  return { data, warnings, missingOptionalSources };
}
