import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles, Download, RefreshCw, History, UserCheck,
  BookOpen, Lightbulb, Brain, CheckCircle,
  Activity, Star, Eye, Stethoscope, X, ChevronRight,
  AlertCircle, ShieldAlert, AlertTriangle,
  Pencil, Trash2, Hash, Plus, Lock, Save,
} from 'lucide-react';
import { Student, User as UserType, PlanTier, resolvePlanTier } from '../types';
import { AIService, friendlyAIError } from '../services/aiService';
import { AI_CREDIT_COSTS } from '../config/aiCosts';
import {
  IntelligentProfileService,
  IntelligentProfileRecord,
  IntelligentProfileJSON,
  ChecklistItem,
  ChallengeItem,
  RecommendedActivity,
  nextProfileVersion,
} from '../services/intelligentProfileService';
import { calculateAge } from '../utils/dateUtils';
import { generateDocumentCodeFromSeed } from '../utils/documentCodes';
import { IntelligentProfileExportRow } from './fichas/IntelligentProfileExportRow';
import { IntelligentProfilePdfPreview } from './document-preview/IntelligentProfilePdfPreview';

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

  // Recuperação segura quando a IA já entregou um resultado válido mas o
  // save no banco falhou. Guarda o resultado gerado (na sessão, em memória —
  // nunca em localStorage/sessionStorage) para permitir "Tentar salvar
  // novamente" SEM nova chamada de IA e SEM nova cobrança.
  const [pendingSave, setPendingSave] = useState<{
    json: IntelligentProfileJSON;
    generationType: 'initial' | 'update' | 'manual_edit';
    versionNumber: number;
    summary?: string;
  } | null>(null);
  const [pendingSaveError, setPendingSaveError] = useState('');
  const [savingPending, setSavingPending]       = useState(false);

  // Trava síncrona contra duplo-disparo de geração (antes de o React
  // re-renderizar e o botão ficar disabled).
  const genLock = useRef(false);

  const PROFILE_COST = AI_CREDIT_COSTS.PERFIL_INTELIGENTE;

  // ── Plan gates ─────────────────────────────────────────────────────────────
  const userTier    = resolvePlanTier(user.plan);
  const isFreeUser  = userTier === PlanTier.FREE;
  const isDemoLocked = isFreeUser && tenantProfileCount >= 1;

  /** Registro "rascunho" para exibir o perfil gerado mesmo antes de persistir. */
  const makeDraftRecord = (
    json: IntelligentProfileJSON,
    generationType: 'initial' | 'update' | 'manual_edit',
    versionNumber: number,
  ): IntelligentProfileRecord => ({
    id: '__draft__',
    student_id: student.id,
    tenant_id: (user as any).tenant_id ?? '',
    generated_by: user.id ?? null,
    generated_by_name: user.name ?? null,
    version_number: versionNumber,
    profile_json: json,
    generation_type: generationType,
    summary: null,
    created_at: json.generatedAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  /** Próxima versão = max(version_number existente) + 1 — nunca (selecionada
   *  + 1). Escopo já isolado por student_id nas queries do service. (M-06) */
  const nextVersion = () => nextProfileVersion(versions);

  /**
   * Persiste um perfil já gerado. NÃO chama a IA. NÃO reserva/debita crédito.
   * Em falha de banco: preserva o conteúdo na tela e habilita o retry.
   */
  const persistProfile = async (
    json: IntelligentProfileJSON,
    generationType: 'initial' | 'update' | 'manual_edit',
    versionNumber: number,
    summary?: string,
  ) => {
    setSavingPending(true);
    setPendingSaveError('');
    try {
      const saved = await IntelligentProfileService.save({
        studentId:       student.id,
        tenantId:        (user as any).tenant_id ?? '',
        generatedBy:     user.id,
        generatedByName: user.name,
        profileJson:     json,
        generationType,
        summary,
        versionNumber,
      });
      if (!saved) throw new Error('save_returned_null');
      setPendingSave(null);
      setShowManualEdit(false);
      await loadData();
    } catch (e: any) {
      console.error('[IntelligentProfileTab] persistProfile falhou:', e?.message ?? e);
      setPendingSave({ json, generationType, versionNumber, summary });
      setProfile(makeDraftRecord(json, generationType, versionNumber));
      setShowManualEdit(false);
      setPendingSaveError(
        'Documento gerado com sucesso, mas não foi possível salvá-lo. Seu conteúdo foi ' +
        'preservado nesta tela. Tente salvar novamente sem gerar ou consumir novos créditos.',
      );
    } finally {
      setSavingPending(false);
    }
  };

  const handleRetrySave = () => {
    if (!pendingSave || savingPending) return;
    void persistProfile(
      pendingSave.json, pendingSave.generationType, pendingSave.versionNumber, pendingSave.summary,
    );
  };

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
    if (genLock.current) return;
    if (isDemoLocked) { setShowUpgradeModal(true); return; }
    genLock.current = true;
    // operationId por tentativa de geração — o Gateway usa para reserva/commit/
    // release idempotentes: duplo clique ou retry de rede não reserva/debita 2×.
    const operationId = (globalThis.crypto?.randomUUID?.() ?? `op-${Date.now()}-${Math.random()}`);
    setError('');
    setIsGenerating(true);
    try {
      // Regenerar a partir de uma versão antiga deve produzir max + 1, não
      // (versão selecionada + 1). (auditoria 30/08/2026 — M-06)
      const newVersion = isUpdate ? nextVersion() : 1;
      const profileJson = await AIService.generateIntelligentProfile(
        student, user as any, newVersion, operationId,
      );
      // Resultado já validado (estrutura + placeholders) e crédito confirmado
      // no Gateway. Persiste — em falha, o conteúdo fica na tela para retry.
      await persistProfile(
        profileJson,
        isUpdate ? 'update' : 'initial',
        newVersion,
        isUpdate ? 'Perfil atualizado com novos dados' : undefined,
      );
    } catch (e: any) {
      setError(friendlyAIError(e));
    } finally {
      setIsGenerating(false);
      genLock.current = false;
    }
  };

  const handleManualSave = async (editedJson: IntelligentProfileJSON) => {
    setError('');
    await persistProfile(
      editedJson, 'manual_edit', nextVersion(), `Edição manual realizada por ${user.name}`,
    );
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
          <p className="text-xs text-slate-400 mt-3">Custo: <strong>{PROFILE_COST} créditos</strong></p>
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
              {isGenerating ? 'Processando…' : `Atualizar com IA · ${PROFILE_COST} créd.`}
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
              <Lock size={15} /> Exportar
            </button>
          ) : profile ? (
            <IntelligentProfileExportRow
              record={profile}
              student={student}
              user={user}
              school={(user as any)?.schoolConfigs?.[0] ?? null}
              onDownloadPdf={handleExportPdf}
              isDownloadingPdf={exportingPdf}
            />
          ) : null}
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

      {/* RECUPERAÇÃO — geração OK, save falhou */}
      {pendingSave && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {pendingSaveError || 'Documento gerado, mas não foi possível salvá-lo. O conteúdo está preservado nesta tela.'}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Salvar novamente não gera novo conteúdo nem consome créditos.
            </p>
          </div>
          <button
            onClick={handleRetrySave}
            disabled={savingPending}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-xl font-semibold text-sm shrink-0 transition-colors"
          >
            {savingPending ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {savingPending ? 'Salvando…' : 'Tentar salvar novamente'}
          </button>
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

      {!isGenerating && profile && data && (
        <IntelligentProfilePdfPreview
          record={profile}
          student={student}
          school={(user as any)?.schoolConfigs?.[0] ?? null}
          generatedByName={profile.generated_by_name ?? user.name}
        />
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
