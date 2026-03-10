// views/FichasComplementaresView.tsx
// Tarefa 6: Fichas rápidas para impressão e registro de processo
import React, { useState } from 'react';
import { Student, User } from '../types';
import { ClipboardCheck, Printer, Download, ChevronDown, ChevronUp, ShieldCheck, X, Save } from 'lucide-react';
import { SmartTextarea } from '../components/SmartTextarea';
import { ObservationFormService, TimelineService } from '../services/persistenceService';
import { DEMO_MODE } from '../services/supabase';

interface Props {
  students: Student[];
  user: User;
}

// ─── Definição das fichas ─────────────────────────────────────────────────────
interface FichaField {
  id: string;
  label: string;
  type: 'textarea' | 'text' | 'select' | 'date' | 'scale';
  placeholder?: string;
  options?: string[];
}

interface FichaTemplate {
  id: string;
  title: string;
  description: string;
  color: string;
  icon: string;
  fields: FichaField[];
}

const FICHAS: FichaTemplate[] = [
  {
    id: 'obs_regente',
    title: 'Observação do Professor Regente',
    description: 'Registro das observações do professor da sala comum sobre o aluno.',
    color: 'blue',
    icon: '👩‍🏫',
    fields: [
      { id: 'data_obs', label: 'Data da Observação', type: 'date' },
      { id: 'comportamento', label: 'Comportamento em Sala', type: 'textarea', placeholder: 'Descreva o comportamento, interações e participação do aluno...' },
      { id: 'aprendizagem', label: 'Evolução na Aprendizagem', type: 'textarea', placeholder: 'Como o aluno está respondendo às atividades e estratégias?' },
      { id: 'estrategias', label: 'Estratégias Utilizadas', type: 'textarea', placeholder: 'Quais recursos e adaptações foram aplicados?' },
      { id: 'encaminhamentos', label: 'Encaminhamentos Necessários', type: 'textarea', placeholder: 'Há necessidade de acionar outros profissionais ou família?' },
      { id: 'nivel', label: 'Nível Geral de Desempenho', type: 'scale' },
    ],
  },
  {
    id: 'escuta_familia',
    title: 'Escuta da Família',
    description: 'Registro da conversa com o responsável sobre o desenvolvimento do aluno.',
    color: 'green',
    icon: '👨‍👩‍👧',
    fields: [
      { id: 'data_reuniao', label: 'Data da Reunião/Contato', type: 'date' },
      { id: 'responsavel', label: 'Nome do Responsável Presente', type: 'text', placeholder: 'Nome e grau de parentesco' },
      { id: 'relato_familia', label: 'Relato da Família', type: 'textarea', placeholder: 'O que a família observa em casa? Rotinas, comportamentos, aprendizagem...' },
      { id: 'preocupacoes', label: 'Preocupações Sinalizadas', type: 'textarea', placeholder: 'Quais as principais preocupações relatadas pela família?' },
      { id: 'acordo', label: 'Acordos e Comprometimentos', type: 'textarea', placeholder: 'O que foi combinado com a família para apoiar o aluno?' },
      { id: 'proxima_data', label: 'Próximo Contato Previsto', type: 'date' },
    ],
  },
  {
    id: 'analise_aee',
    title: 'Análise do AEE',
    description: 'Parecer do professor de AEE sobre o atendimento especializado.',
    color: 'purple',
    icon: '🎯',
    fields: [
      { id: 'data_aee', label: 'Data do Atendimento', type: 'date' },
      { id: 'periodo', label: 'Período de Referência', type: 'text', placeholder: 'Ex: Março/2025 – Junho/2025' },
      { id: 'descricao_at', label: 'Descrição das Atividades', type: 'textarea', placeholder: 'Que atividades foram desenvolvidas no AEE?' },
      { id: 'evolucao_obs', label: 'Evolução Observada', type: 'textarea', placeholder: 'Como o aluno evoluiu nos critérios de acompanhamento?' },
      { id: 'recursos', label: 'Recursos e TA Utilizados', type: 'textarea', placeholder: 'Tecnologias Assistivas e materiais adaptados utilizados...' },
      { id: 'comunicacao', label: 'Articulação com Sala Comum', type: 'textarea', placeholder: 'Como está a articulação com o professor regente?' },
      { id: 'nivel_aee', label: 'Evolução Geral (Escala)', type: 'scale' },
    ],
  },
  {
    id: 'decisao_institucional',
    title: 'Decisão Institucional',
    description: 'Registro formal da decisão da equipe sobre os próximos passos do aluno.',
    color: 'red',
    icon: '⚖️',
    fields: [
      { id: 'data_decisao', label: 'Data da Reunião Institucional', type: 'date' },
      {
        id: 'presentes',
        label: 'Pessoas Envolvidas',
        type: 'select',
        options: ['Professor Regente', 'AEE', 'Coordenação', 'Família', 'Gestão', 'Psicólogo', 'Fonoaudiólogo', 'Outro'],
        placeholder: 'Selecione quem participou...'
      },
      { id: 'diagnostico_equipe', label: 'Síntese Diagnóstica da Equipe', type: 'textarea', placeholder: 'Qual a conclusão da equipe sobre o aluno?' },
      {
        id: 'decisao',
        label: 'Decisão Tomada',
        type: 'select',
        options: [
          'Encaminhar para PEI',
          'Encaminhar para PAEE',
          'Manter em acompanhamento',
          'Encaminhar para avaliação externa',
          'Encaminhar para Secretaria de Educação',
          'Outra decisão',
        ],
      },
      { id: 'justificativa', label: 'Justificativa da Decisão', type: 'textarea', placeholder: 'Por que esta foi a decisão tomada?' },
      { id: 'proximos_passos', label: 'Próximos Passos', type: 'textarea', placeholder: 'Quais ações serão tomadas a partir desta decisão?' },
    ],
  },
  {
    id: 'acompanhamento_evolucao',
    title: 'Acompanhamento / Evolução',
    description: 'Ficha de acompanhamento periódico do desenvolvimento do aluno.',
    color: 'orange',
    icon: '📈',
    fields: [
      { id: 'data_acomp', label: 'Data do Registro', type: 'date' },
      { id: 'periodo_ref', label: 'Período de Referência', type: 'text', placeholder: 'Bimestre, semestre, etc.' },
      { id: 'metas_atingidas', label: 'Metas Atingidas', type: 'textarea', placeholder: 'Quais metas do PEI/PAEE foram alcançadas?' },
      { id: 'metas_andamento', label: 'Metas em Andamento', type: 'textarea', placeholder: 'Quais estão em desenvolvimento?' },
      { id: 'ajustes', label: 'Ajustes Necessários', type: 'textarea', placeholder: 'O que precisa ser revisado ou adaptado?' },
      { id: 'comunicado_familia', label: 'Comunicação com a Família', type: 'textarea', placeholder: 'O que foi comunicado à família?' },
      { id: 'nivel_geral', label: 'Nível Geral de Evolução', type: 'scale' },
    ],
  },
];

// ─── Cores por tipo de ficha ──────────────────────────────────────────────────
const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-800',   badge: 'bg-blue-100 text-blue-700' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-800',  badge: 'bg-green-100 text-green-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700' },
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-800',    badge: 'bg-red-100 text-red-700' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', badge: 'bg-orange-100 text-orange-700' },
};

function makeAuditCode(fichaId: string) {
  let h = 0;
  const s = fichaId + Date.now().toString();
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return `FICHA-${Math.abs(h).toString(16).toUpperCase().slice(0, 8)}`;
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export const FichasComplementaresView: React.FC<Props> = ({ students, user }) => {
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [expandedFicha, setExpandedFicha] = useState<string | null>(null);
  const [fichaValues, setFichaValues] = useState<Record<string, Record<string, string>>>({});
  const [savedFichas, setSavedFichas] = useState<Record<string, { code: string; savedAt: string }>>({});

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  const updateField = (fichaId: string, fieldId: string, value: string) => {
    setFichaValues(prev => ({
      ...prev,
      [fichaId]: { ...(prev[fichaId] || {}), [fieldId]: value },
    }));
  };

  const getVal = (fichaId: string, fieldId: string) => fichaValues[fichaId]?.[fieldId] || '';

  const handleSaveFicha = async (fichaId: string) => {
    if (!selectedStudent) return alert('Selecione um aluno antes de salvar.');
    const code = makeAuditCode(fichaId + (selectedStudentId || ''));
    const ficha = FICHAS.find(f => f.id === fichaId);

    if (!DEMO_MODE && user.tenant_id && selectedStudentId) {
      try {
        const savedId = await ObservationFormService.save({
          tenantId:   user.tenant_id,
          studentId:  selectedStudentId,
          userId:     user.id,
          formType:   fichaId,
          title:      ficha?.title || fichaId,
          fieldsData: fichaValues[fichaId] || {},
          auditCode:  code,
          createdBy:  user.name,
          status:     'finalizado',
        });

        // Timeline: ficha preenchida
        if (savedId) {
          await TimelineService.add({
            tenantId:    user.tenant_id,
            studentId:   selectedStudentId,
            eventType:   'ficha',
            title:       `Ficha preenchida: ${ficha?.title || fichaId}`,
            description: `Código: ${code} — por ${user.name}`,
            linkedId:    savedId,
            linkedTable: 'observation_forms',
            icon:        'ClipboardCheck',
            author:      user.name,
          });
        }
      } catch (e) {
        console.error('[FichasComplementaresView] erro ao salvar ficha:', e);
      }
    }

    setSavedFichas(prev => ({ ...prev, [fichaId]: { code, savedAt: new Date().toISOString() } }));
    alert(`Ficha salva!\nCódigo: ${code}`);
  };

  const handlePrintFicha = async (ficha: FichaTemplate) => {
    if (!selectedStudent) return alert('Selecione um aluno primeiro.');

    const auditCode = savedFichas[ficha.id]?.code || makeAuditCode(ficha.id + selectedStudentId);
    const vals = fichaValues[ficha.id] || {};
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const colors = COLOR_MAP[ficha.color];

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 170mm; margin: 0 auto; color: #111; font-size: 11px;">
        <!-- Cabeçalho -->
        <div style="background: #5b21b6; color: white; padding: 12px 16px; border-radius: 8px 8px 0 0; margin-bottom: 0;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="font-size: 10px; opacity: 0.8; margin-bottom: 2px;">IncluiAI — Ficha Complementar</div>
              <div style="font-size: 15px; font-weight: bold;">${ficha.icon} ${ficha.title}</div>
            </div>
            <div style="text-align: right; font-family: monospace; font-size: 8px; opacity: 0.85;">
              <div>Código Auditável</div>
              <div style="font-weight: bold;">${auditCode}</div>
            </div>
          </div>
        </div>
        <!-- Sub-cabeçalho -->
        <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-top: none; padding: 8px 16px; margin-bottom: 12px; display: flex; justify-content: space-between;">
          <span><strong>Aluno:</strong> ${selectedStudent.name} | <strong>Série:</strong> ${selectedStudent.grade}</span>
          <span><strong>Data:</strong> ${dateStr}</span>
        </div>
        <!-- Campos -->
        ${ficha.fields.map(f => {
          const val = vals[f.id] || '—';
          if (f.type === 'scale') {
            const n = parseInt(val) || 0;
            const stars = '★'.repeat(n) + '☆'.repeat(5 - n);
            return `<div style="margin-bottom: 10px; break-inside: avoid;">
              <div style="font-size: 9px; font-weight: bold; color: #5b21b6; text-transform: uppercase; margin-bottom: 3px;">${f.label}</div>
              <div style="font-size: 14px; color: #f59e0b;">${stars}</div>
            </div>`;
          }
          return `<div style="margin-bottom: 10px; break-inside: avoid;">
            <div style="font-size: 9px; font-weight: bold; color: #5b21b6; text-transform: uppercase; margin-bottom: 3px;">${f.label}</div>
            <div style="min-height: 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 6px 8px; white-space: pre-wrap;">${val}</div>
          </div>`;
        }).join('')}
        <!-- Assinatura -->
        <div style="margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
          ${['Profissional Responsável', 'Coordenação', 'Responsável pelo Aluno'].map(sig => `
            <div style="text-align: center;">
              <div style="border-top: 1px solid #374151; margin-bottom: 4px; margin-top: 20px;"></div>
              <div style="font-size: 8px; color: #6b7280;">${sig}</div>
            </div>
          `).join('')}
        </div>
        <!-- Rodapé auditável -->
        <div style="margin-top: 16px; padding-top: 8px; border-top: 1px dashed #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 8px; color: #6b7280;">Gerado em ${now.toLocaleString('pt-BR')} por ${user.name}</div>
          <div style="font-size: 8px; font-family: monospace; color: #5b21b6; font-weight: bold;">${auditCode}</div>
          <div style="font-size: 8px; color: #6b7280;">incluiai.com/validar/${auditCode}</div>
        </div>
      </div>
    `;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:white;overflow:auto;padding:20mm;';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    const style = document.createElement('style');
    style.textContent = '@page{size:A4;margin:20mm} @media print{body>*:not(#__print_fichas__){display:none!important}}';
    overlay.id = '__print_fichas__';
    document.head.appendChild(style);

    const prevTitle = document.title;
    document.title = `${ficha.title} — ${selectedStudent.name}`;
    await new Promise(r => setTimeout(r, 80));
    window.print();

    setTimeout(() => {
      document.title = prevTitle;
      overlay.remove();
      style.remove();
    }, 500);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ClipboardCheck className="text-brand-600" size={26}/> Fichas Complementares
          </h2>
          <p className="text-gray-500 text-sm mt-1">Documentação de processo: observações, escuta familiar, decisões institucionais e acompanhamento.</p>
        </div>
      </div>

      {/* Seleção de Aluno — apenas em triagem */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 shadow-sm">
        <div className="flex items-start gap-3 mb-3 bg-yellow-50 border border-yellow-100 rounded-xl p-3">
          <span className="text-xl shrink-0">🔍</span>
          <div>
            <p className="text-sm font-bold text-yellow-800">Fichas de Observação — exclusivo para alunos em Triagem</p>
            <p className="text-xs text-yellow-700 mt-0.5">Para alunos com laudo, utilize os documentos oficiais (Estudo de Caso, PEI, PAEE).</p>
          </div>
        </div>
        <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Aluno em Triagem</label>
        <select
          className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          value={selectedStudentId}
          onChange={e => setSelectedStudentId(e.target.value)}
        >
          <option value="">Selecione o aluno...</option>
          {students.filter(s => s.tipo_aluno === 'em_triagem' || !s.tipo_aluno).map(s => (
            <option key={s.id} value={s.id}>{s.name} {s.grade ? `— ${s.grade}` : ''}</option>
          ))}
        </select>
        {students.filter(s => s.tipo_aluno === 'em_triagem').length === 0 && (
          <p className="text-xs text-gray-400 italic mt-2">Nenhum aluno em triagem cadastrado. Crie um em "Meus Alunos → Aluno em Triagem".</p>
        )}
      </div>

      {/* Lista de Fichas */}
      <div className="space-y-4">
        {FICHAS.map(ficha => {
          const colors = COLOR_MAP[ficha.color];
          const isOpen = expandedFicha === ficha.id;
          const isSaved = !!savedFichas[ficha.id];

          return (
            <div key={ficha.id} className={`bg-white border ${colors.border} rounded-2xl overflow-hidden shadow-sm transition-all`}>
              {/* Cabeçalho da ficha */}
              <button
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition"
                onClick={() => setExpandedFicha(isOpen ? null : ficha.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{ficha.icon}</span>
                  <div>
                    <h3 className={`font-bold text-base ${colors.text}`}>{ficha.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{ficha.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isSaved && (
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      <ShieldCheck size={10}/> Salvo
                    </span>
                  )}
                  {isOpen ? <ChevronUp size={18} className="text-gray-400"/> : <ChevronDown size={18} className="text-gray-400"/>}
                </div>
              </button>

              {/* Conteúdo expandido */}
              {isOpen && (
                <div className={`${colors.bg} border-t ${colors.border} p-5`}>
                  {!selectedStudent && (
                    <div className="text-center py-6 text-sm text-gray-500">
                      ↑ Selecione um aluno acima para preencher esta ficha.
                    </div>
                  )}

                  {selectedStudent && (
                    <>
                      {/* Info do aluno */}
                      <div className="flex items-center gap-2 mb-4 text-xs text-gray-600 bg-white/60 px-3 py-2 rounded-lg border border-white/80">
                        <span className="font-bold">{selectedStudent.name}</span>
                        <span>·</span><span>{selectedStudent.grade}</span>
                        <span>·</span><span>{selectedStudent.diagnosis.join(', ') || 'Sem diagnóstico'}</span>
                      </div>

                      {/* Campos da ficha */}
                      <div className="space-y-4">
                        {ficha.fields.map(field => (
                          <div key={field.id}>
                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                              {field.label}
                            </label>
                            {field.type === 'textarea' && (
                              <div className="space-y-1">
                                <SmartTextarea
                                  value={getVal(ficha.id, field.id)}
                                  onChange={v => updateField(ficha.id, field.id, v)}
                                  placeholder={field.placeholder}
                                  context="general"
                                />
                              </div>
                            )}
                            {field.type === 'text' && (
                              <input
                                className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                                placeholder={field.placeholder}
                                value={getVal(ficha.id, field.id)}
                                onChange={e => updateField(ficha.id, field.id, e.target.value)}
                              />
                            )}
                            {field.type === 'date' && (
                              <input
                                type="date"
                                className="border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                                value={getVal(ficha.id, field.id)}
                                onChange={e => updateField(ficha.id, field.id, e.target.value)}
                              />
                            )}
                            {field.type === 'select' && field.id === 'presentes' && (
                              <div className="flex flex-wrap gap-2">
                                {field.options?.map(opt => {
                                  const current: string[] = (() => { try { return JSON.parse(getVal(ficha.id, field.id) || '[]'); } catch { return []; } })();
                                  const active = current.includes(opt);
                                  return (
                                    <button key={opt} type="button"
                                      onClick={() => {
                                        const next = active ? current.filter(x => x !== opt) : [...current, opt];
                                        updateField(ficha.id, field.id, JSON.stringify(next));
                                      }}
                                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${active ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-brand-300'}`}
                                    >{opt}</button>
                                  );
                                })}
                              </div>
                            )}
                            {field.type === 'select' && field.id !== 'presentes' && (
                              <select
                                className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                                value={getVal(ficha.id, field.id)}
                                onChange={e => updateField(ficha.id, field.id, e.target.value)}
                              >
                                <option value="">Selecione...</option>
                                {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            )}
                            {field.type === 'scale' && (
                              <div className="flex gap-3 items-center">
                                {[1, 2, 3, 4, 5].map(v => (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() => updateField(ficha.id, field.id, String(v))}
                                    className={`w-10 h-10 rounded-full font-bold text-sm border-2 transition ${
                                      getVal(ficha.id, field.id) === String(v)
                                        ? 'bg-brand-600 border-brand-600 text-white shadow-md scale-110'
                                        : 'bg-white border-gray-200 text-gray-500 hover:border-brand-300'
                                    }`}
                                  >{v}</button>
                                ))}
                                <span className="text-xs text-gray-400 ml-2">
                                  {getVal(ficha.id, field.id) ? `${getVal(ficha.id, field.id)}/5` : '—'}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Botões */}
                      <div className="flex gap-3 mt-6 pt-4 border-t border-white/60">
                        <button
                          onClick={() => handleSaveFicha(ficha.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition"
                        >
                          <Save size={14}/> Salvar Ficha
                        </button>
                        <button
                          onClick={() => handlePrintFicha(ficha)}
                          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl font-bold text-sm hover:bg-brand-700 transition"
                        >
                          <Printer size={14}/> Imprimir / PDF
                        </button>
                        {isSaved && (
                          <div className="ml-auto flex items-center gap-1 text-xs text-gray-500">
                            <ShieldCheck size={12} className="text-green-600"/>
                            <span className="font-mono">{savedFichas[ficha.id].code}</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
