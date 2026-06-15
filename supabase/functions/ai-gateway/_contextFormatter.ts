/**
 * _contextFormatter.ts — Formata CanonicalData como texto para injeção no prompt da IA
 *
 * Produz blocos de texto claros e estruturados que o Gemini consegue interpretar.
 * Mantém paridade lógica com o buildPromptBlock() do frontend (canonicalStudentContext.ts),
 * sem duplicar a implementação complexa de seleção e enriquecimento.
 *
 * Princípio: dado ausente → bloco omitido (nunca gera seção vazia).
 */

import type { CanonicalData } from './_contextBuilder.ts';

// ─── Tipos de documento relevantes por targetDocType ─────────────────────────

const DOC_RELEVANCE: Record<string, string[]> = {
  pei:                 ['ESTUDO_DE_CASO', 'PAEE', 'estudo_de_caso', 'paee'],
  paee:                ['ESTUDO_DE_CASO', 'estudo_de_caso'],
  documento_unificado_pei_paee: ['ESTUDO_CASO', 'ESTUDO_DE_CASO', 'PEI', 'PAEE', 'estudo_de_caso', 'pei', 'paee'],
  pdi:                 ['PEI', 'PAEE', 'ESTUDO_DE_CASO', 'pei', 'paee', 'estudo_de_caso'],
  plano_acao_regente:  ['ESTUDO_DE_CASO', 'PEI', 'PAEE', 'estudo_de_caso', 'pei', 'paee'],
  plano_acao_aee:      ['PAEE', 'ESTUDO_DE_CASO', 'paee', 'estudo_de_caso'],
  perfil_inteligente:  ['PEI', 'PAEE', 'PDI', 'ESTUDO_DE_CASO', 'pei', 'paee', 'pdi', 'estudo_de_caso'],
  relatorio:           ['PEI', 'PAEE', 'ESTUDO_DE_CASO', 'pei', 'paee', 'estudo_de_caso'],
};

function relevant(docType: string, targetDocType: string): boolean {
  const list = DOC_RELEVANCE[targetDocType.toLowerCase()] ?? [];
  return list.some(t => t.toLowerCase() === docType.toLowerCase());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeStr(v: any): string {
  if (typeof v === 'string') return v.trim();
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function formatDate(raw: string | null | undefined): string {
  if (!raw) return 'data não informada';
  try {
    return new Date(raw).toLocaleDateString('pt-BR');
  } catch { return raw; }
}

function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s;
  return s.slice(0, max) + '…';
}

// ─── Bloco: Perfil Cognitivo ──────────────────────────────────────────────────

const COG_DIMS = [
  'Comunicação Expressiva', 'Interação Social', 'Autonomia (AVD)',
  'Autorregulação', 'Atenção Sustentada', 'Compreensão',
  'Motricidade Fina', 'Motricidade Grossa', 'Participação', 'Linguagem/Leitura',
];

function buildCognitiveBlock(profiles: any[]): string {
  if (!profiles || profiles.length === 0) return '';

  const latest = profiles[0];
  const scores = [
    latest.comunicacao_expressiva, latest.interacao_social,
    latest.autonomia_avd, latest.autorregulacao,
    latest.atencao_sustentada, latest.compreensao,
    latest.motricidade_fina, latest.motricidade_grossa,
    latest.participacao, latest.linguagem_leitura,
  ];

  const lines: string[] = [];
  scores.forEach((s, i) => {
    if (s != null) lines.push(`  - ${COG_DIMS[i]}: ${s}/10`);
  });
  if (lines.length === 0) return '';

  const obs = safeStr(latest.observation);
  const by  = safeStr(latest.evaluated_by);
  const dt  = formatDate(latest.evaluated_at);

  let block = `\n=== PERFIL COGNITIVO (avaliado em ${dt}${by ? ' por ' + by : ''}) ===\n`;
  block += lines.join('\n');
  if (obs) block += `\nObservações do avaliador: ${obs}`;
  return block;
}

// ─── Bloco: Laudos e Relatórios Médicos ───────────────────────────────────────

function buildMedicalBlock(reports: any[]): string {
  if (!reports || reports.length === 0) return '';

  let block = '\n=== LAUDOS E RELATÓRIOS CLÍNICOS ===\n';
  for (const r of reports.slice(0, 5)) {
    const type = safeStr(r.report_type) || 'multidisciplinar';
    const syn  = safeStr(r.synthesis);
    if (!syn) continue;
    block += `\n[${type.toUpperCase()}]\n`;
    block += `Síntese: ${truncate(syn, 600)}\n`;
    if (Array.isArray(r.pedagogical_points) && r.pedagogical_points.length > 0) {
      block += `Pontos pedagógicos: ${r.pedagogical_points.slice(0, 4).join('; ')}\n`;
    }
    if (Array.isArray(r.suggestions) && r.suggestions.length > 0) {
      block += `Sugestões: ${r.suggestions.slice(0, 3).join('; ')}\n`;
    }
  }
  return block;
}

// ─── Bloco: Fichas de Observação e Checklists ─────────────────────────────────

function buildObservationBlock(forms: any[]): string {
  if (!forms || forms.length === 0) return '';

  const checklists = forms.filter(f =>
    f.form_type === 'checklist_regente' || f.form_type === 'checklist_cuidadora'
  );
  const others = forms.filter(f =>
    f.form_type !== 'checklist_regente' && f.form_type !== 'checklist_cuidadora'
  );

  let block = '';

  if (checklists.length > 0) {
    block += '\n=== EVIDÊNCIAS PEDAGÓGICAS E DE ROTINA (Checklists) ===\n';
    block += 'INSTRUÇÃO: Diferencie origem — observação pedagógica (professor/AEE) ≠ rotina escolar (cuidadora) ≠ laudo clínico.\n';

    for (const f of checklists.slice(0, 5)) {
      const isRegente = f.form_type === 'checklist_regente';
      const origin    = isRegente ? 'Professor Regente' : 'Cuidadora Escolar';
      const dt        = formatDate(f.created_at);
      const fd        = (typeof f.fields_data === 'object' && f.fields_data) ? f.fields_data : {};

      block += `\n[Checklist ${origin} — ${dt}]\n`;

      // Estratégias que funcionaram
      const estrategias = arrFromField(fd, 'estrategiasEficazes');
      if (estrategias.length > 0) {
        block += `Estratégias que funcionaram: ${estrategias.slice(0, 3).join('; ')}\n`;
      }

      if (isRegente) {
        const atencao = arrFromField(fd, 'atencaoParticipacao');
        if (atencao.length > 0) block += `Atenção/Participação: ${atencao.slice(0, 3).join('; ')}\n`;
        const aprendizagem = arrFromField(fd, 'aprendizagem');
        if (aprendizagem.length > 0) block += `Aprendizagem: ${aprendizagem.slice(0, 3).join('; ')}\n`;
        const recomendacoes = arrFromField(fd, 'recomendacoesImediatas');
        if (recomendacoes.length > 0) block += `Recomendações: ${recomendacoes.slice(0, 3).join('; ')}\n`;
      } else {
        const regulacao = arrFromField(fd, 'regulacaoEmocional');
        if (regulacao.length > 0) block += `Regulação emocional: ${regulacao.slice(0, 3).join('; ')}\n`;
        const alertas = arrFromField(fd, 'alertasSemana');
        if (alertas.length > 0) block += `Alertas: ${alertas.slice(0, 3).join('; ')}\n`;
      }

      if (typeof fd.parecer === 'string' && fd.parecer.trim()) {
        block += `Parecer pedagógico: ${truncate(fd.parecer, 300)}\n`;
      }
    }
  }

  if (others.length > 0) {
    block += '\n=== FICHAS DE OBSERVAÇÃO PEDAGÓGICA ===\n';
    for (const f of others.slice(0, 5)) {
      const dt   = formatDate(f.created_at);
      const by   = safeStr(f.created_by);
      const type = safeStr(f.form_type) || 'ficha';
      const fd   = (typeof f.fields_data === 'object' && f.fields_data) ? f.fields_data : {};
      block += `\n[${type} — ${dt}${by ? ' por ' + by : ''}]\n`;
      // Extrai campos textuais com conteúdo
      for (const [k, v] of Object.entries(fd)) {
        if (typeof v === 'string' && v.trim().length > 10 && !k.startsWith('_')) {
          block += `  ${k}: ${truncate(v, 200)}\n`;
        }
      }
    }
  }

  return block;
}

// ─── Bloco: Atendimentos (frequência e padrão) ────────────────────────────────

function buildAppointmentsBlock(appointments: any[]): string {
  if (!appointments || appointments.length === 0) return '';

  const sorted = [...appointments]
    .filter(a => a.date || a.appointment_date)
    .sort((a, b) => {
      const da = a.date ?? a.appointment_date ?? '';
      const db = b.date ?? b.appointment_date ?? '';
      return db.localeCompare(da);
    });

  const total     = sorted.length;
  const realized  = sorted.filter(a => a.status === 'realizado').length;
  const absences  = sorted.filter(a => a.status === 'falta').length;
  const presRate  = total > 0 ? Math.round((realized / total) * 100) : 0;

  // Últimos 10 para exibição
  const recent = sorted.slice(0, 10);

  let block = `\n=== HISTÓRICO DE ATENDIMENTOS ===\n`;
  block += `Total: ${total} | Realizados: ${realized} | Faltas: ${absences} | Taxa de presença: ${presRate}%\n`;
  block += 'Últimos atendimentos:\n';
  for (const a of recent) {
    const dt      = formatDate(a.date ?? a.appointment_date);
    const status  = safeStr(a.status) || 'realizado';
    const type    = safeStr(a.type ?? a.appointment_type) || 'AEE';
    const notes   = safeStr(a.notes);
    block += `  - ${dt}: ${type} — ${status}${notes ? ` (${truncate(notes, 80)})` : ''}\n`;
  }
  return block;
}

// ─── Bloco: Documentos Pedagógicos Salvos ─────────────────────────────────────

function summarizeDocContent(structured_data: any): string {
  if (!structured_data || typeof structured_data !== 'object') return '';
  const parts: string[] = [];
  try {
    const secs = Array.isArray(structured_data.sections)
      ? structured_data.sections
      : Array.isArray(structured_data.blocos) ? structured_data.blocos : [];
    for (const sec of secs.slice(0, 6)) {
      const fields = Array.isArray(sec.fields) ? sec.fields
        : Array.isArray(sec.campos) ? sec.campos : [];
      for (const f of fields.slice(0, 4)) {
        const val = safeStr(f.value ?? f.valor ?? '');
        const label = safeStr(f.label ?? f.rotulo ?? f.id ?? '');
        if (val.length > 15 && label) {
          parts.push(`${label}: ${truncate(val, 200)}`);
        }
      }
    }
  } catch { /* ignora */ }
  return parts.slice(0, 8).join('\n');
}

function buildSavedDocumentsBlock(docs: any[], targetDocType: string): string {
  if (!docs || docs.length === 0) return '';

  const filtered = docs.filter(d => relevant(d.doc_type ?? '', targetDocType));
  if (filtered.length === 0) return '';

  let block = '\n=== DOCUMENTOS PEDAGÓGICOS ANTERIORES (relevantes para este documento) ===\n';
  block += 'INSTRUÇÃO: Use estes documentos como base e contexto — avance sobre eles, não os repita.\n';

  for (const d of filtered.slice(0, 5)) {
    const type   = safeStr(d.doc_type);
    const dt     = formatDate(d.created_at);
    const status = safeStr(d.status).toUpperCase();
    block += `\n[${type} — ${dt} — ${status}]\n`;
    const summary = summarizeDocContent(d.structured_data);
    if (summary) block += summary + '\n';
  }

  return block;
}

// ─── Bloco: Planos de Ação Salvos ─────────────────────────────────────────────

function buildActionPlansBlock(plans: any[], label: string): string {
  if (!plans || plans.length === 0) return '';

  let block = `\n=== ${label.toUpperCase()} (uso como referência de continuidade pedagógica) ===\n`;

  for (const p of plans.slice(0, 3)) {
    const type = safeStr(p.plan_type) || label;
    const dt   = formatDate(p.created_at);
    const ver  = p.version_number ?? 1;
    const summ = safeStr(p.summary);
    block += `\n[${type} v${ver} — ${dt}]\n`;
    if (summ) block += `Sumário: ${truncate(summ, 400)}\n`;

    // Extrai campos-chave do content_json se disponível
    const cj = (typeof p.content_json === 'object' && p.content_json) ? p.content_json : null;
    if (cj) {
      const obj = safeStr(cj.sessionObjective ?? cj.mainFocus ?? '');
      if (obj) block += `Objetivo: ${truncate(obj, 200)}\n`;
      const barrier = safeStr(cj.priorityBarrier?.title ?? '');
      if (barrier) block += `Barreira prioritária: ${truncate(barrier, 150)}\n`;
    }
  }

  return block;
}

// ─── Bloco: Perfil Inteligente Salvo ──────────────────────────────────────────

function buildIntelligentProfileBlock(profile: any | null): string {
  if (!profile) return '';

  const pj = (typeof profile.profile_json === 'object' && profile.profile_json)
    ? profile.profile_json : null;
  if (!pj) return '';

  const ver = profile.version_number ?? 1;
  const dt  = formatDate(profile.created_at);

  let block = `\n=== PERFIL INTELIGENTE MAIS RECENTE (v${ver} — ${dt}) ===\n`;
  block += 'INSTRUÇÃO: Use este perfil apenas como histórico complementar. Não copie, não trate como verdade única e só mencione evolução se houver registros temporais comparáveis.\n';

  if (typeof pj.humanizedIntroduction?.text === 'string') {
    block += `Introdução: ${truncate(pj.humanizedIntroduction.text, 300)}\n`;
  }
  if (Array.isArray(pj.bestLearningStrategies?.items) && pj.bestLearningStrategies.items.length > 0) {
    block += `Melhores estratégias: ${pj.bestLearningStrategies.items.slice(0, 4).join('; ')}\n`;
  }
  if (Array.isArray(pj.strengths) && pj.strengths.length > 0) {
    block += `Potencialidades: ${pj.strengths.slice(0, 4).join('; ')}\n`;
  }
  if (typeof pj.changesSinceLastVersion === 'string' && pj.changesSinceLastVersion.trim()) {
    block += `Mudanças desde versão anterior: ${truncate(pj.changesSinceLastVersion, 200)}\n`;
  }

  return block;
}

// ─── Bloco: Atividades Geradas ─────────────────────────────────────────────────

function buildActivitiesBlock(activities: any[]): string {
  if (!activities || activities.length === 0) return '';

  let block = '\n=== ATIVIDADES PEDAGÓGICAS JÁ GERADAS ===\n';
  block += 'INSTRUÇÃO: Proponha atividades com continuidade pedagógica — nunca repita formato idêntico sem justificativa.\n';

  for (const a of activities.slice(0, 8)) {
    const title = safeStr(a.title);
    const disc  = safeStr(a.discipline);
    const grade = safeStr(a.grade);
    const dt    = formatDate(a.created_at);
    const mode  = safeStr(a.mode);
    block += `  - ${title}${disc ? ' [' + disc + ']' : ''}${grade ? ' — ' + grade : ''} (${dt}${mode ? ', ' + mode : ''})\n`;
  }

  // Estratégias recorrentes extraídas
  const strategies = new Set<string>();
  for (const a of activities.slice(0, 5)) {
    const cj = (typeof a.content_json === 'object' && a.content_json) ? a.content_json : {};
    const guia = cj.guia_pedagogico ?? {};
    if (Array.isArray(guia.dicas_de_mediacao)) {
      guia.dicas_de_mediacao.slice(0, 2).forEach((s: string) => strategies.add(s));
    }
  }
  if (strategies.size > 0) {
    block += `\nESTRATÉGIAS QUE FUNCIONARAM (extraídas das atividades):\n`;
    [...strategies].slice(0, 5).forEach(s => { block += `  - ${s}\n`; });
  }

  return block;
}

// ─── Bloco: Documentos Subidos (laudos via Storage) ───────────────────────────

function buildAttachedDocumentsBlock(docs: any[]): string {
  if (!docs || docs.length === 0) return '';

  let block = '\n=== DOCUMENTOS E LAUDOS SUBIDOS ===\n';
  for (const d of docs.slice(0, 10)) {
    const name  = safeStr(d.name);
    const type  = safeStr(d.document_type) || 'Laudo';
    const dt    = formatDate(d.created_at);
    const notes = safeStr(d.notes);
    block += `  - [${type}] ${name} (${dt})${notes ? ': ' + truncate(notes, 150) : ''}\n`;
  }
  return block;
}

// ─── Helper: extrai array de campo fields_data ─────────────────────────────────

function arrFromField(fd: any, key: string): string[] {
  const v = fd?.[key];
  if (Array.isArray(v)) return v.filter((x: any) => typeof x === 'string' && x.trim()) as string[];
  if (typeof v === 'string' && v.trim()) return [v];
  return [];
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Converte CanonicalData em bloco de texto formatado para injeção no prompt da IA.
 *
 * @param data          Dados canônicos retornados por buildCanonicalContext
 * @param targetDocType Tipo de documento sendo gerado (pei, paee, plano_acao_aee etc.)
 * @returns             Texto formatado pronto para concatenar ao prompt
 */
export function formatContextForPrompt(data: CanonicalData, targetDocType: string): string {
  const sections: string[] = [];
  const normalizedTarget = targetDocType.toLowerCase();
  const isDocumentoUnificado = normalizedTarget === 'documento_unificado_pei_paee';

  // Perfil cognitivo (student_profiles)
  const cogBlock = buildCognitiveBlock(data.profile ? [data.profile] : []);
  if (cogBlock) sections.push(cogBlock);

  // Laudos clínicos (medical_reports)
  const medBlock = buildMedicalBlock(data.history.medical_reports);
  if (medBlock) sections.push(medBlock);

  // Fichas e checklists (observation_forms)
  const obsBlock = buildObservationBlock(data.history.observation_forms);
  if (obsBlock) sections.push(obsBlock);

  // Atendimentos (tenant_appointments)
  const apptBlock = buildAppointmentsBlock(data.history.tenant_appointments);
  if (apptBlock) sections.push(apptBlock);

  // Documentos subidos (student_documents)
  const attachedBlock = buildAttachedDocumentsBlock(data.attached_documents);
  if (attachedBlock) sections.push(attachedBlock);

  // Documentos pedagógicos salvos (documents) — filtrado por relevância
  const savedDocsBlock = buildSavedDocumentsBlock(data.saved_documents, targetDocType);
  if (savedDocsBlock) sections.push(savedDocsBlock);

  // Planos de ação do professor regente (student_action_plans)
  if (!isDocumentoUnificado) {
    const actionPlansBlock = buildActionPlansBlock(data.saved_action_plans, 'Planos de Ação — Professor Regente');
    if (actionPlansBlock) sections.push(actionPlansBlock);
  }

  // Planos de ação AEE (student_aee_action_plans)
  if (!isDocumentoUnificado) {
    const aeeActionPlansBlock = buildActionPlansBlock(data.saved_aee_action_plans, 'Planos de Ação AEE Anteriores');
    if (aeeActionPlansBlock) sections.push(aeeActionPlansBlock);
  }

  // Perfil Inteligente salvo (student_intelligent_profiles)
  if (!isDocumentoUnificado) {
    const profileBlock = buildIntelligentProfileBlock(data.saved_intelligent_profile);
    if (profileBlock) sections.push(profileBlock);
  }

  // Atividades geradas (generated_activities)
  if (!isDocumentoUnificado) {
    const activitiesBlock = buildActivitiesBlock(data.generated_activities);
    if (activitiesBlock) sections.push(activitiesBlock);
  }

  if (sections.length === 0) return '';

  return (
    '\n\n═══════════════════════════════════════════════════\n' +
    'CONTEXTO CANÔNICO DO ALUNO — FONTES OFICIAIS DO SISTEMA\n' +
    '═══════════════════════════════════════════════════\n' +
    'GUARDRAILS: (1) Dado ausente → use ausência neutra ou deixe vazio conforme o schema. ' +
    '(2) Observação pedagógica ≠ diagnóstico clínico. ' +
    '(3) Nunca invente CID, diagnóstico ou laudo não listado aqui. ' +
    '(4) Diagnóstico/CID é contexto cadastral, não prova funcional; não deduza comportamento, autonomia, comunicação, suporte, frequência, evolução, estratégia ou dificuldade pedagógica a partir dele. ' +
    '(5) Evolução, avanço, regressão ou manutenção só devem aparecer com registros temporais comparáveis.\n' +
    sections.join('') +
    '\n═══════════════════════════════════════════════════\n' +
    'FIM DO CONTEXTO CANÔNICO\n' +
    '═══════════════════════════════════════════════════\n'
  );
}
