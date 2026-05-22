// components/ChecklistRegenteForm.tsx
// Checklist de Observação em Sala — Professor Regente
// Salva em observation_forms com form_type = 'checklist_regente'
import React, { useState, useEffect, useCallback } from 'react';
import {
  Save, Sparkles, Printer, RefreshCw, ShieldCheck,
  ChevronDown, ChevronUp, History, Trash2, RotateCcw, ScanLine,
} from 'lucide-react';
import { printRegenteEnem } from './ChecklistEnemPDF';
import { Student, User, SchoolConfig } from '../types';
import { ObservationFormService, TimelineService } from '../services/persistenceService';
import { callAIGateway } from '../services/aiGatewayService';
import { AI_CREDIT_COSTS } from '../config/aiCosts';
import { DEMO_MODE } from '../services/supabase';
import { generateDocumentCode } from '../utils/documentCodes';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ChecklistRegenteData {
  professor: string;
  serie: string;
  dataObservacao: string;
  contextoObservado: string[];
  atencaoParticipacao: string[];
  comunicacao: string[];
  interacaoSocial: string[];
  autonomia: string[];
  aprendizagem: string[];
  regulacaoComportamento: string[];
  estrategiasEficazes: string[];
  recomendacoesImediatas: string[];
  observacoesLivres: string;
  parecer?: string;
  parecerGeneratedAt?: string;
  savedAt?: string;
  auditCode?: string;
}

interface Props {
  student: Student;
  user: User;
  school?: SchoolConfig | null;
  onSaved?: (recordId: string, auditCode: string) => void;
}

// ─── Constantes do checklist ──────────────────────────────────────────────────

export const CONTEXTO_OPTIONS = [
  'Aula expositiva', 'Atividade individual', 'Atividade em grupo',
  'Recreio', 'Entrada/saída', 'Avaliação', 'Atendimento individual', 'Outro',
];

export interface CheckSection {
  id: keyof ChecklistRegenteData;
  label: string;
  emoji: string;
  items: string[];
}

export const SECTIONS: CheckSection[] = [
  {
    id: 'atencaoParticipacao',
    label: '1. Atenção e Participação',
    emoji: '👁️',
    items: [
      'Mantém atenção por curto período',
      'Mantém atenção com mediação',
      'Distrai-se facilmente',
      'Participa espontaneamente',
      'Participa quando chamado',
      'Evita participação',
      'Necessita de comandos repetidos',
      'Finaliza atividades',
      'Abandona atividades antes de concluir',
    ],
  },
  {
    id: 'comunicacao',
    label: '2. Comunicação',
    emoji: '💬',
    items: [
      'Comunica necessidades verbalmente',
      'Usa gestos/apontar',
      'Usa frases curtas',
      'Tem dificuldade para pedir ajuda',
      'Responde comandos simples',
      'Demonstra compreensão parcial',
      'Necessita de apoio visual',
      'Apresenta ecolalia/repetições',
      'Não se comunica espontaneamente',
    ],
  },
  {
    id: 'interacaoSocial',
    label: '3. Interação Social',
    emoji: '🤝',
    items: [
      'Interage com colegas',
      'Prefere ficar sozinho',
      'Busca adultos',
      'Aceita ajuda',
      'Compartilha materiais',
      'Tem conflitos frequentes',
      'Demonstra frustração',
      'Segue combinados sociais com apoio',
      'Participa de atividades coletivas',
    ],
  },
  {
    id: 'autonomia',
    label: '4. Autonomia',
    emoji: '🧭',
    items: [
      'Organiza materiais',
      'Precisa de ajuda para iniciar',
      'Precisa de ajuda para concluir',
      'Pede ajuda quando necessário',
      'Usa banheiro com autonomia',
      'Alimenta-se com autonomia',
      'Desloca-se com segurança',
      'Necessita de supervisão constante',
    ],
  },
  {
    id: 'aprendizagem',
    label: '5. Aprendizagem',
    emoji: '📚',
    items: [
      'Reconhece letras/números',
      'Lê palavras/frases',
      'Copia do quadro',
      'Registra respostas',
      'Compreende instruções',
      'Resolve atividades simples',
      'Necessita de adaptação',
      'Necessita de material concreto',
      'Demonstra conhecimento prévio',
    ],
  },
  {
    id: 'regulacaoComportamento',
    label: '6. Comportamento e Regulação',
    emoji: '🧘',
    items: [
      'Mantém-se tranquilo',
      'Apresenta agitação motora',
      'Demonstra ansiedade',
      'Apresenta irritabilidade',
      'Chora com facilidade',
      'Apresenta recusa',
      'Necessita de pausa',
      'Regula-se com apoio',
      'Reage bem a rotina visual',
    ],
  },
  {
    id: 'estrategiasEficazes',
    label: '7. Estratégias que Funcionaram',
    emoji: '✅',
    items: [
      'Comando curto',
      'Suporte visual',
      'Material concreto',
      'Reforço positivo',
      'Pausa programada',
      'Redução de estímulos',
      'Tempo ampliado',
      'Atividade em etapas',
      'Mediação individual',
    ],
  },
  {
    id: 'recomendacoesImediatas',
    label: '8. Recomendações Imediatas',
    emoji: '📋',
    items: [
      'Manter rotina visual',
      'Adaptar atividade',
      'Reduzir quantidade de itens',
      'Oferecer apoio individual',
      'Usar material concreto',
      'Registrar nova observação',
      'Conversar com família',
      'Encaminhar para AEE',
      'Solicitar estudo de caso',
    ],
  },
];

const EMPTY_DATA: ChecklistRegenteData = {
  professor: '',
  serie: '',
  dataObservacao: new Date().toISOString().split('T')[0],
  contextoObservado: [],
  atencaoParticipacao: [],
  comunicacao: [],
  interacaoSocial: [],
  autonomia: [],
  aprendizagem: [],
  regulacaoComportamento: [],
  estrategiasEficazes: [],
  recomendacoesImediatas: [],
  observacoesLivres: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toggle(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
}

function countChecked(data: ChecklistRegenteData): number {
  return SECTIONS.reduce((acc, s) => {
    const arr = data[s.id as keyof ChecklistRegenteData];
    return acc + (Array.isArray(arr) ? (arr as string[]).length : 0);
  }, 0) + data.contextoObservado.length;
}

export function buildChecklistPrintHtml(
  data: ChecklistRegenteData,
  student: Student,
  school?: SchoolConfig | null,
): string {
  const escH = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const sectionHtml = SECTIONS.map(sec => {
    const selected = (data[sec.id as keyof ChecklistRegenteData] as string[]) ?? [];
    const items = sec.items.map(item =>
      `<li class="${selected.includes(item) ? 'checked' : ''}">
        <span class="box">${selected.includes(item) ? '■' : '□'}</span> ${escH(item)}
      </li>`,
    ).join('');
    return `<section>
      <h2>${escH(sec.emoji + ' ' + sec.label)}</h2>
      <ul>${items}</ul>
    </section>`;
  }).join('');

  const parecerHtml = data.parecer
    ? `<div class="parecer">
        <h2>Parecer Pedagógico da IA</h2>
        <div class="parecer-body">${escH(data.parecer).replace(/\n/g, '<br/>')}</div>
      </div>`
    : '';

  return `<!DOCTYPE html><html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Checklist — ${escH(student.name)}</title>
  <style>
    * { box-sizing: border-box; font-family: Arial, sans-serif; }
    body { margin: 0; padding: 24px; color: #1f2937; font-size: 11px; }
    header { border-bottom: 3px solid #1F4E5F; padding-bottom: 10px; margin-bottom: 14px; }
    h1 { color: #1F4E5F; font-size: 16px; margin: 0 0 4px; }
    .meta { color: #6b7280; font-size: 10px; line-height: 1.6; }
    section { margin: 10px 0; page-break-inside: avoid; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; }
    h2 { color: #1F4E5F; font-size: 11px; margin: 0 0 6px; font-weight: bold; }
    ul { margin: 0; padding: 0; list-style: none; columns: 2; column-gap: 14px; }
    li { padding: 2px 0; font-size: 10px; }
    li.checked { font-weight: bold; color: #1F4E5F; }
    .box { font-size: 10px; margin-right: 4px; }
    .contexto { margin: 8px 0 12px; }
    .obs { margin: 12px 0; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; }
    .parecer { margin: 14px 0; border: 2px solid #1F4E5F; border-radius: 6px; padding: 10px 12px; }
    .parecer h2 { color: #C69214; }
    .parecer-body { font-size: 10.5px; line-height: 1.55; white-space: pre-wrap; }
    .audit { text-align: right; color: #9ca3af; font-size: 9px; margin-top: 14px; border-top: 1px solid #e5e7eb; padding-top: 6px; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <header>
    <h1>Checklist de Observação em Sala — Professor Regente</h1>
    <div class="meta">
      Aluno: <strong>${escH(student.name)}</strong>${student.grade ? ` &nbsp;|&nbsp; Série: ${escH(student.grade)}` : ''}${data.serie ? ` (${escH(data.serie)})` : ''}<br/>
      Professor(a): ${escH(data.professor || '—')} &nbsp;|&nbsp; Data: ${data.dataObservacao ? new Date(data.dataObservacao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}<br/>
      ${school?.schoolName ? `Escola: ${escH(school.schoolName)} &nbsp;|&nbsp; ` : ''}Código: <strong>${escH(data.auditCode || '—')}</strong>
    </div>
  </header>

  ${data.contextoObservado.length ? `<div class="contexto"><strong>Contexto observado:</strong> ${escH(data.contextoObservado.join(', '))}</div>` : ''}

  ${sectionHtml}

  ${data.observacoesLivres ? `<div class="obs"><h2>Observações livres do professor</h2><p>${escH(data.observacoesLivres).replace(/\n/g, '<br/>')}</p></div>` : ''}

  ${parecerHtml}

  <div class="audit">Documento gerado pelo IncluiAI &nbsp;|&nbsp; ${new Date().toLocaleString('pt-BR')} &nbsp;|&nbsp; ${escH(data.auditCode || '')}</div>
</body></html>`;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export const ChecklistRegenteForm: React.FC<Props> = ({ student, user, school, onSaved }) => {
  const [data, setData] = useState<ChecklistRegenteData>({ ...EMPTY_DATA });
  const [saving, setSaving] = useState(false);
  const [generatingParecer, setGeneratingParecer] = useState(false);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string | null>(null);

  // Carrega histórico do aluno
  const loadRecords = useCallback(() => {
    if (DEMO_MODE || !student.id) return;
    ObservationFormService.getForStudent(student.id).then(forms => {
      const mine = forms.filter((f: any) => f.form_type === 'checklist_regente');
      setRecords(mine);
      if (mine[0]) {
        const d = mine[0].fields_data ?? {};
        setData({ ...EMPTY_DATA, ...d });
        setSavedCode(mine[0].audit_code ?? null);
      }
    }).catch(() => {});
  }, [student.id]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  // ─── Toggle helpers ─────────────────────────────────────────────────────────

  const toggleMulti = (field: keyof ChecklistRegenteData, item: string) => {
    setData(prev => ({
      ...prev,
      [field]: toggle((prev[field] as string[]) ?? [], item),
    }));
  };

  const setField = (field: keyof ChecklistRegenteData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  // ─── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!student.id) return;
    if (DEMO_MODE) {
      const code = generateDocumentCode('registration');
      setData(prev => ({ ...prev, auditCode: code, savedAt: new Date().toISOString() }));
      setSavedCode(code);
      alert(`Checklist salvo (modo demo)!\nCódigo: ${code}`);
      return;
    }
    if (!user.tenant_id) {
      alert('Tenant não identificado. Faça logout e login novamente.');
      return;
    }
    setSaving(true);
    try {
      const code = generateDocumentCode('registration');
      const payload: ChecklistRegenteData = { ...data, auditCode: code, savedAt: new Date().toISOString() };
      const savedId = await ObservationFormService.save({
        tenantId:   user.tenant_id,
        studentId:  student.id,
        userId:     user.id,
        formType:   'checklist_regente',
        title:      'Checklist de Observação em Sala — Professor Regente',
        fieldsData: { ...payload as Record<string, any>, origin: 'digital' },
        auditCode:  code,
        createdBy:  user.name,
        status:     'finalizado',
        origin:     'digital',
      });
      if (!savedId) {
        alert('Erro ao salvar. Verifique sua conexão.');
        return;
      }
      await TimelineService.add({
        tenantId:    user.tenant_id,
        studentId:   student.id,
        eventType:   'ficha',
        title:       'Checklist de Observação em Sala preenchido',
        description: `Código: ${code} — por ${user.name}`,
        linkedId:    savedId,
        linkedTable: 'observation_forms',
        icon:        'ClipboardCheck',
        author:      user.name,
      });
      setData(payload);
      setSavedCode(code);
      onSaved?.(savedId, code);
      loadRecords();
      alert(`Checklist salvo!\nCódigo: ${code}`);
    } catch (e: any) {
      alert(`Erro ao salvar: ${e?.message || 'Tente novamente.'}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Gerar Parecer ───────────────────────────────────────────────────────────

  const handleGenerateParecer = async () => {
    if (!savedCode) {
      alert('Salve o checklist antes de gerar o parecer.');
      return;
    }
    setGeneratingParecer(true);
    try {
      const sectionLines = SECTIONS.map(sec => {
        const selected = (data[sec.id as keyof ChecklistRegenteData] as string[]) ?? [];
        if (!selected.length) return null;
        return `${sec.label}:\n${selected.map(i => `  - ${i}`).join('\n')}`;
      }).filter(Boolean).join('\n\n');

      const prompt = `Você é um(a) psicopedagogo(a) especialista em educação inclusiva.
Com base nas observações registradas pelo professor regente no checklist abaixo, elabore um PARECER PEDAGÓGICO estruturado.

ALUNO: ${student.name}
SÉRIE/ANO: ${data.serie || student.grade || 'não informado'}
PROFESSOR(A) REGENTE: ${data.professor || 'não informado'}
DATA DA OBSERVAÇÃO: ${data.dataObservacao ? new Date(data.dataObservacao + 'T12:00:00').toLocaleDateString('pt-BR') : 'não informado'}
CONTEXTO: ${data.contextoObservado.join(', ') || 'não informado'}

OBSERVAÇÕES MARCADAS NO CHECKLIST:
${sectionLines || 'Nenhum item marcado.'}

OBSERVAÇÕES LIVRES DO PROFESSOR:
${data.observacoesLivres || 'Nenhuma.'}

Elabore o parecer com as seguintes seções obrigatórias:
1. Síntese da observação
2. Principais barreiras observadas
3. Potencialidades percebidas
4. Estratégias que funcionaram
5. Recomendações práticas para sala
6. Indicadores para acompanhar
7. Sugestão de encaminhamento

REGRAS IMPORTANTES:
- Use exclusivamente linguagem pedagógica. Não faça diagnóstico clínico nem clínico-pedagógico inferido.
- Baseie-se APENAS nas observações marcadas no checklist. Não invente dados.
- As observações do professor são evidências pedagógicas — nunca as eleve à categoria de laudo clínico.
- Não use termos médicos clínicos. Não sugira diagnósticos, CID ou condições clínicas não informadas.
- Termos proibidos: "CID provável", "diagnóstico compatível com", "certamente apresenta", "provavelmente possui".
- Dado ausente → "Não observado neste período — recomenda-se acompanhamento continuado."
- Seja claro, objetivo e profissional. Escreva em português do Brasil.
- Máximo de 400 palavras no total.`;

      const { result } = await callAIGateway({
        task:             'text',
        prompt,
        creditsRequired:  AI_CREDIT_COSTS.FICHAS_PEDAGOGICAS,
        requestType:      'checklist_parecer',
        studentId:        student.id,
      });

      const updatedData = {
        ...data,
        parecer:              result,
        parecerGeneratedAt:   new Date().toISOString(),
      };
      setData(updatedData);

      // Salva o parecer junto com os dados existentes
      if (!DEMO_MODE && user.tenant_id && savedCode) {
        const records2 = await ObservationFormService.getForStudent(student.id);
        const existing = records2.find((r: any) => r.form_type === 'checklist_regente' && r.audit_code === savedCode);
        if (existing) {
          await ObservationFormService.update(existing.id, updatedData as Record<string, any>, 'finalizado');
        }
      }
    } catch (e: any) {
      alert(`Erro ao gerar parecer: ${e?.message || 'Tente novamente.'}`);
    } finally {
      setGeneratingParecer(false);
    }
  };

  // ─── Imprimir ────────────────────────────────────────────────────────────────

  const handlePrint = () => {
    const html = buildChecklistPrintHtml(data, student, school);
    const win = window.open('', '_blank', 'width=900,height=750');
    if (!win) { alert('Permita pop-ups para imprimir.'); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  };

  // ─── Histórico helpers ────────────────────────────────────────────────────────

  const handleLoadRecord = (rec: any) => {
    setData({ ...EMPTY_DATA, ...(rec.fields_data ?? {}) });
    setSavedCode(rec.audit_code ?? null);
    setShowHistory(false);
  };

  const handleDeleteRecord = async (id: string) => {
    if (!window.confirm('Excluir este registro? Esta ação não pode ser desfeita.')) return;
    setDeletingId(id);
    try {
      await ObservationFormService.delete(id);
      loadRecords();
      if (savedCode && records.find((r: any) => r.id === id)?.audit_code === savedCode) {
        setData({ ...EMPTY_DATA });
        setSavedCode(null);
      }
    } catch (e: any) {
      alert(`Erro ao excluir: ${e?.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const checked = countChecked(data);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Cabeçalho do aluno */}
      <div className="flex items-center gap-2 text-xs text-gray-600 bg-white/70 px-3 py-2 rounded-lg border border-white/80">
        <span className="font-bold">{student.name}</span>
        <span>·</span>
        <span>{student.grade || 'sem série'}</span>
        {(student.diagnosis?.length ?? 0) > 0 && (
          <><span>·</span><span>{student.diagnosis!.join(', ')}</span></>
        )}
        <span className="ml-auto font-mono text-[#1F4E5F] font-bold">{checked} itens marcados</span>
      </div>

      {/* Campos de cabeçalho */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            Professor(a) regente
          </label>
          <input
            className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#1F4E5F]/30 outline-none bg-white"
            placeholder="Nome do professor"
            value={data.professor}
            onChange={e => setField('professor', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            Série / Ano
          </label>
          <input
            className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#1F4E5F]/30 outline-none bg-white"
            placeholder="Ex: 3º ano EF"
            value={data.serie}
            onChange={e => setField('serie', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            Data da observação
          </label>
          <input
            type="date"
            className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#1F4E5F]/30 outline-none bg-white"
            value={data.dataObservacao}
            onChange={e => setField('dataObservacao', e.target.value)}
          />
        </div>
      </div>

      {/* Contexto observado */}
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
          Contexto observado
        </label>
        <div className="flex flex-wrap gap-2">
          {CONTEXTO_OPTIONS.map(opt => {
            const active = data.contextoObservado.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggleMulti('contextoObservado', opt)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                  active
                    ? 'text-white border-[#1F4E5F]'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-[#1F4E5F]/40'
                }`}
                style={active ? { background: '#1F4E5F' } : {}}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Seções de checklist */}
      <div className="space-y-2">
        {SECTIONS.map(sec => {
          const selected = (data[sec.id as keyof ChecklistRegenteData] as string[]) ?? [];
          const isOpen = openSection === sec.id;
          return (
            <div
              key={sec.id}
              className="rounded-xl border border-gray-200 bg-white overflow-hidden"
            >
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition"
                onClick={() => setOpenSection(isOpen ? null : sec.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{sec.emoji}</span>
                  <span className="text-sm font-bold text-gray-700">{sec.label}</span>
                  {selected.length > 0 && (
                    <span className="text-[10px] font-bold bg-[#1F4E5F] text-white px-2 py-0.5 rounded-full">
                      {selected.length}
                    </span>
                  )}
                </div>
                {isOpen ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-gray-100">
                  <div className="grid sm:grid-cols-2 gap-1.5 mt-2">
                    {sec.items.map(item => {
                      const checked2 = selected.includes(item);
                      return (
                        <label
                          key={item}
                          className={`flex items-start gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition border ${
                            checked2
                              ? 'bg-[#EFF6FF] border-[#1F4E5F]/30 text-[#1F4E5F]'
                              : 'bg-gray-50 border-gray-100 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-[#1F4E5F] shrink-0"
                            checked={checked2}
                            onChange={() => toggleMulti(sec.id, item)}
                          />
                          <span className="text-xs leading-snug">{item}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Observações livres */}
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
          Observações livres do professor <span className="text-red-400">*</span>
        </label>
        <textarea
          className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#1F4E5F]/30 outline-none bg-white resize-none"
          rows={5}
          placeholder="Descreva livremente o que observou durante o período — comportamentos, reações, situações específicas, conquistas, dificuldades não contempladas acima..."
          value={data.observacoesLivres}
          onChange={e => setField('observacoesLivres', e.target.value)}
        />
      </div>

      {/* Botões de ação */}
      <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition disabled:opacity-60"
        >
          {saving
            ? <><RefreshCw size={14} className="animate-spin" /> Salvando...</>
            : <><Save size={14} /> Salvar Checklist</>}
        </button>

        <button
          onClick={handleGenerateParecer}
          disabled={generatingParecer || !savedCode}
          title={!savedCode ? 'Salve primeiro para gerar o parecer' : 'Gerar parecer pedagógico com IA (3 créditos)'}
          className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl font-bold text-sm transition disabled:opacity-50"
          style={{ background: '#C69214' }}
        >
          {generatingParecer
            ? <><RefreshCw size={14} className="animate-spin" /> Gerando parecer...</>
            : <><Sparkles size={14} /> Gerar parecer da observação</>}
        </button>

        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border border-[#1F4E5F]/30 text-[#1F4E5F] hover:bg-[#F6F4EF] transition"
        >
          <Printer size={14} /> Imprimir / PDF
        </button>

        <button
          onClick={() => printRegenteEnem(student, school)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border border-[#C69214]/50 hover:bg-[#FFFBEB] transition"
          style={{ color: '#92610A' }}
          title="Gera checklist padronizado com códigos para leitura automática (sem custo de crédito)"
        >
          <ScanLine size={14} /> Checklist p/ leitura automática
        </button>

        {savedCode && (
          <div className="ml-auto flex items-center gap-1 text-xs text-gray-500">
            <ShieldCheck size={12} className="text-green-600" />
            <span className="font-mono">{savedCode}</span>
          </div>
        )}
      </div>

      {/* Parecer gerado */}
      {data.parecer && (
        <div className="rounded-2xl border-2 p-5 space-y-3" style={{ borderColor: '#C69214', background: '#FFFBEB' }}>
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: '#C69214' }} />
            <h4 className="font-bold text-sm text-gray-800">Parecer Pedagógico da IA</h4>
            {data.parecerGeneratedAt && (
              <span className="text-xs text-gray-400 ml-auto">
                {new Date(data.parecerGeneratedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">
            {data.parecer}
          </pre>
          <p className="text-[10px] text-gray-400 italic">
            Parecer gerado por IA com base exclusivamente nas observações registradas.
            Não substitui avaliação clínica ou laudo profissional.
          </p>
        </div>
      )}

      {/* Histórico de registros */}
      {records.length > 0 && (
        <div className="mt-2 pt-3 border-t border-dashed border-gray-200">
          <button
            onClick={() => setShowHistory(h => !h)}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition"
          >
            <History size={13} />
            Registros salvos ({records.length})
            {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2">
              {records.map((rec: any) => (
                <div
                  key={rec.id}
                  className="flex items-center gap-2 p-2.5 rounded-xl border border-[#E7E2D8]"
                  style={{ background: '#F6F4EF' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-700 truncate font-mono">
                      {rec.audit_code ?? `CHKL-${rec.id.substring(0, 8).toUpperCase()}`}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(rec.created_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                      {rec.created_by ? ` · ${rec.created_by}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      title="Carregar este registro"
                      onClick={() => handleLoadRecord(rec)}
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-[#1F4E5F] transition"
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      title="Excluir"
                      onClick={() => handleDeleteRecord(rec.id)}
                      disabled={deletingId === rec.id}
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-red-600 transition disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
