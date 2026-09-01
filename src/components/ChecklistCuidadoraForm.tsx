// components/ChecklistCuidadoraForm.tsx
// Análise de Rotina Semanal — Cuidadora
// Salva em observation_forms com form_type = 'checklist_cuidadora'
import React, { useState, useEffect, useCallback } from 'react';
import {
  Save, Sparkles, Printer, RefreshCw, ShieldCheck,
  ChevronDown, ChevronUp, History, Trash2, RotateCcw, ScanLine,
} from 'lucide-react';
import { printCuidadoraEnem } from './ChecklistEnemPDF';
import { Student, User, SchoolConfig } from '../types';
import { ObservationFormService, TimelineService } from '../services/persistenceService';
import { callAIGateway } from '../services/aiGatewayService';
import { AI_CREDIT_COSTS } from '../config/aiCosts';
import { DEMO_MODE } from '../services/supabase';
import { generateDocumentCode } from '../utils/documentCodes';
import { ChecklistExportRow } from './fichas/ChecklistExportRow';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ChecklistCuidadoraData {
  cuidadora: string;
  turno: string;
  semanaReferencia: string;
  dataPreenchimento: string;
  chegadaEscola: string[];
  alimentacao: string[];
  higieneBanheiro: string[];
  deslocamentoSeguranca: string[];
  comunicacaoNecessidades: string[];
  regulacaoEmocional: string[];
  interacaoSocial: string[];
  transicoesRotina: string[];
  estrategiasEficazes: string[];
  alertasSemana: string[];
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

export const TURNO_OPTIONS = ['Manhã', 'Tarde', 'Integral'];

export interface CheckSection {
  id: keyof ChecklistCuidadoraData;
  label: string;
  emoji: string;
  items: string[];
}

export const SECTIONS: CheckSection[] = [
  {
    id: 'chegadaEscola',
    label: '1. Chegada à Escola',
    emoji: '🏫',
    items: [
      'Chegou tranquilo',
      'Chegou choroso',
      'Chegou agitado',
      'Resistiu à entrada',
      'Precisou de acolhimento individual',
      'Separou-se bem da família',
      'Demonstrou cansaço',
      'Trouxe objeto de conforto',
    ],
  },
  {
    id: 'alimentacao',
    label: '2. Alimentação',
    emoji: '🍽️',
    items: [
      'Alimentou-se com autonomia',
      'Precisou de ajuda',
      'Recusou alimentação',
      'Apresentou seletividade alimentar',
      'Aceitou novos alimentos',
      'Bebeu água com lembrete',
      'Apresentou desconforto',
      'Necessitou supervisão constante',
    ],
  },
  {
    id: 'higieneBanheiro',
    label: '3. Higiene e Banheiro',
    emoji: '🚿',
    items: [
      'Usa banheiro com autonomia',
      'Solicita ir ao banheiro',
      'Precisa ser lembrado',
      'Precisa de ajuda parcial',
      'Precisa de ajuda total',
      'Teve escape',
      'Resistiu à higiene',
      'Aceitou rotina de higiene',
    ],
  },
  {
    id: 'deslocamentoSeguranca',
    label: '4. Deslocamento e Segurança',
    emoji: '🚶',
    items: [
      'Desloca-se com autonomia',
      'Precisa de acompanhamento',
      'Corre sem aviso',
      'Afasta-se do grupo',
      'Segue combinados com apoio',
      'Necessita supervisão em espaços abertos',
      'Apresenta risco em escadas/corredores',
      'Responde ao chamado do adulto',
    ],
  },
  {
    id: 'comunicacaoNecessidades',
    label: '5. Comunicação de Necessidades',
    emoji: '💬',
    items: [
      'Pede ajuda verbalmente',
      'Usa gestos/apontar',
      'Chora para comunicar',
      'Leva adulto até o objeto/local',
      'Usa palavras/frases curtas',
      'Não comunica necessidade',
      'Usa comunicação alternativa',
      'Demonstra desconforto por comportamento',
    ],
  },
  {
    id: 'regulacaoEmocional',
    label: '6. Regulação Emocional',
    emoji: '🧘',
    items: [
      'Manteve-se regulado',
      'Teve irritabilidade',
      'Apresentou choro',
      'Apresentou gritos',
      'Apresentou fuga/esquiva',
      'Teve crise',
      'Precisou de pausa',
      'Regulou-se com apoio',
      'Regulou-se com objeto/estratégia específica',
    ],
  },
  {
    id: 'interacaoSocial',
    label: '7. Interação Social',
    emoji: '🤝',
    items: [
      'Busca colegas',
      'Prefere ficar sozinho',
      'Aceita aproximação',
      'Rejeita aproximação',
      'Compartilha materiais com apoio',
      'Imita colegas',
      'Busca adulto com frequência',
      'Participa de brincadeiras',
    ],
  },
  {
    id: 'transicoesRotina',
    label: '8. Transições de Rotina',
    emoji: '🔄',
    items: [
      'Aceita troca de atividade',
      'Resiste a mudanças',
      'Precisa de aviso prévio',
      'Melhora com rotina visual',
      'Apresenta crise em transições',
      'Aceita encerramento da atividade',
      'Precisa de tempo extra',
      'Segue combinados com apoio',
    ],
  },
  {
    id: 'estrategiasEficazes',
    label: '9. Estratégias que Funcionaram',
    emoji: '✅',
    items: [
      'Rotina visual',
      'Antecipação verbal',
      'Comando curto',
      'Objeto de conforto',
      'Pausa sensorial',
      'Reforço positivo',
      'Música',
      'Redução de estímulos',
      'Espaço tranquilo',
      'Mediação individual',
    ],
  },
  {
    id: 'alertasSemana',
    label: '10. Alertas da Semana',
    emoji: '⚠️',
    items: [
      'Mudança de comportamento',
      'Sonolência excessiva',
      'Agitação incomum',
      'Recusa alimentar',
      'Crise recorrente',
      'Dificuldade de separação da família',
      'Sensibilidade sensorial acentuada',
      'Necessidade de comunicar família/equipe',
    ],
  },
];

const EMPTY_DATA: ChecklistCuidadoraData = {
  cuidadora: '',
  turno: '',
  semanaReferencia: '',
  dataPreenchimento: new Date().toISOString().split('T')[0],
  chegadaEscola: [],
  alimentacao: [],
  higieneBanheiro: [],
  deslocamentoSeguranca: [],
  comunicacaoNecessidades: [],
  regulacaoEmocional: [],
  interacaoSocial: [],
  transicoesRotina: [],
  estrategiasEficazes: [],
  alertasSemana: [],
  observacoesLivres: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toggle(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
}

function countChecked(data: ChecklistCuidadoraData): number {
  return SECTIONS.reduce((acc, s) => {
    const arr = data[s.id as keyof ChecklistCuidadoraData];
    return acc + (Array.isArray(arr) ? (arr as string[]).length : 0);
  }, 0);
}

function escH(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildCuidadoraPrintHtml(
  data: ChecklistCuidadoraData,
  student: Student,
  school?: SchoolConfig | null,
): string {
  const sectionHtml = SECTIONS.map(sec => {
    const selected = (data[sec.id as keyof ChecklistCuidadoraData] as string[]) ?? [];
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
        <h2>Parecer da Rotina — IA</h2>
        <div class="parecer-body">${escH(data.parecer).replace(/\n/g, '<br/>')}</div>
      </div>`
    : '';

  return `<!DOCTYPE html><html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Rotina Cuidadora — ${escH(student.name)}</title>
  <style>
    * { box-sizing: border-box; font-family: Arial, sans-serif; }
    body { margin: 0; padding: 24px; color: #1f2937; font-size: 11px; }
    header { border-bottom: 3px solid #1F4E5F; padding-bottom: 10px; margin-bottom: 14px; }
    h1 { color: #1F4E5F; font-size: 16px; margin: 0 0 4px; }
    .meta { color: #6b7280; font-size: 10px; line-height: 1.6; }
    section { margin: 8px 0; page-break-inside: avoid; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; }
    h2 { color: #1F4E5F; font-size: 11px; margin: 0 0 6px; font-weight: bold; }
    ul { margin: 0; padding: 0; list-style: none; columns: 2; column-gap: 14px; }
    li { padding: 2px 0; font-size: 10px; }
    li.checked { font-weight: bold; color: #1F4E5F; }
    .box { font-size: 10px; margin-right: 4px; }
    .obs { margin: 10px 0; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; }
    .parecer { margin: 12px 0; border: 2px solid #1F4E5F; border-radius: 6px; padding: 10px 12px; }
    .parecer h2 { color: #C69214; }
    .parecer-body { font-size: 10.5px; line-height: 1.55; white-space: pre-wrap; }
    .audit { text-align: right; color: #9ca3af; font-size: 9px; margin-top: 12px; border-top: 1px solid #e5e7eb; padding-top: 6px; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <header>
    <h1>Análise de Rotina Semanal — Cuidadora</h1>
    <div class="meta">
      Aluno: <strong>${escH(student.name)}</strong>${student.grade ? ` &nbsp;|&nbsp; Série: ${escH(student.grade)}` : ''}<br/>
      Cuidadora: ${escH(data.cuidadora || '—')} &nbsp;|&nbsp; Turno: ${escH(data.turno || '—')} &nbsp;|&nbsp; Semana: ${escH(data.semanaReferencia || '—')}<br/>
      Data de preenchimento: ${data.dataPreenchimento ? new Date(data.dataPreenchimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
      ${school?.schoolName ? `<br/>Escola: ${escH(school.schoolName)}` : ''}
      &nbsp;|&nbsp; Código: <strong>${escH(data.auditCode || '—')}</strong>
    </div>
  </header>

  ${sectionHtml}

  ${data.observacoesLivres
    ? `<div class="obs"><h2>Observações livres da cuidadora</h2><p>${escH(data.observacoesLivres).replace(/\n/g, '<br/>')}</p></div>`
    : ''}

  ${parecerHtml}

  <div class="audit">Documento gerado pelo IncluiAI &nbsp;|&nbsp; ${new Date().toLocaleString('pt-BR')} &nbsp;|&nbsp; ${escH(data.auditCode || '')}</div>
</body></html>`;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export const ChecklistCuidadoraForm: React.FC<Props> = ({ student, user, school, onSaved }) => {
  const [data, setData] = useState<ChecklistCuidadoraData>({ ...EMPTY_DATA });
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
      const mine = forms.filter((f: any) => f.form_type === 'checklist_cuidadora');
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

  const toggleMulti = (field: keyof ChecklistCuidadoraData, item: string) => {
    setData(prev => ({
      ...prev,
      [field]: toggle((prev[field] as string[]) ?? [], item),
    }));
  };

  const setField = (field: keyof ChecklistCuidadoraData, value: string) => {
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
      const payload: ChecklistCuidadoraData = { ...data, auditCode: code, savedAt: new Date().toISOString() };
      const savedId = await ObservationFormService.save({
        tenantId:   user.tenant_id,
        studentId:  student.id,
        userId:     user.id,
        formType:   'checklist_cuidadora',
        title:      'Análise de Rotina Semanal — Cuidadora',
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
        title:       'Análise de Rotina Semanal (Cuidadora) registrada',
        description: `Semana: ${data.semanaReferencia || '—'} · Código: ${code} — por ${user.name}`,
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
        const selected = (data[sec.id as keyof ChecklistCuidadoraData] as string[]) ?? [];
        if (!selected.length) return null;
        return `${sec.label}:\n${selected.map(i => `  - ${i}`).join('\n')}`;
      }).filter(Boolean).join('\n\n');

      const prompt = `Você é um(a) especialista em educação inclusiva e cuidado escolar.
Com base no registro semanal de rotina preenchido pela cuidadora/apoio escolar, elabore um PARECER PEDAGÓGICO DE ROTINA estruturado.

ALUNO: ${student.name}
SÉRIE/ANO: ${student.grade || 'não informado'}
CUIDADORA/APOIO: ${data.cuidadora || 'não informado'}
TURNO: ${data.turno || 'não informado'}
SEMANA DE REFERÊNCIA: ${data.semanaReferencia || 'não informado'}

ITENS MARCADOS NO REGISTRO DE ROTINA:
${sectionLines || 'Nenhum item marcado.'}

OBSERVAÇÕES LIVRES DA CUIDADORA:
${data.observacoesLivres || 'Nenhuma.'}

Elabore o parecer com as seguintes seções obrigatórias:
1. Síntese da rotina semanal
2. Pontos de atenção
3. Estratégias que funcionaram
4. Necessidades de apoio
5. Alertas para equipe escolar
6. Recomendações para próxima semana
7. Indicações para documentos futuros

REGRAS IMPORTANTES:
- Use linguagem de cuidado escolar e rotina pedagógica. Nunca diagnóstico clínico.
- Baseie-se APENAS nos itens registrados pela cuidadora. Não invente dados.
- O registro da cuidadora documenta rotina e cuidado escolar — nunca transforme em laudo clínico ou diagnóstico.
- Não use termos médicos clínicos, diagnósticos presumidos nem CID não fornecidos.
- Termos proibidos: "CID provável", "diagnóstico compatível com", "certamente apresenta", "provavelmente possui".
- Dado ausente → "Não observado nesta semana — recomenda-se monitoramento contínuo."
- Seja claro, respeitoso e objetivo. Escreva em português do Brasil.
- Máximo de 400 palavras no total.`;

      const { result } = await callAIGateway({
        task:             'text',
        prompt,
        creditsRequired:  AI_CREDIT_COSTS.ROTINA_CUIDADORA,
        requestType:      'cuidadora_parecer',
        studentId:        student.id,
      });

      const updatedData = {
        ...data,
        parecer:            result,
        parecerGeneratedAt: new Date().toISOString(),
      };
      setData(updatedData);

      // Persiste o parecer no registro existente
      if (!DEMO_MODE && user.tenant_id && savedCode) {
        const allForms = await ObservationFormService.getForStudent(student.id);
        const existing = allForms.find(
          (r: any) => r.form_type === 'checklist_cuidadora' && r.audit_code === savedCode,
        );
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
    const html = buildCuidadoraPrintHtml(data, student, school);
    const win = window.open('', '_blank', 'width=900,height=750');
    if (!win) { alert('Permita pop-ups para imprimir.'); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  };

  // ─── Histórico ────────────────────────────────────────────────────────────────

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
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            Cuidadora / Apoio responsável
          </label>
          <input
            className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#1F4E5F]/30 outline-none bg-white"
            placeholder="Nome da cuidadora ou apoio escolar"
            value={data.cuidadora}
            onChange={e => setField('cuidadora', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            Turno
          </label>
          <div className="flex gap-2">
            {TURNO_OPTIONS.map(opt => {
              const active = data.turno === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setField('turno', active ? '' : opt)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
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
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            Semana de referência
          </label>
          <input
            className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#1F4E5F]/30 outline-none bg-white"
            placeholder="Ex: 12/05 a 16/05/2025"
            value={data.semanaReferencia}
            onChange={e => setField('semanaReferencia', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            Data de preenchimento
          </label>
          <input
            type="date"
            className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#1F4E5F]/30 outline-none bg-white"
            value={data.dataPreenchimento}
            onChange={e => setField('dataPreenchimento', e.target.value)}
          />
        </div>
      </div>

      {/* Seções de checklist */}
      <div className="space-y-2">
        {SECTIONS.map(sec => {
          const selected = (data[sec.id as keyof ChecklistCuidadoraData] as string[]) ?? [];
          const isOpen = openSection === sec.id;
          // Alertas da semana tem destaque visual diferente
          const isAlert = sec.id === 'alertasSemana';
          return (
            <div
              key={sec.id}
              className="rounded-xl border overflow-hidden"
              style={{
                borderColor: isAlert && selected.length > 0 ? '#FCA5A5' : '#E5E7EB',
                background: isAlert && selected.length > 0 ? '#FFF5F5' : '#FFFFFF',
              }}
            >
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition"
                onClick={() => setOpenSection(isOpen ? null : sec.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{sec.emoji}</span>
                  <span className={`text-sm font-bold ${isAlert ? 'text-red-700' : 'text-gray-700'}`}>
                    {sec.label}
                  </span>
                  {selected.length > 0 && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ background: isAlert ? '#DC2626' : '#1F4E5F' }}
                    >
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
                      const isChecked = selected.includes(item);
                      return (
                        <label
                          key={item}
                          className={`flex items-start gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition border ${
                            isChecked
                              ? isAlert
                                ? 'bg-red-50 border-red-300 text-red-800'
                                : 'bg-[#EFF6FF] border-[#1F4E5F]/30 text-[#1F4E5F]'
                              : 'bg-gray-50 border-gray-100 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 shrink-0"
                            style={{ accentColor: isAlert ? '#DC2626' : '#1F4E5F' }}
                            checked={isChecked}
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
          Observações livres da cuidadora <span className="text-red-400">*</span>
        </label>
        <textarea
          className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#1F4E5F]/30 outline-none bg-white resize-none"
          rows={5}
          placeholder="Descreva livremente o que observou durante a semana — situações específicas, mudanças de comportamento, conquistas, necessidades não contempladas acima..."
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
          title={!savedCode ? 'Salve primeiro para gerar o parecer' : 'Gerar parecer da rotina com IA (3 créditos)'}
          className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl font-bold text-sm transition disabled:opacity-50"
          style={{ background: '#C69214' }}
        >
          {generatingParecer
            ? <><RefreshCw size={14} className="animate-spin" /> Gerando parecer...</>
            : <><Sparkles size={14} /> Gerar parecer da rotina</>}
        </button>

        <button
          onClick={() => printCuidadoraEnem(student, school)}
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

      {/* [FASE 2 · BLOCO B] Documento final: PDF real + Word (.docx) + Google Docs + Imprimir */}
      <ChecklistExportRow
        variant="cuidadora"
        data={data}
        student={student}
        user={user}
        school={school}
        auditCode={savedCode ?? data.auditCode ?? null}
        onPrint={handlePrint}
      />

      {/* Parecer gerado */}
      {data.parecer && (
        <div className="rounded-2xl border-2 p-5 space-y-3" style={{ borderColor: '#C69214', background: '#FFFBEB' }}>
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: '#C69214' }} />
            <h4 className="font-bold text-sm text-gray-800">Parecer da Rotina — IA</h4>
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
            Parecer gerado por IA com base exclusivamente nos registros da cuidadora.
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
                      {rec.audit_code ?? `CUID-${rec.id.substring(0, 8).toUpperCase()}`}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(rec.created_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                      {rec.created_by ? ` · ${rec.created_by}` : ''}
                      {rec.fields_data?.semanaReferencia ? ` · Semana: ${rec.fields_data.semanaReferencia}` : ''}
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
