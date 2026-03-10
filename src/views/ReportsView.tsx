// ReportsView.tsx — UI Premium com gráficos SVG (radar + barras), modais premium
import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart3, Save, Printer, Plus, Calendar, User as UserIcon, History,
  Lock, TrendingUp, Download, Trash2, CheckCircle, ShieldCheck,
  Mic, X, Edit2, ChevronDown, ChevronUp, Sparkles, Type
} from 'lucide-react';
import { Student, StudentEvolution, PlanTier, getPlanLimits, DocField } from '../types';
import { ExportService } from '../services/exportService';
import { SmartTextarea } from '../components/SmartTextarea';
import { AudioRecorder } from '../components/AudioRecorder';
import { StudentProfileService, TimelineService } from '../services/persistenceService';
import { DEMO_MODE } from '../services/supabase';

const CRITERIA = [
  { name: "Comunicação Expressiva", desc: "Expressão verbal, gestual ou alternativa." },
  { name: "Interação Social",       desc: "Qualidade das trocas com pares e adultos." },
  { name: "Autonomia (AVD)",        desc: "Independência em atividades de vida diária." },
  { name: "Autorregulação",         desc: "Gerenciamento de emoções e frustrações." },
  { name: "Atenção Sustentada",     desc: "Foco e conclusão de tarefas." },
  { name: "Compreensão",            desc: "Entender instruções e conteúdos." },
  { name: "Motricidade Fina",       desc: "Escrita, recorte, encaixe, manipulação." },
  { name: "Motricidade Grossa",     desc: "Equilíbrio, coordenação e deslocamento." },
  { name: "Participação",           desc: "Engajamento nas atividades e rotina." },
  { name: "Linguagem/Leitura",      desc: "Evolução em leitura e escrita." },
];

interface ReportsViewProps {
  students: Student[];
  onUpdateStudent: (student: Student) => void;
  currentUser: any;
  currentPlan: PlanTier;
}

// ── Gráfico Radar SVG ─────────────────────────────────────────────────────────
const RadarChart: React.FC<{ scores: number[]; size?: number }> = ({ scores, size = 280 }) => {
  const n = scores.length;
  const cx = size / 2, cy = size / 2;
  const R = size * 0.36;
  const angle = (i: number) => (i * 2 * Math.PI) / n - Math.PI / 2;
  const pt = (i: number, r: number) => `${cx + r * Math.cos(angle(i))},${cy + r * Math.sin(angle(i))}`;

  const polygon = scores.map((s, i) => pt(i, (s / 5) * R)).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* grid */}
      {[0.2, 0.4, 0.6, 0.8, 1].map(f => (
        <polygon key={f}
          points={Array.from({ length: n }, (_, i) => pt(i, R * f)).join(' ')}
          fill="none" stroke="#e5e7eb" strokeWidth="1"
        />
      ))}
      {/* axes */}
      {Array.from({ length: n }, (_, i) => (
        <line key={i} x1={cx} y1={cy} x2={cx + R * Math.cos(angle(i))} y2={cy + R * Math.sin(angle(i))} stroke="#d1d5db" strokeWidth="1" />
      ))}
      {/* data */}
      <polygon points={polygon} fill="rgba(139,92,246,0.18)" stroke="#7c3aed" strokeWidth="2.5" strokeLinejoin="round" />
      {/* dots */}
      {scores.map((s, i) => {
        const r = (s / 5) * R;
        return <circle key={i} cx={cx + r * Math.cos(angle(i))} cy={cy + r * Math.sin(angle(i))} r={4} fill="#7c3aed" />;
      })}
    </svg>
  );
};

// ── Gráfico Barras SVG ────────────────────────────────────────────────────────
const BarChart: React.FC<{ scores: number[]; labels: string[] }> = ({ scores, labels }) => {
  const H = 120, W = 440, pad = 4;
  const barW = (W - pad * (scores.length + 1)) / scores.length;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 24}`} className="overflow-visible">
      {scores.map((s, i) => {
        const h = (s / 5) * H;
        const x = pad + i * (barW + pad);
        const y = H - h;
        const pct = Math.round((s / 5) * 100);
        const color = s >= 4 ? '#16a34a' : s >= 3 ? '#7c3aed' : s >= 2 ? '#d97706' : '#dc2626';
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} rx={4} fill={color} opacity={0.85} />
            <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={9} fill={color} fontWeight="bold">{pct}%</text>
            <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize={7} fill="#6b7280">{labels[i]?.substring(0, 6)}</text>
          </g>
        );
      })}
    </svg>
  );
};

// ── Modal Premium Add Critério / Campo ────────────────────────────────────────
const AddFieldModal: React.FC<{
  mode: 'scale' | 'text';
  onAdd: (field: DocField) => void;
  onClose: () => void;
}> = ({ mode, onAdd, onClose }) => {
  const [label, setLabel] = useState('');
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(5);
  const [withAudio, setWithAudio] = useState(true);

  const handleCreate = () => {
    if (!label.trim()) return;
    const f: DocField = {
      id: crypto.randomUUID(),
      label: label.trim(),
      type: mode === 'scale' ? 'scale' : 'textarea',
      value: mode === 'scale' ? min : '',
      minScale: mode === 'scale' ? min : undefined,
      maxScale: mode === 'scale' ? max : undefined,
      allowAudio: withAudio ? 'optional' : 'none',
      isCustom: true,
    };
    onAdd(f);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            {mode === 'scale' ? <><BarChart3 size={18} className="text-brand-600"/> Novo Critério de Avaliação</> : <><Type size={18} className="text-brand-600"/> Novo Campo de Observação</>}
          </h3>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-700"/></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Nome do {mode === 'scale' ? 'Critério' : 'Campo'} *</label>
            <input autoFocus className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-500 outline-none" value={label} onChange={e => setLabel(e.target.value)} placeholder={mode === 'scale' ? 'Ex: Participação em Grupo' : 'Ex: Observação Motora'} />
          </div>
          {mode === 'scale' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Valor Mínimo</label>
                <input type="number" min={0} max={4} className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-500 outline-none" value={min} onChange={e => setMin(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Valor Máximo</label>
                <input type="number" min={2} max={10} className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-500 outline-none" value={max} onChange={e => setMax(Number(e.target.value))} />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div>
              <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><Mic size={14} className="text-brand-600"/> Transcrição por Áudio</p>
              <p className="text-xs text-gray-500">Permitir gravação de voz neste campo</p>
            </div>
            <button type="button" onClick={() => setWithAudio(!withAudio)} className={`relative w-11 h-6 rounded-full transition-colors ${withAudio ? 'bg-brand-600' : 'bg-gray-300'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${withAudio ? 'left-6' : 'left-1'}`}/>
            </button>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleCreate} className="flex-1 bg-brand-600 text-white py-2.5 rounded-xl font-bold hover:bg-brand-700 text-sm">Criar {mode === 'scale' ? 'Critério' : 'Campo'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export const ReportsView: React.FC<ReportsViewProps> = ({ students, onUpdateStudent, currentUser, currentPlan }) => {
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [scores, setScores] = useState<number[]>(new Array(10).fill(1));
  const [observation, setObservation] = useState('');
  const [customFields, setCustomFields] = useState<DocField[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [auditCode, setAuditCode] = useState('');
  const [showChart, setShowChart] = useState<'radar' | 'barras'>('radar');
  const [addModal, setAddModal] = useState<'scale' | 'text' | null>(null);

  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const planLimits = getPlanLimits(currentPlan);
  const isReadOnly = !!selectedHistoryId;

  useEffect(() => {
    if (!selectedStudent) { setScores(new Array(10).fill(1)); setObservation(''); setCustomFields([]); setAuditCode(''); return; }
    if (selectedHistoryId) {
      const h = selectedStudent.evolutions?.find(e => e.id === selectedHistoryId);
      if (h) { setScores(h.scores); setObservation(h.observation); setCustomFields(h.customFields || []); setAuditCode(`EVO-${h.id.substring(0,8).toUpperCase()}`); }
    } else {
      setScores(new Array(10).fill(1)); setObservation(''); setCustomFields([]); setAuditCode('');
    }
  }, [selectedStudentId, selectedHistoryId]);

  const handleSave = async () => {
    if (!selectedStudent || isReadOnly) return;
    const now = new Date().toISOString();
    const evo: StudentEvolution = {
      id: crypto.randomUUID(), date: now, createdAt: now,
      createdBy: currentUser?.name || 'Usuário',
      scores, observation, customFields, author: currentUser?.name || 'Usuário',
    } as any;

    // 1. Salva no estado/banco legado (students.data.evolutions)
    onUpdateStudent({ ...selectedStudent, evolutions: [evo, ...(selectedStudent.evolutions || [])] });

    // 2. Salva em student_profiles (tabela Sprint 2)
    if (!DEMO_MODE && currentUser?.tenant_id && selectedStudent?.id) {
      try {
        const profileId = await StudentProfileService.save({
          tenantId:    currentUser.tenant_id,
          studentId:   selectedStudent.id,
          scores,
          observation,
          evaluatedBy: currentUser?.name || 'Usuário',
        });

        // 3. Timeline: perfil cognitivo atualizado
        if (profileId) {
          await TimelineService.add({
            tenantId:    currentUser.tenant_id,
            studentId:   selectedStudent.id,
            eventType:   'evolucao',
            title:       'Perfil cognitivo atualizado',
            description: `Média: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}/5 — por ${currentUser?.name || 'Usuário'}`,
            linkedId:    profileId,
            linkedTable: 'student_profiles',
            icon:        'Brain',
            author:      currentUser?.name || 'Usuário',
          });
        }
      } catch (e) {
        console.error('[ReportsView] erro ao salvar student_profile:', e);
      }
    }

    alert('Relatório Evolutivo salvo!');
    setScores(new Array(10).fill(1)); setObservation(''); setCustomFields([]);
  };

  const addField = (f: DocField) => setCustomFields(prev => [...prev, f]);
  const updateField = (id: string, up: Partial<DocField>) => setCustomFields(prev => prev.map(f => f.id === id ? { ...f, ...up } : f));
  const removeField = (id: string) => { if (confirm('Remover campo?')) setCustomFields(prev => prev.filter(f => f.id !== id)); };

  const handleExportPDF = async () => {
    if (!selectedStudent) return;
    try {
      const school = currentUser?.schoolConfigs?.[0] ?? null;
      await ExportService.exportEvolutionReportPDF({ student: selectedStudent, scores, observation, criteria: CRITERIA, customFields, auditCode, createdBy: currentUser?.name || 'Usuário', createdAt: new Date().toISOString(), allEvolutions: selectedStudent.evolutions || [], school });
    } catch { alert('Erro ao exportar PDF.'); }
  };

  const allLabels = CRITERIA.map(c => c.name);
  const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;

  return (
    <div className="max-w-6xl mx-auto min-h-screen p-4 lg:p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><BarChart3 className="text-brand-600"/> Relatório Evolutivo</h2>
          <p className="text-gray-500 text-sm">Avalie critérios, adicione evidências e gere PDF auditável.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold flex gap-2 items-center"><Printer size={16}/> Imprimir</button>
          <button onClick={handleExportPDF} className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold flex gap-2 items-center"><Download size={16}/> PDF</button>
        </div>
      </div>

      {/* Seleção */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Aluno</label>
            <select className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none" value={selectedStudentId} onChange={e => { setSelectedStudentId(e.target.value); setSelectedHistoryId(null); }}>
              <option value="">Selecione...</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Histórico</label>
            <select className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none" value={selectedHistoryId || ''} onChange={e => setSelectedHistoryId(e.target.value || null)} disabled={!selectedStudent?.evolutions?.length}>
              <option value="">+ Novo Relatório</option>
              {(selectedStudent?.evolutions || []).map(e => (
                <option key={e.id} value={e.id}>{new Date(e.date || (e as any).createdAt || '').toLocaleDateString('pt-BR')} — {(e as any).createdBy || e.author}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Código de Auditoria</label>
            <div className="w-full border border-gray-100 p-2.5 rounded-xl bg-gray-50 font-mono text-xs text-gray-600 flex items-center gap-2">
              <ShieldCheck size={14} className="text-green-500 shrink-0"/>
              {auditCode || '—'}
            </div>
          </div>
        </div>
      </div>

      {!selectedStudent ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
          <BarChart3 size={40} className="mx-auto mb-3 text-gray-200"/>
          <p>Selecione um aluno para iniciar o relatório.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Coluna esquerda: Gráfico + critérios base */}
          <div className="lg:col-span-2 space-y-6">

            {/* Gráfico */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-gray-800">Mapa de Evolução</h3>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                  {(['radar','barras'] as const).map(t => (
                    <button key={t} onClick={() => setShowChart(t)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${showChart === t ? 'bg-white shadow text-brand-700' : 'text-gray-500 hover:text-gray-700'}`}>{t === 'radar' ? 'Radar' : 'Barras'}</button>
                  ))}
                </div>
              </div>

              <div className="flex justify-center py-2">
                {showChart === 'radar'
                  ? <RadarChart scores={scores} />
                  : <div className="w-full pt-2"><BarChart scores={scores} labels={CRITERIA.map(c => c.name)} /></div>
                }
              </div>

              {/* Média */}
              <div className="mt-3 flex items-center justify-center gap-2 bg-brand-50 rounded-xl p-3">
                <TrendingUp size={16} className="text-brand-600"/>
                <span className="text-sm font-bold text-brand-800">Média geral: {avg}/5</span>
                <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${avg >= 4 ? 'bg-green-100 text-green-700' : avg >= 3 ? 'bg-brand-100 text-brand-700' : 'bg-orange-100 text-orange-700'}`}>
                  {avg >= 4 ? 'Excelente' : avg >= 3 ? 'Bom' : 'Em desenvolvimento'}
                </span>
              </div>
            </div>

            {/* Critérios base */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-bold text-gray-800 mb-3">Critérios Base</h3>
              <div className="space-y-3">
                {CRITERIA.map((c, idx) => (
                  <div key={c.name} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-700 truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{c.desc}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {[1,2,3,4,5].map(val => (
                        <button key={val} disabled={isReadOnly}
                          onClick={() => setScores(scores.map((s, i) => i === idx ? val : s))}
                          className={`w-7 h-7 rounded-lg text-xs font-bold transition ${scores[idx] === val ? 'bg-brand-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} ${isReadOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >{val}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Coluna direita: Avaliação detalhada + parecer */}
          <div className="lg:col-span-3 space-y-6">

            {/* Critérios personalizados */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-800">Avaliação Personalizada</h3>
                {!isReadOnly && (
                  <button onClick={() => setAddModal('scale')} className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition">
                    <Plus size={14}/> Adicionar Critério
                  </button>
                )}
              </div>

              {customFields.filter(f => f.type === 'scale').length === 0 && (
                <div className="border border-dashed border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">
                  <BarChart3 size={24} className="mx-auto mb-2 text-gray-200"/>
                  Nenhum critério personalizado. Use <strong>Adicionar Critério</strong>.
                </div>
              )}

              <div className="space-y-3">
                {customFields.filter(f => f.type === 'scale').map(field => {
                  const mn = Number(field.minScale ?? 1), mx = Number(field.maxScale ?? 5);
                  const vals = Array.from({ length: mx - mn + 1 }, (_, i) => mn + i);
                  return (
                    <div key={field.id} className="bg-gradient-to-r from-brand-50 to-purple-50 rounded-xl p-4 border border-brand-100 relative group">
                      {!isReadOnly && (
                        <button onClick={() => removeField(field.id)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><X size={14}/></button>
                      )}
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-bold text-sm text-brand-900">{field.label}</p>
                        <span className="text-xl font-black text-brand-700">{field.value}</span>
                      </div>
                      <div className="flex gap-1">
                        {vals.map(v => (
                          <button key={v} disabled={isReadOnly}
                            onClick={() => updateField(field.id, { value: v })}
                            className={`flex-1 h-8 rounded-lg text-xs font-bold transition ${Number(field.value) === v ? 'bg-brand-600 text-white shadow' : 'bg-white text-gray-500 hover:bg-brand-100 border border-brand-100'} ${isReadOnly ? 'cursor-not-allowed opacity-60' : ''}`}
                          >{v}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Parecer descritivo + campos texto */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-800">Parecer Descritivo</h3>
                {!isReadOnly && (
                  <button onClick={() => setAddModal('text')} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-50 transition">
                    <Plus size={14}/> Adicionar Campo
                  </button>
                )}
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Parecer Geral</label>
                  <SmartTextarea value={observation} onChange={setObservation} disabled={isReadOnly} placeholder="Descreva evidências, avanços, dificuldades, estratégias que funcionaram e próximos passos..." allowAudio={true} />
                </div>

                {customFields.filter(f => f.type === 'textarea').map(field => (
                  <div key={field.id} className="border border-gray-100 rounded-xl p-4 relative group">
                    {!isReadOnly && (
                      <button onClick={() => removeField(field.id)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><X size={14}/></button>
                    )}
                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">{field.label}</label>
                    <SmartTextarea value={String(field.value || '')} onChange={v => updateField(field.id, { value: v })} disabled={isReadOnly} placeholder={`Escreva sobre: ${field.label}`} allowAudio={field.allowAudio !== 'none'} />
                  </div>
                ))}
              </div>
            </div>

            {/* Salvar */}
            {!isReadOnly && (
              <button onClick={handleSave} className="w-full bg-gray-900 hover:bg-black text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition shadow-lg">
                <Save size={18}/> Salvar Relatório
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modais */}
      {addModal && <AddFieldModal mode={addModal} onAdd={addField} onClose={() => setAddModal(null)} />}
    </div>
  );
};
