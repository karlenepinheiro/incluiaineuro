import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Download, RefreshCw, History, UserCheck,
  BookOpen, Lightbulb, Brain, CheckCircle,
  Activity, Star, Eye, Stethoscope, X, ChevronRight,
  AlertCircle, ShieldAlert, AlertTriangle,
  Pencil, Trash2, Hash, Plus, Lock,
} from 'lucide-react';
import { Student, User as UserType, PlanTier, resolvePlanTier } from '../types';
import { AIService, friendlyAIError } from '../services/aiService';
import {
  IntelligentProfileService,
  IntelligentProfileRecord,
  IntelligentProfileJSON,
  ChecklistItem,
  ChallengeItem,
  RecommendedActivity,
} from '../services/intelligentProfileService';
import { calculateAge } from '../utils/dateUtils';
import { generateDocumentCodeFromSeed } from '../utils/documentCodes';

// MASTER checkout URL (fallback to official link)
const MASTER_CHECKOUT_URL =
  (import.meta as any).env?.VITE_KIWIFY_CHECKOUT_MASTER || 'https://pay.kiwify.com.br/yVg81A2';

interface Props {
  student: Student;
  user: UserType;
  onNavigateToIncluiLab?: (prompt: string) => void;
}

// ── Array <-> textarea helpers ────────────────────────────────────────────────
const arrToText = (arr: string[] | undefined) => (arr ?? []).join('\n');
const textToArr = (text: string): string[] =>
  text.split('\n').map(s => s.trim()).filter(Boolean);

// ── SkillBadge ────────────────────────────────────────────────────────────────
function SkillBadge({ name, status }: {
  name: string;
  status: 'presente' | 'em_desenvolvimento' | 'nao_observado';
}) {
  const cfg = {
    presente:           { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Presente' },
    em_desenvolvimento: { cls: 'bg-amber-100 text-amber-700 border-amber-200',       label: 'Em desenvolvimento' },
    nao_observado:      { cls: 'bg-slate-100 text-slate-600 border-slate-200',       label: 'Não observado' },
  }[status];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg hover:bg-white/60 transition-colors">
      <span className="text-sm font-medium text-slate-700">{name}</span>
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border whitespace-nowrap w-fit ${cfg.cls}`}>
        {cfg.label}
      </span>
    </div>
  );
}

// ── ActivityCard ──────────────────────────────────────────────────────────────
function ActivityCard({ title, support, objective, how, why }: {
  title: string; support: string; objective: string; how: string; why: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col print:shadow-none print:break-inside-avoid">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h4 className="font-bold text-slate-800 leading-tight">{title}</h4>
        <span className="text-[10px] uppercase font-bold tracking-wider bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 whitespace-nowrap flex-shrink-0">
          {support}
        </span>
      </div>
      <div className="space-y-3 text-sm flex-1">
        <div>
          <span className="block text-xs font-bold text-slate-400 uppercase mb-0.5">Objetivo</span>
          <p className="text-slate-700">{objective}</p>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs font-bold text-slate-400 uppercase mb-0.5">
            <ChevronRight size={12} /> Como Aplicar
          </div>
          <p className="text-slate-600">{how}</p>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs font-bold text-emerald-500/80 uppercase mb-0.5">
            <CheckCircle size={12} /> Por que ajuda
          </div>
          <p className="text-slate-600">{why}</p>
        </div>
      </div>
    </div>
  );
}

// ── ChecklistEditor ───────────────────────────────────────────────────────────
function ChecklistEditor({ items, onChange }: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}) {
  const statusOpts: ChecklistItem['status'][] = ['presente', 'em_desenvolvimento', 'nao_observado'];
  const statusLabels: Record<ChecklistItem['status'], string> = {
    presente: 'Presente',
    em_desenvolvimento: 'Em desenvolvimento',
    nao_observado: 'Não observado',
  };
  const inputCls = "flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 bg-white";
  const selectCls = "text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:border-indigo-400 bg-white";

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="text"
            value={item.label}
            onChange={e => {
              const updated = items.map((it, idx) => idx === i ? { ...it, label: e.target.value } : it);
              onChange(updated);
            }}
            className={inputCls}
            placeholder="Habilidade"
          />
          <select
            value={item.status}
            onChange={e => {
              const updated = items.map((it, idx) => idx === i ? { ...it, status: e.target.value as ChecklistItem['status'] } : it);
              onChange(updated);
            }}
            className={selectCls}
          >
            {statusOpts.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}
          </select>
          <button
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="p-2 text-slate-400 hover:text-red-500 transition-colors"
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { label: '', status: 'nao_observado' }])}
        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-semibold py-1"
      >
        <Plus size={13} /> Adicionar item
      </button>
    </div>
  );
}

// ── ChallengesEditor ──────────────────────────────────────────────────────────
function ChallengesEditor({ items, onChange }: {
  items: ChallengeItem[];
  onChange: (items: ChallengeItem[]) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={item.title}
              onChange={e => onChange(items.map((it, idx) => idx === i ? { ...it, title: e.target.value } : it))}
              className="flex-1 text-sm font-semibold border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 bg-white"
              placeholder="Título do desafio"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>
          <textarea
            value={item.description}
            onChange={e => onChange(items.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it))}
            rows={2}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 resize-none"
            placeholder="Descrição"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { title: '', description: '' }])}
        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-semibold py-1"
      >
        <Plus size={13} /> Adicionar desafio
      </button>
    </div>
  );
}

// ── ActivitiesEditor ──────────────────────────────────────────────────────────
function ActivitiesEditor({ items, onChange }: {
  items: RecommendedActivity[];
  onChange: (items: RecommendedActivity[]) => void;
}) {
  const supportLevels: RecommendedActivity['supportLevel'][] = ['Baixo', 'Médio', 'Alto'];
  const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1";
  const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 bg-white";
  const textareaCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 resize-none";

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Atividade {i + 1}</span>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <div>
            <label className={labelCls}>Título</label>
            <input type="text" value={item.title} className={inputCls}
              onChange={e => onChange(items.map((it, idx) => idx === i ? { ...it, title: e.target.value } : it))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Objetivo</label>
              <textarea value={item.objective} rows={2} className={textareaCls}
                onChange={e => onChange(items.map((it, idx) => idx === i ? { ...it, objective: e.target.value } : it))} />
            </div>
            <div>
              <label className={labelCls}>Por que ajuda</label>
              <textarea value={item.whyItHelps} rows={2} className={textareaCls}
                onChange={e => onChange(items.map((it, idx) => idx === i ? { ...it, whyItHelps: e.target.value } : it))} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Como aplicar</label>
            <textarea value={item.howToApply} rows={2} className={textareaCls}
              onChange={e => onChange(items.map((it, idx) => idx === i ? { ...it, howToApply: e.target.value } : it))} />
          </div>
          <div>
            <label className={labelCls}>Nível de suporte</label>
            <select value={item.supportLevel} className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 bg-white"
              onChange={e => onChange(items.map((it, idx) => idx === i ? { ...it, supportLevel: e.target.value as RecommendedActivity['supportLevel'] } : it))}>
              {supportLevels.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { title: '', objective: '', howToApply: '', whyItHelps: '', supportLevel: 'Médio', incluiLabPrompt: '' }])}
        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-semibold py-1"
      >
        <Plus size={13} /> Adicionar atividade
      </button>
    </div>
  );
}

// ── ManualEditModal ───────────────────────────────────────────────────────────
function ManualEditModal({ initialData, userName, onSave, onCancel }: {
  initialData: IntelligentProfileJSON;
  userName: string;
  onSave: (data: IntelligentProfileJSON) => Promise<void>;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<IntelligentProfileJSON>(() =>
    JSON.parse(JSON.stringify(initialData))
  );

  const update = (path: string[], value: unknown) => {
    setDraft(prev => {
      const next: any = JSON.parse(JSON.stringify(prev));
      let obj = next;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
      obj[path[path.length - 1]] = value;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); }
  };

  const labelCls = "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5";
  const textareaCls = "w-full text-sm border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 resize-none leading-relaxed";
  const sectionCls = "space-y-4";
  const sectionHeaderCls = "text-sm font-bold text-[#1F4E5F] border-b border-slate-200 pb-2 mb-4 flex items-center gap-2";

  return (
    <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh]">

        <div className="bg-[#1F4E5F] px-6 py-4 flex items-center justify-between rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <Pencil size={18} className="text-white" />
            <span className="text-white font-bold text-base">Editar Perfil Manualmente</span>
          </div>
          <button onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2 flex-shrink-0">
          <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            Esta edição <strong>não consome créditos</strong> e cria uma nova versão no histórico como "Edição manual". As versões anteriores são preservadas.
          </p>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-6 space-y-8">

          {/* Voz do Aluno */}
          <div className={sectionCls}>
            <div className={sectionHeaderCls}><UserCheck size={15} />Voz do Aluno</div>
            <div>
              <label className={labelCls}>Carta / Fala do Aluno</label>
              <textarea className={textareaCls} rows={4}
                value={draft.firstPersonLetter ?? ''}
                onChange={e => update(['firstPersonLetter'], e.target.value)}
                placeholder="Em primeira pessoa: Como eu sou, como aprendo, o que gosto…"
              />
            </div>
          </div>

          {/* Parecer Pedagógico */}
          <div className={sectionCls}>
            <div className={sectionHeaderCls}><BookOpen size={15} />Parecer Pedagógico</div>
            <div>
              <label className={labelCls}>Texto do Parecer</label>
              <textarea className={textareaCls} rows={5}
                value={draft.pedagogicalReport.text}
                onChange={e => update(['pedagogicalReport', 'text'], e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Checklist de Habilidades</label>
              <ChecklistEditor
                items={draft.pedagogicalReport.checklist}
                onChange={items => update(['pedagogicalReport', 'checklist'], items)}
              />
            </div>
          </div>

          {/* Parecer Neuropsicológico */}
          <div className={sectionCls}>
            <div className={sectionHeaderCls}><Brain size={15} />Parecer Neuropsicológico</div>
            <div>
              <label className={labelCls}>Texto do Parecer</label>
              <textarea className={textareaCls} rows={5}
                value={draft.neuropsychologicalReport?.text ?? ''}
                onChange={e => update(['neuropsychologicalReport'], {
                  ...(draft.neuropsychologicalReport ?? { checklist: [] }),
                  text: e.target.value,
                })}
                placeholder="Análise neuropsicológica do aluno…"
              />
            </div>
            <div>
              <label className={labelCls}>Checklist (um item por linha)</label>
              <textarea className={textareaCls} rows={4}
                value={arrToText(draft.neuropsychologicalReport?.checklist)}
                onChange={e => update(['neuropsychologicalReport'], {
                  ...(draft.neuropsychologicalReport ?? { text: '' }),
                  checklist: textToArr(e.target.value),
                })}
                placeholder={'Ex: Atenção sustentada comprometida\nMemória de trabalho reduzida'}
              />
            </div>
          </div>

          {/* Parecer Neuropedagógico */}
          <div className={sectionCls}>
            <div className={sectionHeaderCls}><Stethoscope size={15} />Parecer Neuropedagógico</div>
            <div>
              <label className={labelCls}>Texto do Parecer</label>
              <textarea className={textareaCls} rows={5}
                value={draft.neuroPedagogicalReport.text}
                onChange={e => update(['neuroPedagogicalReport', 'text'], e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Checklist de Status Cognitivo</label>
              <ChecklistEditor
                items={draft.neuroPedagogicalReport.checklist}
                onChange={items => update(['neuroPedagogicalReport', 'checklist'], items)}
              />
            </div>
          </div>

          {/* Perfil de Aprendizagem */}
          <div className={sectionCls}>
            <div className={sectionHeaderCls}><Lightbulb size={15} />Perfil de Aprendizagem</div>
            <div>
              <label className={labelCls}>Descrição do Perfil</label>
              <textarea className={textareaCls} rows={3}
                value={draft.learningProfile?.text ?? ''}
                onChange={e => update(['learningProfile'], {
                  ...(draft.learningProfile ?? {}),
                  text: e.target.value,
                })}
                placeholder="Como este aluno processa e retém informações…"
              />
            </div>
            <div>
              <label className={labelCls}>Como aprende melhor (um item por linha)</label>
              <textarea className={textareaCls} rows={4}
                value={arrToText(draft.bestLearningStrategies.items)}
                onChange={e => update(['bestLearningStrategies', 'items'], textToArr(e.target.value))}
                placeholder={'Ex: Aprende melhor com recursos visuais\nPrefere atividades práticas e concretas'}
              />
            </div>
          </div>

          {/* Potencialidades */}
          <div className={sectionCls}>
            <div className={sectionHeaderCls}><Star size={15} />Potencialidades</div>
            <div>
              <label className={labelCls}>Potencialidades (uma por linha)</label>
              <textarea className={textareaCls} rows={4}
                value={arrToText(draft.strengths)}
                onChange={e => update(['strengths'], textToArr(e.target.value))}
                placeholder={'Ex: Boa memória visual\nInteresse em ciências'}
              />
            </div>
          </div>

          {/* Desafios */}
          <div className={sectionCls}>
            <div className={sectionHeaderCls}><ShieldAlert size={15} />Desafios / Pontos de Cuidado</div>
            <ChallengesEditor
              items={draft.challenges ?? []}
              onChange={items => update(['challenges'], items)}
            />
          </div>

          {/* Pontos de Observação */}
          <div className={sectionCls}>
            <div className={sectionHeaderCls}><Eye size={15} />Pontos de Observação</div>
            <div>
              <label className={labelCls}>Texto de Orientação</label>
              <textarea className={textareaCls} rows={4}
                value={draft.observationPoints.text}
                onChange={e => update(['observationPoints', 'text'], e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Checklist de Avaliação Diária (um item por linha)</label>
              <textarea className={textareaCls} rows={4}
                value={arrToText(draft.observationPoints.checklist)}
                onChange={e => update(['observationPoints', 'checklist'], textToArr(e.target.value))}
              />
            </div>
          </div>

          {/* Atividades Indicadas */}
          <div className={sectionCls}>
            <div className={sectionHeaderCls}><Activity size={15} />Atividades Indicadas</div>
            <ActivitiesEditor
              items={draft.recommendedActivities}
              onChange={items => update(['recommendedActivities'], items)}
            />
          </div>

          {/* Próximos Passos */}
          <div className={sectionCls}>
            <div className={sectionHeaderCls}><ChevronRight size={15} />Próximos Passos / Cuidados</div>
            <div>
              <label className={labelCls}>Próximos passos (um por linha)</label>
              <textarea className={textareaCls} rows={4}
                value={arrToText(draft.nextSteps)}
                onChange={e => update(['nextSteps'], textToArr(e.target.value))}
                placeholder={'Ex: Encaminhar para avaliação fonoaudiológica\nImplementar recurso de CAA'}
              />
            </div>
          </div>

        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-slate-400">Editando como: {userName}</p>
          <div className="flex gap-3">
            <button onClick={onCancel}
              className="px-5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 bg-[#1F4E5F] hover:bg-[#1a4250] text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center gap-2 transition-colors">
              {saving && <RefreshCw size={14} className="animate-spin" />}
              Salvar alterações
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── UpgradeModal ──────────────────────────────────────────────────────────────
function UpgradeModal({ onClose }: { onClose: () => void }) {
  const perks = [
    'Geração ilimitada de perfis inteligentes',
    'Edição manual de qualquer campo',
    'Atualização com IA a qualquer momento',
    'Histórico completo de versões',
    'Exportação PDF profissional com código de registro',
  ];

  return (
    <div className="fixed inset-0 z-[400] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-[#1F4E5F] to-[#2E3A59] p-8 text-center relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
          <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-[#C69214]/20" />
          <div className="relative">
            <div className="w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20">
              <Brain size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">Demonstração utilizada</h2>
            <p className="text-white/75 text-sm leading-relaxed">
              Você já utilizou seu Perfil Inteligente de demonstração.
            </p>
          </div>
        </div>
        <div className="p-6">
          <p className="text-slate-600 text-sm text-center mb-5 leading-relaxed">
            Para continuar analisando seus alunos com IA, faça upgrade para o plano <strong className="text-[#1F4E5F]">Premium</strong>.
          </p>
          <div className="space-y-2 mb-6 bg-slate-50 rounded-xl p-4 border border-slate-100">
            {perks.map(perk => (
              <div key={perk} className="flex items-center gap-2.5 text-sm text-slate-700">
                <CheckCircle size={15} className="text-emerald-500 shrink-0" />
                <span>{perk}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              Agora não
            </button>
            <a href={MASTER_CHECKOUT_URL} target="_blank" rel="noopener noreferrer"
              onClick={onClose}
              className="flex-1 py-2.5 bg-[#C69214] hover:bg-[#b5841a] text-white rounded-xl text-sm font-bold text-center transition-colors flex items-center justify-center gap-2">
              <Sparkles size={15} />
              Ver plano Premium
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Version history modal ─────────────────────────────────────────────────────
function VersionModal({ versions, onClose, onSelect }: {
  versions: IntelligentProfileRecord[];
  onClose: () => void;
  onSelect: (v: IntelligentProfileRecord) => void;
}) {
  const typeBadge = (type: IntelligentProfileRecord['generation_type']) => {
    const cfg = {
      initial:     { cls: 'bg-indigo-50 text-indigo-700',  label: 'Geração inicial' },
      update:      { cls: 'bg-amber-50 text-amber-700',    label: 'Atualização com IA' },
      manual_edit: { cls: 'bg-green-50 text-green-700',    label: 'Edição manual' },
    }[type] ?? { cls: 'bg-slate-50 text-slate-600', label: type };
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>
        {cfg.label}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-[#1F4E5F] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History size={18} className="text-white" />
            <span className="text-white font-bold text-base">Histórico de Versões</span>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {versions.map((v) => {
            const date = new Date(v.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const time = new Date(v.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return (
              <button key={v.id} onClick={() => { onSelect(v); onClose(); }}
                className="w-full text-left px-6 py-4 border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm text-[#1F4E5F]">Versão {v.version_number}</span>
                      {typeBadge(v.generation_type)}
                    </div>
                    <p className="text-xs text-slate-500">{date} às {time} · {v.generated_by_name || 'Usuário'}</p>
                    {v.summary && <p className="text-xs text-slate-600 mt-1 italic">{v.summary}</p>}
                  </div>
                  <ChevronRight size={16} className="text-slate-300 mt-1 shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
        <div className="px-6 py-3 border-t border-slate-100">
          <button onClick={onClose}
            className="w-full py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────
function DeleteConfirmModal({ studentName, onConfirm, onCancel }: {
  studentName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Trash2 size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Excluir Perfil Inteligente</h3>
            <p className="text-xs text-slate-500 mt-0.5">Esta ação não pode ser desfeita</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-6">
          Tem certeza que deseja excluir o Perfil Inteligente de <strong>{studentName}</strong>? Todas as versões serão removidas.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors">
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export const IntelligentProfileTab: React.FC<Props> = ({ student, user, onNavigateToIncluiLab: _onNavigateToIncluiLab }) => {
  const [isGenerating, setIsGenerating]           = useState(false);
  const [loadingInit, setLoadingInit]             = useState(true);
  const [error, setError]                         = useState('');
  const [profile, setProfile]                     = useState<IntelligentProfileRecord | null>(null);
  const [versions, setVersions]                   = useState<IntelligentProfileRecord[]>([]);
  const [showVersions, setShowVersions]           = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showManualEdit, setShowManualEdit]        = useState(false);
  const [showUpgradeModal, setShowUpgradeModal]   = useState(false);
  const [exportingPdf, setExportingPdf]           = useState(false);
  const [isDeleting, setIsDeleting]               = useState(false);
  const [tenantProfileCount, setTenantProfileCount] = useState(0);

  // ── Plan gates ─────────────────────────────────────────────────────────────
  const userTier    = resolvePlanTier(user.plan);
  const isFreeUser  = userTier === PlanTier.FREE;
  const isDemoLocked = isFreeUser && tenantProfileCount >= 1;

  const loadData = useCallback(async () => {
    if (!student.id) { setLoadingInit(false); return; }
    setLoadingInit(true);
    try {
      const tenantId = (user as any).tenant_id ?? '';
      const [latest, all, count] = await Promise.all([
        IntelligentProfileService.getLatest(student.id),
        IntelligentProfileService.getVersions(student.id),
        tenantId ? IntelligentProfileService.getTenantCount(tenantId) : Promise.resolve(0),
      ]);
      setProfile(latest);
      setVersions(all);
      setTenantProfileCount(count);
    } catch (e) {
      console.error('[IntelligentProfileTab] load:', e);
    } finally {
      setLoadingInit(false);
    }
  }, [student.id, (user as any).tenant_id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleGenerate = async (isUpdate: boolean) => {
    if (isDemoLocked) { setShowUpgradeModal(true); return; }
    setError('');
    setIsGenerating(true);
    try {
      const newVersion = isUpdate ? (profile?.version_number ?? 0) + 1 : 1;
      const profileJson = await AIService.generateIntelligentProfile(student, user as any, newVersion);
      const saved = await IntelligentProfileService.save({
        studentId:       student.id,
        tenantId:        (user as any).tenant_id ?? '',
        generatedBy:     user.id,
        generatedByName: user.name,
        profileJson,
        generationType:  isUpdate ? 'update' : 'initial',
        summary:         isUpdate ? 'Perfil atualizado com novos dados' : undefined,
        versionNumber:   newVersion,
      });
      if (!saved) throw new Error('Não foi possível salvar o perfil. Tente novamente.');
      await loadData();
    } catch (e: any) {
      setError(friendlyAIError(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleManualSave = async (editedJson: IntelligentProfileJSON) => {
    setError('');
    try {
      const newVersion = (profile?.version_number ?? 0) + 1;
      const saved = await IntelligentProfileService.save({
        studentId:       student.id,
        tenantId:        (user as any).tenant_id ?? '',
        generatedBy:     user.id,
        generatedByName: user.name,
        profileJson:     editedJson,
        generationType:  'manual_edit',
        summary:         `Edição manual realizada por ${user.name}`,
        versionNumber:   newVersion,
      });
      if (!saved) throw new Error('Não foi possível salvar as alterações.');
      setShowManualEdit(false);
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar as alterações.');
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const ok = await IntelligentProfileService.deleteAll(student.id);
      if (!ok) throw new Error('Erro ao excluir. Tente novamente.');
      setProfile(null);
      setVersions([]);
      setShowDeleteConfirm(false);
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Erro ao excluir o perfil.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportPdf = async () => {
    if (isDemoLocked) { setShowUpgradeModal(true); return; }
    if (!profile) return;
    setExportingPdf(true);
    try {
      const { generateIntelligentProfilePDF } = await import('../services/PDFGenerator');
      await generateIntelligentProfilePDF({
        profile: profile.profile_json,
        student,
        versionNumber:    profile.version_number,
        generatedAt:      profile.created_at,
        generatedByName:  profile.generated_by_name ?? user.name,
        school:           (user as any)?.schoolConfigs?.[0] ?? null,
      });
    } catch (e) {
      console.error('[IntelligentProfileTab] PDF error:', e);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setExportingPdf(false);
    }
  };

  // ── Computed helpers ───────────────────────────────────────────────────────
  const data: IntelligentProfileJSON | null = profile?.profile_json ?? null;
  const age        = student.birthDate ? calculateAge(student.birthDate) : null;
  const ageStr     = age && age > 0 ? `${age} anos` : null;
  const diagnosis  = (student.diagnosis || []).join(', ') || (Array.isArray(student.cid) ? student.cid[0] : student.cid) || '';
  const schoolName = (user as any)?.school || (user as any)?.schoolConfigs?.[0]?.schoolName || (user as any)?.schoolConfigs?.[0]?.name || '';

  const genDate = profile
    ? new Date(profile.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  const registrationCode = profile
    ? generateDocumentCodeFromSeed('registration', profile.created_at, `${profile.id}-${profile.version_number}-${profile.created_at}`)
    : '';

  const firstPersonLetter = data?.firstPersonLetter || null;
  const strengths         = data?.strengths ?? data?.nextSteps ?? [];
  const challenges        = data?.challenges ?? (data?.carePoints ?? []).map(c => ({ title: 'Ponto de Atenção', description: c }));

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loadingInit) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-slate-400">
        <RefreshCw size={20} className="animate-spin" />
        <span className="text-sm">Carregando perfil…</span>
      </div>
    );
  }

  // ── Empty state — demo locked (FREE, used demo elsewhere) ─────────────────
  if (!data && isDemoLocked) {
    return (
      <div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6 flex items-center gap-4">
          {student.photoUrl ? (
            <img src={student.photoUrl} alt={student.name}
              className="w-16 h-16 rounded-full object-cover border-4 border-white shadow-md" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-indigo-50 border-4 border-white shadow-md flex items-center justify-center text-2xl font-bold text-indigo-600">
              {student.name.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-slate-900">{student.name}</h1>
            {student.grade && <p className="text-sm text-slate-500">{student.grade}</p>}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-12 shadow-sm border border-amber-100 flex flex-col items-center text-center">
          <div className="mb-6">
            <div className="w-24 h-24 rounded-3xl bg-amber-50 flex items-center justify-center shadow-[0_0_0_14px_rgba(217,119,6,0.07)] mx-auto mb-5">
              <Brain size={48} className="text-amber-500" />
            </div>
            <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full text-xs font-bold border border-amber-200">
              <Lock size={12} />
              Demonstração já utilizada
            </div>
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-3">Perfil Inteligente bloqueado</h3>
          <p className="text-sm text-slate-500 mb-8 max-w-md leading-relaxed">
            Você já utilizou seu Perfil Inteligente de demonstração.
            Para continuar analisando seus alunos com IA, faça upgrade para o plano Premium.
          </p>
          <a href={MASTER_CHECKOUT_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2.5 bg-[#C69214] hover:bg-[#b5841a] text-white font-bold px-10 py-4 rounded-2xl text-sm shadow-md shadow-amber-200 transition-all">
            <Sparkles size={17} />
            Ver plano Premium
          </a>
          <p className="text-xs text-slate-400 mt-4">
            Geração ilimitada · Edição manual · Histórico de versões · PDF profissional
          </p>
        </div>
      </div>
    );
  }

  // ── Empty state — free, can generate demo ─────────────────────────────────
  if (!data) {
    return (
      <div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6 flex items-center gap-4">
          {student.photoUrl ? (
            <img src={student.photoUrl} alt={student.name}
              className="w-16 h-16 rounded-full object-cover border-4 border-white shadow-md" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-indigo-50 border-4 border-white shadow-md flex items-center justify-center text-2xl font-bold text-indigo-600">
              {student.name.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-slate-900">{student.name}</h1>
            {student.grade && <p className="text-sm text-slate-500">{student.grade}</p>}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-100 flex flex-col items-center text-center">
          <div className="animate-pulse relative mb-8">
            <div className="w-24 h-24 rounded-3xl bg-indigo-50 flex items-center justify-center shadow-[0_0_0_14px_rgba(99,102,241,0.07)]">
              <Brain size={48} className="text-indigo-600" />
            </div>
            <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center shadow-md">
              <Sparkles size={14} className="text-white" />
            </div>
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-3">Entenda este aluno além do diagnóstico</h3>
          <p className="text-sm text-slate-500 mb-8 max-w-md leading-relaxed">
            A IA analisa comportamento, aprendizagem e histórico para gerar um perfil pedagógico completo,
            com parecer neuropedagógico, atividades personalizadas e orientações práticas.
          </p>
          {isFreeUser && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2.5 rounded-xl text-xs font-semibold mb-6">
              <AlertTriangle size={14} />
              Plano Grátis: 1 geração de demonstração disponível
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-6 max-w-md text-left">
              <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
              <span className="text-sm text-red-600">{error}</span>
            </div>
          )}
          <button onClick={() => handleGenerate(false)} disabled={isGenerating}
            className="flex items-center gap-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold px-10 py-4 rounded-2xl text-sm shadow-md shadow-indigo-200 transition-all">
            {isGenerating ? <RefreshCw size={17} className="animate-spin" /> : <Sparkles size={17} />}
            {isGenerating ? 'Gerando perfil com IA…' : 'Gerar análise completa do aluno'}
          </button>
          <p className="text-xs text-slate-400 mt-3">Custo: <strong>5 créditos</strong></p>
        </div>
      </div>
    );
  }

  // ── Full report ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F6F4EF] font-sans text-slate-800 pb-12 -mx-6 px-6 print:bg-white print:mx-0 print:px-0">

      {/* ACTION BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 print:hidden">
        <div className="flex items-center gap-2 flex-wrap">

          {isDemoLocked ? (
            <button onClick={() => setShowUpgradeModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 text-slate-400 border border-slate-200 rounded-xl font-semibold text-sm hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600 transition-all">
              <Lock size={15} /> Atualizar com IA
            </button>
          ) : (
            <button onClick={() => handleGenerate(true)} disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-[#1F4E5F] hover:bg-[#EEF5F8] border border-[#C5DDE7] rounded-xl font-semibold text-sm transition-all disabled:opacity-50">
              {isGenerating ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {isGenerating ? 'Processando…' : 'Atualizar com IA'}
            </button>
          )}

          {versions.length > 1 && (
            isDemoLocked ? (
              <button onClick={() => setShowUpgradeModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 text-slate-400 border border-slate-200 rounded-xl font-semibold text-sm hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600 transition-all">
                <Lock size={15} /> Versões ({versions.length})
              </button>
            ) : (
              <button onClick={() => setShowVersions(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-sm transition-all border border-slate-200">
                <History size={15} /> Versões ({versions.length})
              </button>
            )
          )}

          {isDemoLocked ? (
            <button onClick={() => setShowUpgradeModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 text-slate-400 border border-slate-200 rounded-xl font-semibold text-sm hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600 transition-all">
              <Lock size={15} /> Gerar PDF
            </button>
          ) : (
            <button onClick={handleExportPdf} disabled={exportingPdf}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1F4E5F] hover:bg-[#1a4250] text-white rounded-xl font-semibold text-sm transition-all shadow-sm disabled:opacity-60">
              {exportingPdf ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
              Gerar PDF
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isDemoLocked ? (
            <button onClick={() => setShowUpgradeModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 text-slate-400 border border-slate-200 rounded-xl font-semibold text-sm hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600 transition-all">
              <Lock size={15} /> Editar manualmente
            </button>
          ) : (
            <button onClick={() => setShowManualEdit(true)} disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#FDF8EC] hover:bg-[#FBF0D0] text-[#92690A] border border-[#F0E4B5] rounded-xl font-semibold text-sm transition-all disabled:opacity-50">
              <Pencil size={15} /> Editar manualmente
            </button>
          )}

          <button onClick={() => setShowDeleteConfirm(true)} disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-semibold text-sm transition-all disabled:opacity-50">
            <Trash2 size={15} /> Excluir
          </button>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-5">
          <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
          <span className="text-sm text-red-600">{error}</span>
        </div>
      )}

      {/* GENERATING OVERLAY */}
      {isGenerating && (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-[#EEF5F8] rounded-2xl flex items-center justify-center mb-4">
            <Sparkles className="text-[#1F4E5F] w-8 h-8 animate-bounce" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">
            Analisando {student.name.split(' ')[0]}…
          </h3>
          <p className="text-slate-500 max-w-sm text-sm leading-relaxed">
            Cruzando observações, relatórios e avaliações para criar um perfil único.
          </p>
        </div>
      )}

      {!isGenerating && (
        <>
          {/* ── HEADER PREMIUM ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5 print:shadow-none print:rounded-none print:border-0">
            <div className="h-1 bg-[#1F4E5F]" />
            <div className="p-6 md:p-8">

              <div className="flex flex-col md:flex-row md:items-start justify-between gap-5 pb-6 mb-6 border-b border-slate-100">
                <div>
                  {schoolName && (
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1F4E5F]/50 mb-1.5">{schoolName}</p>
                  )}
                  <h1 className="text-2xl md:text-3xl font-black text-[#1F4E5F] leading-tight">
                    Perfil Inteligente
                  </h1>
                  <p className="text-sm text-slate-500 font-medium mt-1">
                    Leitura Pedagógica e Neuropedagógica · Versão {profile?.version_number}
                  </p>
                  {isFreeUser && (
                    <div className="inline-flex items-center gap-1.5 mt-2 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-200">
                      <Lock size={11} /> Versão de demonstração — faça upgrade para desbloquear
                    </div>
                  )}
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 shrink-0 print:bg-white print:border-slate-300">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-1.5 flex items-center gap-1">
                    <Hash size={11} /> Código de Registro
                  </p>
                  <p className="font-mono font-bold text-[#1F4E5F] text-sm tracking-wider">{registrationCode}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Emitido em {genDate}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-5 items-start">
                <div className="shrink-0">
                  {student.photoUrl ? (
                    <img src={student.photoUrl} alt={student.name}
                      className="w-24 h-24 rounded-2xl object-cover ring-4 ring-white shadow-md border border-slate-100 print:shadow-none" />
                  ) : (
                    <div className="w-24 h-24 rounded-2xl bg-[#EEF5F8] ring-4 ring-white shadow-md flex items-center justify-center text-3xl font-black text-[#1F4E5F] print:shadow-none">
                      {student.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-black text-slate-900 mb-3">{student.name}</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ageStr && student.birthDate && (
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Idade</span>
                        <span className="font-semibold text-slate-800 text-xs">{ageStr} — {new Date(student.birthDate + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                    {student.grade && (
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Turma / Turno</span>
                        <span className="font-semibold text-slate-800 text-xs">{student.grade}{(student as any).shift ? ` · ${(student as any).shift}` : ''}</span>
                      </div>
                    )}
                    {student.supportLevel && (
                      <div className="bg-[#FDF8EC] rounded-xl p-2.5 border border-[#F0E4B5]">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-[#C69214] mb-0.5">Nível de Apoio</span>
                        <span className="font-semibold text-[#92690A] text-xs">{student.supportLevel}</span>
                      </div>
                    )}
                    {diagnosis && (
                      <div className="col-span-2 sm:col-span-3 bg-[#EEF5F8] rounded-xl p-2.5 border border-[#C5DDE7]">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-[#1F4E5F]/60 mb-0.5">Diagnóstico / CID</span>
                        <span className="font-semibold text-[#1F4E5F] text-xs">{diagnosis}</span>
                      </div>
                    )}
                    {student.regentTeacher && (
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Prof. Regente</span>
                        <span className="font-semibold text-slate-800 text-xs">{student.regentTeacher}</span>
                      </div>
                    )}
                    {student.aeeTeacher && (
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Prof. AEE</span>
                        <span className="font-semibold text-slate-800 text-xs">{student.aeeTeacher}</span>
                      </div>
                    )}
                    {student.medication && (
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Medicação</span>
                        <span className="font-semibold text-slate-800 text-xs">{student.medication}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── QUEM SOU EU ── */}
          <div className="relative bg-gradient-to-br from-[#EEF5F8] to-[#F0F9F4] rounded-2xl p-7 md:p-9 mb-5 border border-[#C5DDE7] overflow-hidden print:bg-white print:border-slate-300 print:break-inside-avoid">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-[#1F4E5F] rounded-l-2xl print:hidden" />
            <div className="pl-3">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-[#1F4E5F] flex items-center justify-center shrink-0 print:bg-[#EEF5F8]">
                  <UserCheck size={20} className="text-white print:text-[#1F4E5F]" />
                </div>
                <h2 className="text-xl font-black text-[#1F4E5F]">Quem sou eu?</h2>
              </div>
              <p className="text-slate-700 leading-loose text-base italic font-medium print:text-slate-800">
                {firstPersonLetter || `"${data.humanizedIntroduction.text}"`}
              </p>
            </div>
          </div>

          {/* ── ANÁLISE MULTIDISCIPLINAR ── */}
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 whitespace-nowrap">Análise Multidisciplinar</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="space-y-4">
              {/* Pedagógico */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:break-inside-avoid">
                <div className="flex items-center gap-3 px-6 py-4 bg-[#EEF5F8] border-b border-[#C5DDE7]">
                  <div className="w-8 h-8 rounded-lg bg-white/80 text-[#1F4E5F] flex items-center justify-center shrink-0 shadow-sm">
                    <BookOpen size={16} />
                  </div>
                  <h3 className="font-black text-[#1F4E5F] text-sm">Parecer Pedagógico Educacional</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_260px]">
                  <div className="p-6 text-sm text-slate-600 leading-relaxed">{data.pedagogicalReport.text}</div>
                  {data.pedagogicalReport.checklist.length > 0 && (
                    <div className="p-5 bg-slate-50/60 md:border-l border-t md:border-t-0 border-slate-100">
                      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 mb-3">Status de Habilidades</p>
                      <div className="space-y-1">
                        {data.pedagogicalReport.checklist.map((item, i) => (
                          <SkillBadge key={i} name={item.label} status={item.status} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Neuropedagógico */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:break-inside-avoid">
                <div className="flex items-center gap-3 px-6 py-4 bg-violet-50 border-b border-violet-100">
                  <div className="w-8 h-8 rounded-lg bg-white/80 text-violet-600 flex items-center justify-center shrink-0 shadow-sm">
                    <Stethoscope size={16} />
                  </div>
                  <h3 className="font-black text-violet-900 text-sm">Parecer Neuropedagógico</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_260px]">
                  <div className="p-6 text-sm text-slate-600 leading-relaxed">{data.neuroPedagogicalReport.text}</div>
                  {data.neuroPedagogicalReport.checklist.length > 0 && (
                    <div className="p-5 bg-slate-50/60 md:border-l border-t md:border-t-0 border-slate-100">
                      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 mb-3">Status Cognitivo</p>
                      <div className="space-y-1">
                        {data.neuroPedagogicalReport.checklist.map((item, i) => (
                          <SkillBadge key={i} name={item.label} status={item.status} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Potencialidades */}
              {strengths.length > 0 && (
                <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-6 print:shadow-none print:break-inside-avoid">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <Star size={16} />
                    </div>
                    <h3 className="font-black text-slate-800 text-sm">Potencialidades</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {strengths.map((item, i) => (
                      <div key={i} className="flex items-start gap-2.5 bg-emerald-50/50 rounded-xl p-3 border border-emerald-100">
                        <CheckCircle size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                        <span className="text-sm text-slate-600 leading-relaxed">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── COMO APRENDE MELHOR + PONTOS DE CUIDADO ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="bg-white rounded-2xl border border-[#F0E4B5] shadow-sm p-6 print:shadow-none print:break-inside-avoid">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-lg bg-[#FDF8EC] flex items-center justify-center shrink-0">
                  <Lightbulb size={16} className="text-[#C69214]" />
                </div>
                <h3 className="font-black text-slate-800 text-sm">Como Aprende Melhor</h3>
              </div>
              <ul className="space-y-2.5">
                {data.bestLearningStrategies.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 p-3 bg-[#FEFAF0] rounded-xl border border-[#F5ECC4]">
                    <CheckCircle size={15} className="text-[#C69214] mt-0.5 shrink-0" />
                    <span className="text-sm text-slate-700 font-medium leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {challenges.length > 0 ? (
              <div className="bg-white rounded-2xl border border-orange-200 shadow-sm p-6 print:shadow-none print:break-inside-avoid">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                    <ShieldAlert size={16} className="text-orange-600" />
                  </div>
                  <h3 className="font-black text-slate-800 text-sm">Pontos de Cuidado</h3>
                </div>
                <ul className="space-y-2.5">
                  {challenges.map((c, i) => (
                    <li key={i} className="p-3 bg-orange-50/60 rounded-xl border border-orange-100">
                      <p className="text-xs font-bold text-orange-800 mb-0.5">{c.title}</p>
                      <p className="text-sm text-slate-600 leading-relaxed">{c.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="bg-white/50 rounded-2xl border border-dashed border-slate-200 p-6 flex items-center justify-center text-slate-400 text-sm">
                Nenhum ponto de cuidado identificado
              </div>
            )}
          </div>

          {/* ── ATIVIDADES INDICADAS ── */}
          {data.recommendedActivities.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 whitespace-nowrap">Atividades Indicadas</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.recommendedActivities.map((act, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col print:shadow-none print:break-inside-avoid">
                    <div className="bg-[#EEF5F8] px-5 py-3.5 flex items-start justify-between gap-3 border-b border-[#C5DDE7]">
                      <h4 className="font-black text-[#1F4E5F] text-sm leading-snug">{act.title}</h4>
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full whitespace-nowrap shrink-0 border ${
                        act.supportLevel === 'Baixo' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                        act.supportLevel === 'Alto'  ? 'bg-red-100 text-red-700 border-red-200' :
                                                       'bg-amber-100 text-amber-700 border-amber-200'
                      }`}>
                        Apoio {act.supportLevel}
                      </span>
                    </div>
                    <div className="p-5 flex-1 space-y-4">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[#1F4E5F]/60 block mb-1.5">Objetivo</span>
                        <p className="text-sm text-slate-700 leading-relaxed">{act.objective}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400 block mb-1.5">Como Aplicar</span>
                          <p className="text-xs text-slate-600 leading-relaxed">{act.howToApply}</p>
                        </div>
                        <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-100">
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-emerald-600 block mb-1.5">Por que Ajuda</span>
                          <p className="text-xs text-slate-600 leading-relaxed">{act.whyItHelps}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── PONTOS DE OBSERVAÇÃO ── */}
          <div className="bg-[#1F4E5F] rounded-2xl p-7 md:p-9 mb-5 print:bg-white print:border print:border-slate-300 print:text-slate-900 print:break-inside-avoid">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0 print:bg-slate-100">
                <Eye size={17} className="text-white print:text-slate-700" />
              </div>
              <h3 className="font-black text-white text-base print:text-slate-800">Pontos de Observação</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_250px] gap-6">
              <p className="text-white/75 text-sm leading-relaxed print:text-slate-600">
                {data.observationPoints.text}
              </p>
              {data.observationPoints.checklist.length > 0 && (
                <div className="bg-white/10 rounded-xl p-5 border border-white/20 print:bg-slate-50 print:border-slate-200">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/50 mb-4 print:text-slate-400">
                    Checklist Diário
                  </p>
                  <ul className="space-y-3">
                    {data.observationPoints.checklist.map((item, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="w-4 h-4 rounded border-2 border-white/40 mt-0.5 shrink-0 print:border-slate-400" />
                        <span className="text-sm text-white/80 leading-relaxed print:text-slate-700">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* ── ASSINATURAS ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 print:shadow-none print:break-inside-avoid">
            <h3 className="text-center text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 mb-12">
              Assinaturas da Equipe Pedagógica
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-10 gap-y-12 text-center px-2">
              {[
                { name: student.regentTeacher || 'Professor(a) Regente', role: 'Professor(a) Regente' },
                { name: student.aeeTeacher || 'Prof. do AEE',            role: 'Professor(a) do AEE' },
                { name: 'Coordenação Pedagógica',                         role: schoolName || 'Unidade Escolar' },
              ].map((sig, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="w-full border-b-2 border-[#1F4E5F]/15 mb-3" />
                  <span className="font-bold text-slate-800 text-sm">{sig.name}</span>
                  <span className="text-xs text-slate-500 mt-0.5">{sig.role}</span>
                </div>
              ))}
            </div>
            <div className="text-center mt-10 pt-6 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Documento pedagógico oficial gerado pelo sistema IncluiAI.<br />
                Emitido por: {profile?.generated_by_name || user.name} · Data: {genDate} · Versão {profile?.version_number} · Código de Registro {registrationCode}
              </p>
            </div>
          </div>

        </>
      )}

      {/* MODALS */}
      {showVersions && (
        <VersionModal
          versions={versions}
          onClose={() => setShowVersions(false)}
          onSelect={(v) => setProfile(v)}
        />
      )}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          studentName={student.name}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {showManualEdit && data && (
        <ManualEditModal
          initialData={data}
          userName={user.name}
          onSave={handleManualSave}
          onCancel={() => setShowManualEdit(false)}
        />
      )}
      {showUpgradeModal && (
        <UpgradeModal onClose={() => setShowUpgradeModal(false)} />
      )}
    </div>
  );
};
