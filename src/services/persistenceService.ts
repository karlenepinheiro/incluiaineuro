/**
 * persistenceService.ts
 * Operações de persistência para tabelas Sprint 2 e posteriores:
 *   tenant_appointments, student_timeline, student_documents,
 *   medical_reports, observation_forms, generated_activities,
 *   student_profiles, ai_requests, ai_outputs, service_records
 */
import { supabase } from './supabase';
import { Appointment, ServiceRecord } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getTenantIdForUser(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', userId)
    .single();
  if (error) throw error;
  if (!data?.tenant_id) throw new Error('Tenant não encontrado.');
  return data.tenant_id as string;
}

// ---------------------------------------------------------------------------
// AGENDA — tenant_appointments
// ---------------------------------------------------------------------------
export const AppointmentService = {
  /** Mapeia Appointment (UI) → linha do banco */
  toRow(apt: Appointment, tenantId: string, userId: string) {
    return {
      id:               apt.id,
      tenant_id:        tenantId,
      user_id:          userId,
      student_id:       apt.studentId || null,
      student_name:     apt.studentName || null,
      title:            apt.title,
      appointment_date: apt.date,
      appointment_time: apt.time || null,
      duration:         apt.duration ?? 50,
      type:             apt.type ?? 'AEE',
      professional:     apt.professional || null,
      location:         apt.location || null,
      notes:            apt.notes || null,
      status:           apt.status ?? 'agendado',
      updated_at:       new Date().toISOString(),
    };
  },

  /** Mapeia linha do banco → Appointment (UI) */
  fromRow(row: any): Appointment {
    return {
      id:           row.id,
      title:        row.title,
      date:         row.appointment_date,
      time:         row.appointment_time ?? '08:00',
      duration:     row.duration ?? 50,
      type:         row.type ?? 'AEE',
      professional: row.professional ?? '',
      location:     row.location ?? undefined,
      notes:        row.notes ?? undefined,
      status:       row.status ?? 'agendado',
      studentId:    row.student_id ?? undefined,
      studentName:  row.student_name ?? undefined,
      createdAt:    row.created_at,
    };
  },

  async getAll(userId: string): Promise<Appointment[]> {
    try {
      const tenantId = await getTenantIdForUser(userId);
      const { data, error } = await supabase
        .from('tenant_appointments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('appointment_date', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(this.fromRow);
    } catch (e) {
      console.error('[AppointmentService.getAll]', e);
      return [];
    }
  },

  async save(apt: Appointment, userId: string): Promise<Appointment | null> {
    try {
      const tenantId = await getTenantIdForUser(userId);
      const row = this.toRow(apt, tenantId, userId);
      const { data, error } = await supabase
        .from('tenant_appointments')
        .upsert(row)
        .select()
        .single();
      if (error) throw error;

      // Timeline: agendamento criado
      if (apt.studentId) {
        await TimelineService.add({
          tenantId,
          studentId: apt.studentId,
          eventType: 'atendimento',
          title: `Agendamento: ${apt.title}`,
          description: `${apt.type} — ${apt.date} ${apt.time ?? ''} — ${apt.professional ?? ''}`,
          linkedId: data.id,
          linkedTable: 'tenant_appointments',
          icon: 'Calendar',
          author: apt.professional ?? userId,
        });
      }

      return this.fromRow(data);
    } catch (e) {
      console.error('[AppointmentService.save]', e);
      return null;
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('tenant_appointments')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[AppointmentService.delete]', e);
      return false;
    }
  },
};

// ---------------------------------------------------------------------------
// TIMELINE — student_timeline
// ---------------------------------------------------------------------------
export const TimelineService = {
  async add(params: {
    tenantId:    string;
    studentId:   string;
    eventType:   string;
    title:       string;
    description?: string;
    linkedId?:   string;
    linkedTable?: string;
    icon?:       string;
    author?:     string;
    eventDate?:  string; // YYYY-MM-DD (default today)
  }): Promise<void> {
    try {
      const { error } = await supabase.from('student_timeline').insert({
        tenant_id:    params.tenantId,
        student_id:   params.studentId,
        event_type:   params.eventType,
        title:        params.title,
        description:  params.description ?? null,
        linked_id:    params.linkedId ?? null,
        linked_table: params.linkedTable ?? null,
        icon:         params.icon ?? null,
        author:       params.author ?? null,
        event_date:   params.eventDate ?? new Date().toISOString().split('T')[0],
      });
      if (error) console.warn('[TimelineService.add] erro (não crítico):', error.message);
    } catch (e) {
      console.warn('[TimelineService.add] erro (não crítico):', e);
    }
  },

  async getForStudent(studentId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('student_timeline')
        .select('*')
        .eq('student_id', studentId)
        .order('event_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch (e) {
      console.error('[TimelineService.getForStudent]', e);
      return [];
    }
  },
};

// ---------------------------------------------------------------------------
// DOCUMENTOS DO ALUNO — student_documents
// ---------------------------------------------------------------------------
export const StudentDocumentService = {
  async save(params: {
    tenantId:     string;
    studentId:    string;
    name:         string;
    documentType: string;
    fileUrl?:     string;
    filePath?:    string;
    fileSize?:    number;
    mimeType?:    string;
    uploadedBy?:  string;
    notes?:       string;
  }): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('student_documents')
        .insert({
          tenant_id:     params.tenantId,
          student_id:    params.studentId,
          name:          params.name,
          document_type: params.documentType,
          file_url:      params.fileUrl ?? null,
          file_path:     params.filePath ?? null,
          file_size:     params.fileSize ?? null,
          mime_type:     params.mimeType ?? null,
          uploaded_by:   params.uploadedBy ?? null,
          notes:         params.notes ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data?.id ?? null;
    } catch (e) {
      console.error('[StudentDocumentService.save]', e);
      return null;
    }
  },

  async getForStudent(studentId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('student_documents')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch (e) {
      console.error('[StudentDocumentService.getForStudent]', e);
      return [];
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('student_documents')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[StudentDocumentService.delete]', e);
      return false;
    }
  },
};

// ---------------------------------------------------------------------------
// LAUDOS / ANÁLISE IA — medical_reports
// ---------------------------------------------------------------------------
export const MedicalReportService = {
  async getForStudent(studentId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('medical_reports')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch (e) {
      console.error('[MedicalReportService.getForStudent]', e);
      return [];
    }
  },

  async save(params: {
    tenantId:          string;
    studentId:         string;
    documentId?:       string;
    reportType?:       string;
    synthesis?:        string;
    pedagogicalPoints?: string[];
    suggestions?:      string[];
    rawContent?:       string;
    auditCode?:        string;
  }): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('medical_reports')
        .insert({
          tenant_id:          params.tenantId,
          student_id:         params.studentId,
          document_id:        params.documentId ?? null,
          report_type:        params.reportType ?? 'multidisciplinar',
          synthesis:          params.synthesis ?? null,
          pedagogical_points: params.pedagogicalPoints ?? [],
          suggestions:        params.suggestions ?? [],
          raw_content:        params.rawContent ?? null,
          analyzed_by_ai:     true,
          audit_code:         params.auditCode ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data?.id ?? null;
    } catch (e) {
      console.error('[MedicalReportService.save]', e);
      return null;
    }
  },
};

// ---------------------------------------------------------------------------
// FICHAS DE OBSERVAÇÃO — observation_forms
// ---------------------------------------------------------------------------
export const ObservationFormService = {
  async save(params: {
    tenantId:   string;
    studentId:  string;
    userId:     string;
    formType:   string;
    title:      string;
    fieldsData: Record<string, any>;
    auditCode?: string;
    createdBy?: string;
    status?:    'rascunho' | 'finalizado';
  }): Promise<string | null> {
    const { data, error } = await supabase
      .from('observation_forms')
      .insert({
        tenant_id:    params.tenantId,
        student_id:   params.studentId,
        user_id:      params.userId,
        form_type:    params.formType,
        title:        params.title,
        status:       params.status ?? 'finalizado',
        fields_data:  params.fieldsData,
        audit_code:   params.auditCode ?? null,
        created_by:   params.createdBy ?? null,
      })
      .select('id')
      .single();
    if (error) {
      console.error('[ObservationFormService.save]', error);
      throw new Error(error.message);
    }
    return data?.id ?? null;
  },

  async getForStudent(studentId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('observation_forms')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch (e) {
      console.error('[ObservationFormService.getForStudent]', e);
      return [];
    }
  },
};

// ---------------------------------------------------------------------------
// PERFIL COGNITIVO — student_profiles
// ---------------------------------------------------------------------------
export const StudentProfileService = {
  /** Retorna todos os perfis cognitivos de um aluno, do mais recente ao mais antigo */
  async getForStudent(studentId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('student_id', studentId)
        .order('evaluated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch (e) {
      console.error('[StudentProfileService.getForStudent]', e);
      return [];
    }
  },

  /**
   * Salva uma avaliação de perfil cognitivo (10 dimensões escala 1-5)
   * scores[0..9] mapeiam para: comunicacao_expressiva, interacao_social,
   * autonomia_avd, autorregulacao, atencao_sustentada, compreensao,
   * motricidade_fina, motricidade_grossa, participacao, linguagem_leitura
   */
  async save(params: {
    tenantId:    string;
    studentId:   string;
    scores:      number[]; // array de 10 valores (1-5)
    observation?: string;
    evaluatedBy?: string;
  }): Promise<string | null> {
    const [
      comunicacao_expressiva, interacao_social, autonomia_avd,
      autorregulacao, atencao_sustentada, compreensao,
      motricidade_fina, motricidade_grossa, participacao, linguagem_leitura,
    ] = params.scores.map(v => Math.min(5, Math.max(1, v)));

    try {
      const { data, error } = await supabase
        .from('student_profiles')
        .insert({
          tenant_id:              params.tenantId,
          student_id:             params.studentId,
          comunicacao_expressiva,
          interacao_social,
          autonomia_avd,
          autorregulacao,
          atencao_sustentada,
          compreensao,
          motricidade_fina,
          motricidade_grossa,
          participacao,
          linguagem_leitura,
          observation:   params.observation ?? null,
          evaluated_by:  params.evaluatedBy ?? null,
          evaluated_at:  new Date().toISOString().split('T')[0],
        })
        .select('id')
        .single();
      if (error) throw error;
      return data?.id ?? null;
    } catch (e) {
      console.error('[StudentProfileService.save]', e);
      return null;
    }
  },
};

// ---------------------------------------------------------------------------
// ATIVIDADES GERADAS — generated_activities
// ---------------------------------------------------------------------------
export const GeneratedActivityService = {
  async save(params: {
    tenantId:    string;
    userId:      string;
    studentId?:  string;
    title:       string;
    content?:    string;
    imageUrl?:   string;
    bnccCodes?:  string[];
    discipline?: string;
    guidance?:   string;
    tags?:       string[];
    isAdapted?:  boolean;
    creditsUsed?: number;
  }): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('generated_activities')
        .insert({
          tenant_id:   params.tenantId,
          user_id:     params.userId,
          student_id:  params.studentId ?? null,
          title:       params.title,
          content:     params.content ? params.content.slice(0, 10000) : null,
          image_url:   params.imageUrl ?? null,
          bncc_codes:  params.bnccCodes ?? [],
          discipline:  params.discipline ?? null,
          guidance:    params.guidance ?? null,
          tags:        params.tags ?? [],
          is_adapted:  params.isAdapted ?? false,
          credits_used: params.creditsUsed ?? 0,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data?.id ?? null;
    } catch (e) {
      console.error('[GeneratedActivityService.save]', e);
      return null;
    }
  },

  async getForTenant(userId: string): Promise<any[]> {
    try {
      const tenantId = await getTenantIdForUser(userId);
      const { data, error } = await supabase
        .from('generated_activities')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    } catch (e) {
      console.error('[GeneratedActivityService.getForTenant]', e);
      return [];
    }
  },

  /** Carrega atividades geradas vinculadas a um aluno específico */
  async getForStudent(studentId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('generated_activities')
        .select('id, title, content, image_url, bncc_codes, discipline, guidance, tags, credits_used, model_used, output_type, is_adapted, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    } catch (e) {
      console.error('[GeneratedActivityService.getForStudent]', e);
      return [];
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('generated_activities')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[GeneratedActivityService.delete]', e);
      return false;
    }
  },
};

// ---------------------------------------------------------------------------
// AUDITORIA DE IA — ai_requests + ai_outputs
// ---------------------------------------------------------------------------
export const AiAuditService = {
  async logRequest(params: {
    tenantId:        string;
    userId:          string;
    requestType:     string;
    model?:          string;
    creditsConsumed?: number;
    inputData?:      Record<string, any>;
  }): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('ai_requests')
        .insert({
          tenant_id:        params.tenantId,
          user_id:          params.userId,
          request_type:     params.requestType,
          model:            params.model ?? 'gemini-1.5-flash',
          credits_consumed: params.creditsConsumed ?? 1,
          input_data:       params.inputData ?? {},
          status:           'pending',
        })
        .select('id')
        .single();
      if (error) throw error;
      return data?.id ?? null;
    } catch (e) {
      console.warn('[AiAuditService.logRequest] erro (não crítico):', e);
      return null;
    }
  },

  async completeRequest(requestId: string, params: {
    status:    'success' | 'failed';
    latencyMs?: number;
    outputType?: string;
    content?:  string;
    fileUrl?:  string;
  }): Promise<void> {
    try {
      await supabase
        .from('ai_requests')
        .update({
          status:       params.status,
          latency_ms:   params.latencyMs ?? null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (params.content || params.fileUrl) {
        await supabase.from('ai_outputs').insert({
          request_id:  requestId,
          output_type: params.outputType ?? 'text',
          content:     params.content ? params.content.slice(0, 20000) : null,
          file_url:    params.fileUrl ?? null,
        });
      }
    } catch (e) {
      console.warn('[AiAuditService.completeRequest] erro (não crítico):', e);
    }
  },
};

// ---------------------------------------------------------------------------
// CONTROLE DE ATENDIMENTOS — service_records
// ---------------------------------------------------------------------------
export const ServiceRecordService = {
  toRow(rec: ServiceRecord, tenantId: string) {
    return {
      id:              rec.id,
      tenant_id:       tenantId,
      student_id:      rec.studentId,
      student_name:    rec.studentName,
      date:            rec.date,
      type:            rec.type,
      professional:    rec.professional,
      duration:        rec.duration,
      observation:     rec.observation,
      attendance:      rec.attendance,
      daily_checklist: rec.dailyChecklist ? JSON.stringify(rec.dailyChecklist) : null,
    };
  },

  fromRow(row: any): ServiceRecord {
    let dailyChecklist: ServiceRecord['dailyChecklist'] | undefined;
    if (row.daily_checklist) {
      try { dailyChecklist = typeof row.daily_checklist === 'string' ? JSON.parse(row.daily_checklist) : row.daily_checklist; }
      catch { dailyChecklist = undefined; }
    }
    return {
      id:             row.id,
      studentId:      row.student_id,
      studentName:    row.student_name,
      date:           row.date,
      type:           row.type,
      professional:   row.professional,
      duration:       row.duration,
      observation:    row.observation ?? '',
      attendance:     row.attendance,
      dailyChecklist,
    };
  },

  /** Lista todos os atendimentos do tenant ordenados por data desc */
  async list(tenantId: string): Promise<ServiceRecord[]> {
    const { data, error } = await supabase
      .from('service_records')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('date', { ascending: false });
    if (error) {
      console.warn('[ServiceRecordService.list]', error.message);
      return [];
    }
    return (data ?? []).map(ServiceRecordService.fromRow);
  },

  /** Cria ou atualiza um atendimento (upsert por id) e emite evento na timeline */
  async save(rec: ServiceRecord, tenantId: string): Promise<void> {
    const row = ServiceRecordService.toRow(rec, tenantId);
    const { error } = await supabase
      .from('service_records')
      .upsert(row, { onConflict: 'id' });
    if (error) throw error;

    // Emite evento na timeline do aluno para alimentar o histórico evolutivo
    if (rec.studentId && rec.attendance === 'Presente') {
      const checklistDesc = rec.dailyChecklist
        ? `Desempenho: ${rec.dailyChecklist.desempenho}/5 · Interação: ${rec.dailyChecklist.interacao}/5 · ${rec.dailyChecklist.comportamento === 'adequado' ? 'Comportamento adequado' : rec.dailyChecklist.comportamento === 'regular' ? 'Comportamento regular' : 'Necessita suporte'}`
        : '';
      await TimelineService.add({
        tenantId,
        studentId:   rec.studentId,
        eventType:   'atendimento',
        title:       `Atendimento ${rec.type} — ${rec.attendance}`,
        description: [rec.observation, checklistDesc].filter(Boolean).join(' · ').slice(0, 250),
        linkedId:    rec.id,
        linkedTable: 'service_records',
        icon:        'Calendar',
        author:      rec.professional,
      }).catch(() => { /* timeline é não-crítica */ });
    }
  },

  /** Remove um atendimento */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('service_records')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};

// ---------------------------------------------------------------------------
// WORKFLOW ATIVIA — workflows + workflow_nodes
// Persiste layout e configuração do WorkflowCanvas no banco.
// ---------------------------------------------------------------------------

/** Campos serializáveis do WorkflowState (sem File, sem callbacks, sem results) */
export interface WorkflowSerializableState {
  prompt:          string;
  discipline:      string;
  grade:           string;
  bnccCode:        string;
  bnccDescription: string;
  model:           string;
  imageCount:      number;
  pageSize:        string;
  borders:         boolean;
  schoolId:        string;
  adaptationType:  string;
  adaptarInputText: string;
  templateType:    string;
}

export interface WorkflowSaveData {
  workflowId:   string;
  nodesData:    Array<{ id: string; type: string; position: { x: number; y: number } }>;
  edgesData:    Array<{ id: string; source: string; target: string; type: string }>;
  wfState:      WorkflowSerializableState;
}

export const WorkflowService = {
  /**
   * Carrega o último workflow ativaIA do usuário, ou cria um novo rascunho.
   * Retorna null se não houver nada salvo (usar defaults).
   */
  async loadOrCreate(
    userId: string,
    tenantId: string
  ): Promise<{ workflowId: string; data: WorkflowSaveData | null }> {
    const { data: existing } = await supabase
      .from('workflows')
      .select('id, nodes_data, edges_data, description')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('workflow_type', 'ativaIA')
      .eq('is_template', false)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      let wfState: WorkflowSerializableState | null = null;
      try { wfState = JSON.parse(existing.description ?? '{}'); } catch { /* ignore */ }

      const nodesData = Array.isArray(existing.nodes_data) ? existing.nodes_data : [];
      const edgesData = Array.isArray(existing.edges_data) ? existing.edges_data : [];

      if (nodesData.length > 0) {
        return {
          workflowId: existing.id,
          data: { workflowId: existing.id, nodesData, edgesData, wfState: wfState! },
        };
      }
      // Exists in DB but has no nodes yet — return empty data
      return { workflowId: existing.id, data: null };
    }

    // Cria novo rascunho
    const { data: created, error } = await supabase
      .from('workflows')
      .insert({
        tenant_id:     tenantId,
        user_id:       userId,
        name:          'Workflow AtivaIA',
        workflow_type: 'ativaIA',
        status:        'draft',
        nodes_data:    [],
        edges_data:    [],
      })
      .select('id')
      .single();

    if (error) throw error;
    return { workflowId: created.id, data: null };
  },

  /**
   * Salva (upsert) o estado atual do canvas.
   * Chamado de forma debounced pelo InnerCanvas.
   */
  async save(workflowId: string, saveData: Omit<WorkflowSaveData, 'workflowId'>): Promise<void> {
    const { nodesData, edgesData, wfState } = saveData;

    const { error } = await supabase
      .from('workflows')
      .update({
        nodes_data:  nodesData,
        edges_data:  edgesData,
        description: JSON.stringify(wfState),
        status:      'draft',
        updated_at:  new Date().toISOString(),
      })
      .eq('id', workflowId);

    if (error) {
      console.error('[WorkflowService.save] erro:', error.message);
      throw error;
    }
  },
};
