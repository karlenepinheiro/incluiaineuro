/**
 * studentContextService.ts
 *
 * Monta o contexto consolidado de um aluno a partir de todas as fontes do banco:
 *   - student_profiles   → perfis cognitivos (10 dimensões)
 *   - observation_forms  → fichas de observação preenchidas
 *   - medical_reports    → análises de laudos pela IA
 *   - student_documents  → metadados de documentos anexados
 *
 * O contexto é passado para a IA como bloco de texto adicional no prompt,
 * tornando os documentos gerados (especialmente o Estudo de Caso) muito
 * mais ricos e específicos para o aluno.
 */

import { supabase } from './supabase';

// ── Tipos do contexto ────────────────────────────────────────────────────────

export interface CognitiveProfileEntry {
  date:        string;
  scores:      number[]; // 10 dimensões, escala 1-5
  observation: string;
  evaluatedBy: string;
}

export interface ObservationFormEntry {
  title:      string;
  formType:   string;
  fieldsData: Record<string, any>;
  createdAt:  string;
  createdBy:  string;
  auditCode?: string;
}

export interface MedicalReportEntry {
  reportType:         string;
  synthesis:          string;
  pedagogicalPoints:  string[];
  suggestions:        string[];
  documentName?:      string;
}

export interface AttachedDocumentEntry {
  name:         string;
  documentType: string;
  uploadedAt:   string;
}

export interface StudentContext {
  studentId:          string;
  cognitiveProfiles:  CognitiveProfileEntry[];
  observationForms:   ObservationFormEntry[];
  medicalReports:     MedicalReportEntry[];
  attachedDocuments:  AttachedDocumentEntry[];
  loadedAt:           string;
}

// Dimensões do perfil cognitivo (mesma ordem do banco)
const COGNITIVE_DIMENSIONS = [
  'Comunicação Expressiva', 'Interação Social', 'Autonomia (AVD)',
  'Autorregulação', 'Atenção Sustentada', 'Compreensão',
  'Motricidade Fina', 'Motricidade Grossa', 'Participação', 'Linguagem/Leitura',
];

// ── Service ──────────────────────────────────────────────────────────────────

export const StudentContextService = {
  /**
   * Carrega todas as fontes de dados do aluno no banco e retorna contexto consolidado.
   * Falhas individuais são tratadas silenciosamente (não quebram o fluxo).
   */
  async buildContext(studentId: string): Promise<StudentContext> {
    const [profiles, obsForms, medReports, docs] = await Promise.allSettled([
      supabase
        .from('student_profiles')
        .select('*')
        .eq('student_id', studentId)
        .order('evaluated_at', { ascending: false })
        .limit(5),

      supabase
        .from('observation_forms')
        .select('*')
        .eq('student_id', studentId)
        .eq('status', 'finalizado')
        .order('created_at', { ascending: false })
        .limit(10),

      supabase
        .from('medical_reports')
        .select('id, report_type, synthesis, pedagogical_points, suggestions, raw_content, document_id')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(5),

      supabase
        .from('student_documents')
        .select('name, document_type, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    // Perfis cognitivos
    const cognitiveProfiles: CognitiveProfileEntry[] = [];
    if (profiles.status === 'fulfilled' && !profiles.value.error) {
      for (const p of profiles.value.data ?? []) {
        cognitiveProfiles.push({
          date:        p.evaluated_at ?? '',
          scores: [
            p.comunicacao_expressiva ?? 1, p.interacao_social    ?? 1,
            p.autonomia_avd          ?? 1, p.autorregulacao      ?? 1,
            p.atencao_sustentada     ?? 1, p.compreensao         ?? 1,
            p.motricidade_fina       ?? 1, p.motricidade_grossa  ?? 1,
            p.participacao           ?? 1, p.linguagem_leitura   ?? 1,
          ],
          observation: p.observation ?? '',
          evaluatedBy: p.evaluated_by ?? '',
        });
      }
    }

    // Fichas de observação
    const observationForms: ObservationFormEntry[] = [];
    if (obsForms.status === 'fulfilled' && !obsForms.value.error) {
      for (const f of obsForms.value.data ?? []) {
        observationForms.push({
          title:      f.title,
          formType:   f.form_type,
          fieldsData: (typeof f.fields_data === 'object' ? f.fields_data : {}) ?? {},
          createdAt:  f.created_at ?? '',
          createdBy:  f.created_by ?? '',
          auditCode:  f.audit_code ?? '',
        });
      }
    }

    // Laudos analisados pela IA
    const medicalReports: MedicalReportEntry[] = [];
    if (medReports.status === 'fulfilled' && !medReports.value.error) {
      for (const r of medReports.value.data ?? []) {
        medicalReports.push({
          reportType:        r.report_type ?? 'multidisciplinar',
          synthesis:         r.synthesis   ?? '',
          pedagogicalPoints: Array.isArray(r.pedagogical_points) ? r.pedagogical_points : [],
          suggestions:       Array.isArray(r.suggestions)        ? r.suggestions        : [],
          documentName:      r.raw_content ?? undefined,
        });
      }
    }

    // Documentos anexados (apenas metadados — nome e tipo)
    const attachedDocuments: AttachedDocumentEntry[] = [];
    if (docs.status === 'fulfilled' && !docs.value.error) {
      for (const d of docs.value.data ?? []) {
        attachedDocuments.push({
          name:         d.name,
          documentType: d.document_type ?? 'Laudo',
          uploadedAt:   d.created_at    ?? '',
        });
      }
    }

    return { studentId, cognitiveProfiles, observationForms, medicalReports, attachedDocuments, loadedAt: new Date().toISOString() };
  },

  /**
   * Verifica se o contexto tem dados relevantes (para decidir se vale incluir no prompt).
   */
  hasData(ctx: StudentContext): boolean {
    return (
      ctx.cognitiveProfiles.length > 0 ||
      ctx.observationForms.length   > 0 ||
      ctx.medicalReports.length     > 0 ||
      ctx.attachedDocuments.length  > 0
    );
  },

  /**
   * Converte o contexto em bloco de texto legível para a IA.
   * Formatado para ser inserido no prompt de geração de documentos.
   */
  toPromptText(ctx: StudentContext): string {
    if (!StudentContextService.hasData(ctx)) return '';

    const lines: string[] = [
      '===== CONTEXTO CONSOLIDADO DO ALUNO (dados reais do sistema) =====',
    ];

    // ── Perfis cognitivos ────────────────────────────────────────────────────
    if (ctx.cognitiveProfiles.length > 0) {
      lines.push('\n--- PERFIL COGNITIVO (avaliações registradas) ---');
      for (const p of ctx.cognitiveProfiles) {
        const avg = (p.scores.reduce((a, b) => a + b, 0) / p.scores.length).toFixed(1);
        lines.push(`Avaliação de ${p.date} | Avaliado por: ${p.evaluatedBy || 'Profissional'} | Média geral: ${avg}/5`);
        p.scores.forEach((s, i) => {
          lines.push(`  • ${COGNITIVE_DIMENSIONS[i]}: ${s}/5`);
        });
        if (p.observation) lines.push(`  Observação: ${p.observation}`);
      }
    }

    // ── Fichas de observação ─────────────────────────────────────────────────
    if (ctx.observationForms.length > 0) {
      lines.push('\n--- FICHAS DE OBSERVAÇÃO PREENCHIDAS ---');
      for (const f of ctx.observationForms) {
        lines.push(`${f.title} (${f.formType}) — ${new Date(f.createdAt).toLocaleDateString('pt-BR')} | por ${f.createdBy}`);
        const fd = f.fieldsData;
        for (const [key, val] of Object.entries(fd)) {
          if (val && String(val).trim()) {
            lines.push(`  • ${key}: ${String(val).slice(0, 300)}`);
          }
        }
      }
    }

    // ── Análises de laudos pela IA ────────────────────────────────────────────
    if (ctx.medicalReports.length > 0) {
      lines.push('\n--- ANÁLISES DE LAUDOS E RELATÓRIOS (por IA) ---');
      for (const r of ctx.medicalReports) {
        if (r.documentName) lines.push(`Documento: ${r.documentName}`);
        if (r.synthesis)    lines.push(`  Síntese: ${r.synthesis.slice(0, 500)}`);
        if (r.pedagogicalPoints.length > 0) {
          lines.push('  Pontos pedagógicos:');
          r.pedagogicalPoints.slice(0, 5).forEach(p => lines.push(`    - ${p}`));
        }
        if (r.suggestions.length > 0) {
          lines.push('  Sugestões de intervenção:');
          r.suggestions.slice(0, 5).forEach(s => lines.push(`    - ${s}`));
        }
      }
    }

    // ── Documentos anexados ──────────────────────────────────────────────────
    if (ctx.attachedDocuments.length > 0) {
      lines.push('\n--- DOCUMENTOS ANEXADOS ---');
      for (const d of ctx.attachedDocuments) {
        lines.push(`  • [${d.documentType}] ${d.name}`);
      }
    }

    lines.push('\n===== FIM DO CONTEXTO =====\n');
    lines.push('INSTRUÇÃO: Use os dados do contexto acima para tornar o documento gerado específico, rico e baseado em evidências reais deste aluno. Não invente dados. Se um campo do contexto for relevante para uma seção do documento, cite-o de forma direta e fundamentada.');

    return lines.join('\n');
  },
};
