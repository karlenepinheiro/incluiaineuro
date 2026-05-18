import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles, ChevronDown, ChevronUp, FileText, Trash2, RefreshCw,
  CheckSquare, Square, Clock, User, Hash, BookOpen, Zap, Shield,
  MessageSquare, Eye, Printer, AlertCircle, X, Target, AlertTriangle,
  Star, Play, Package, Users, Settings, FileCheck, UserCheck, Monitor,
  Clipboard, Heart,
} from 'lucide-react';
import {
  Student, AEEActionPlanPeriod, AEEActionPlanJSON, AEEActionPlanRecord,
  ActionPlanItem, ActionPlanBlock, DocumentType, Protocol,
} from '../types';
import { AIService } from '../services/aiService';
import { AEEActionPlanService } from '../services/aeeActionPlanService';
import { AI_CREDIT_COSTS } from '../config/aiCosts';

// ── Paleta ────────────────────────────────────────────────────────────────────

const PETROL  = '#1F4E5F';
const TEAL    = '#0891B2';
const GOLD    = '#C69214';

// ── Configuração de blocos ────────────────────────────────────────────────────

type CoreBlockKey = 'welcomeRoutine' | 'priorityBarrier' | 'sessionScript' |
  'materials' | 'applicationGuide' | 'responseRecord';

type EnrichedBlockKey = 'gamesResources' | 'videosResources' | 'printedActivities' |
  'digitalResources' | 'dynamicsResources' | 'adaptationsGuide';

interface AEEBlockConfig {
  key: CoreBlockKey | EnrichedBlockKey;
  icon: React.ReactNode;
  bg: string;
  border: string;
  badge: string;
  badgeText: string;
}

const CORE_BLOCK_CONFIGS: AEEBlockConfig[] = [
  { key: 'welcomeRoutine',  icon: <Heart size={15} />,       bg: '#FFF0F6', border: '#F9A8D4', badge: '#DB2777', badgeText: 'Acolhida'         },
  { key: 'priorityBarrier', icon: <AlertTriangle size={15}/>, bg: '#FFF1F2', border: '#FECDD3', badge: '#E11D48', badgeText: 'Barreira'          },
  { key: 'sessionScript',   icon: <Clipboard size={15} />,   bg: '#EEF2FF', border: '#C7D2FE', badge: '#4F46E5', badgeText: 'Roteiro'           },
  { key: 'materials',       icon: <Package size={15} />,     bg: '#F0FDFA', border: '#99F6E4', badge: '#0D9488', badgeText: 'Materiais'          },
  { key: 'applicationGuide',icon: <Settings size={15} />,    bg: '#FFF7ED', border: '#FED7AA', badge: '#EA580C', badgeText: 'Como Aplicar'       },
  { key: 'responseRecord',  icon: <UserCheck size={15} />,   bg: '#F1F5F9', border: '#E2E8F0', badge: '#64748B', badgeText: 'Registro Resposta'  },
];

const ENRICHED_BLOCK_CONFIGS: AEEBlockConfig[] = [
  { key: 'gamesResources',    icon: <Star size={15} />,     bg: '#F0FDF4', border: '#BBF7D0', badge: '#16A34A', badgeText: 'Jogos'               },
  { key: 'videosResources',   icon: <Play size={15} />,     bg: '#EFF6FF', border: '#BFDBFE', badge: '#2563EB', badgeText: 'Vídeos'              },
  { key: 'printedActivities', icon: <FileCheck size={15}/>, bg: '#FFFBEB', border: '#FDE68A', badge: '#D97706', badgeText: 'Atividades Impressas' },
  { key: 'digitalResources',  icon: <Monitor size={15} />,  bg: '#F5F3FF', border: '#DDD6FE', badge: '#7C3AED', badgeText: 'Digital'             },
  { key: 'dynamicsResources', icon: <Users size={15} />,    bg: '#FFF0F6', border: '#F9A8D4', badge: '#DB2777', badgeText: 'Dinâmicas'           },
  { key: 'adaptationsGuide',  icon: <Zap size={15} />,      bg: '#ECFDF5', border: '#A7F3D0', badge: '#059669', badgeText: 'Adaptações'          },
];

const ALL_BLOCK_CONFIGS = [...CORE_BLOCK_CONFIGS, ...ENRICHED_BLOCK_CONFIGS];

// ── Configuração de período ────────────────────────────────────────────────────

const PERIOD_CONFIG: Record<AEEActionPlanPeriod, { label: string; color: string; bg: string }> = {
  semanal:   { label: 'Semanal',    color: '#7C3AED', bg: '#F5F3FF' },
  quinzenal: { label: 'Quinzenal',  color: '#0891B2', bg: '#ECFEFF' },
  mensal:    { label: 'Mensal',     color: '#1D4ED8', bg: '#EFF6FF' },
  bimestral: { label: 'Bimestral',  color: '#047857', bg: '#ECFDF5' },
  semestral: { label: 'Semestral',  color: '#B45309', bg: '#FFFBEB' },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDateTimeBR(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

// ── PeriodBadge ───────────────────────────────────────────────────────────────

const AEEPeriodBadge: React.FC<{ period: AEEActionPlanPeriod }> = ({ period }) => {
  const cfg = PERIOD_CONFIG[period] ?? PERIOD_CONFIG.mensal;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
      style={{ background: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.color}30` }}
    >
      {cfg.label}
    </span>
  );
};

// ── ChecklistBlock ────────────────────────────────────────────────────────────

const AEEChecklistBlock: React.FC<{
  config: AEEBlockConfig;
  block: ActionPlanBlock;
  onToggle: (itemId: string) => void;
}> = ({ config, block, onToggle }) => {
  const done  = block.items.filter(i => i.done).length;
  const total = block.items.length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: config.bg, border: `1.5px solid ${config.border}` }}
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${config.border}` }}>
        <div className="flex items-center gap-2">
          <span style={{ color: config.badge }}>{config.icon}</span>
          <span className="text-sm font-bold text-gray-800">{block.title}</span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${config.badge}18`, color: config.badge }}
          >
            {config.badgeText}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 bg-white rounded-full overflow-hidden" style={{ border: `1px solid ${config.border}` }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: config.badge }} />
          </div>
          <span className="text-[10px] font-bold" style={{ color: config.badge }}>{done}/{total}</span>
        </div>
      </div>
      <div className="divide-y">
        {block.items.map(item => (
          <button
            key={item.id}
            onClick={() => onToggle(item.id)}
            className="w-full flex items-start gap-3 px-4 py-2.5 text-left transition hover:brightness-95"
            style={{ background: item.done ? `${config.badge}08` : 'transparent' }}
          >
            <span className="mt-0.5 shrink-0" style={{ color: item.done ? config.badge : '#9CA3AF' }}>
              {item.done ? <CheckSquare size={15} /> : <Square size={15} />}
            </span>
            <span
              className="text-sm leading-snug"
              style={{ color: item.done ? '#6B7280' : '#1F2937', textDecoration: item.done ? 'line-through' : 'none' }}
            >
              {item.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ── PlanCard ──────────────────────────────────────────────────────────────────

const AEEPlanCard: React.FC<{
  record: AEEActionPlanRecord;
  index: number;
  onDelete: (id: string) => void;
  onPrint: (plan: AEEActionPlanJSON) => void;
  localDone: Record<string, boolean>;
  onToggleItem: (planId: string, blockKey: string, itemId: string) => void;
}> = ({ record, index, onDelete, onPrint, localDone, onToggleItem }) => {
  const [expanded, setExpanded] = useState(index === 0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const plan   = record.plan_json;
  const period = plan?.period ?? 'mensal';
  const cfg    = PERIOD_CONFIG[period] ?? PERIOD_CONFIG.mensal;

  const totalItems = ALL_BLOCK_CONFIGS.reduce((acc, b) => {
    const block = (plan as any)?.[b.key];
    return acc + (block?.items?.length ?? 0);
  }, 0);
  const doneItems = ALL_BLOCK_CONFIGS.reduce((acc, b) => {
    const block = (plan as any)?.[b.key];
    return acc + (block?.items?.filter((i: ActionPlanItem) =>
      localDone[`${record.id}:${b.key}:${i.id}`] ?? i.done).length ?? 0);
  }, 0);
  const overallPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const mergedPlan = (planJson: AEEActionPlanJSON): AEEActionPlanJSON => {
    const p = { ...planJson } as any;
    for (const b of ALL_BLOCK_CONFIGS) {
      const block = p[b.key];
      if (block) {
        p[b.key] = {
          ...block,
          items: block.items.map((i: ActionPlanItem) => ({
            ...i,
            done: localDone[`${record.id}:${b.key}:${i.id}`] ?? i.done,
          })),
        };
      }
    }
    return p as AEEActionPlanJSON;
  };

  function renderBlock(bcfg: AEEBlockConfig) {
    const block = (plan as any)[bcfg.key] as ActionPlanBlock | undefined;
    if (!block) return null;
    const mergedItems = block.items.map((i: ActionPlanItem) => ({
      ...i,
      done: localDone[`${record.id}:${bcfg.key}:${i.id}`] ?? i.done,
    }));
    return (
      <AEEChecklistBlock
        key={bcfg.key}
        config={bcfg}
        block={{ ...block, items: mergedItems }}
        onToggle={itemId => onToggleItem(record.id, bcfg.key, itemId)}
      />
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-sm transition-all duration-200"
      style={{ border: `1.5px solid ${expanded ? cfg.color + '40' : '#E7E2D8'}`, background: '#FFFFFF' }}
    >
      {/* Card Header */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
        style={{ background: expanded ? `${cfg.bg}` : '#FAFAF8' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: cfg.color, color: '#fff' }}
        >
          V{plan?.version ?? index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <AEEPeriodBadge period={period} />
            <span className="text-sm font-bold text-gray-800 truncate">
              Plano AEE {PERIOD_CONFIG[period]?.label} — {formatDateTimeBR(record.created_at).split(',')[0]}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-[11px] text-gray-500">
              <Clock size={10} /> {formatDateTimeBR(record.created_at)}
            </span>
            {plan?.generatedByName && (
              <span className="flex items-center gap-1 text-[11px] text-gray-500">
                <User size={10} /> {plan.generatedByName}
              </span>
            )}
            {plan?.registrationNumber && (
              <span className="flex items-center gap-1 text-[11px] font-mono text-gray-400">
                <Hash size={10} /> {plan.registrationNumber}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${overallPct}%`, background: cfg.color }} />
            </div>
            <span className="text-[10px] font-bold" style={{ color: cfg.color }}>{overallPct}%</span>
          </div>
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <button
              title="Imprimir / PDF"
              onClick={() => onPrint(mergedPlan(plan))}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition"
            >
              <Printer size={14} />
            </button>
            {!confirmDelete ? (
              <button
                title="Excluir plano"
                onClick={() => setConfirmDelete(true)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
              >
                <Trash2 size={14} />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onDelete(record.id)}
                  className="text-[11px] font-bold px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 transition"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
          <span className="text-gray-400">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && plan && (
        <div className="p-5 space-y-5" style={{ borderTop: `1px solid ${cfg.color}20` }}>

          {/* Objetivo da Sessão */}
          {plan.sessionObjective && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: '#ECFEFF', border: '1.5px solid #A5F3FC' }}>
              <Target size={16} style={{ color: TEAL, marginTop: 2, flexShrink: 0 }} />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: TEAL }}>Objetivo do Atendimento AEE</p>
                <p className="text-sm text-gray-800 mt-0.5 leading-snug">{plan.sessionObjective}</p>
              </div>
            </div>
          )}

          {/* Acolhida + Barreira */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Contexto do Período</p>
            <div className="grid md:grid-cols-2 gap-4">
              {CORE_BLOCK_CONFIGS.filter(b => b.key === 'welcomeRoutine' || b.key === 'priorityBarrier').map(renderBlock)}
            </div>
          </div>

          {/* Roteiro */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Roteiro do Atendimento</p>
            {renderBlock(CORE_BLOCK_CONFIGS.find(b => b.key === 'sessionScript')!)}
          </div>

          {/* Recursos — jogos, vídeos, dinâmicas, digital, impressas */}
          {(['gamesResources','videosResources','printedActivities','digitalResources','dynamicsResources'] as const).some(k => (plan as any)[k]) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Recursos e Estratégias</p>
              <div className="grid md:grid-cols-2 gap-4">
                {ENRICHED_BLOCK_CONFIGS.filter(b =>
                  ['gamesResources','videosResources','printedActivities','digitalResources','dynamicsResources'].includes(b.key)
                ).map(renderBlock)}
              </div>
            </div>
          )}

          {/* Materiais + Como Aplicar + Adaptar */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Aplicação e Materiais</p>
            <div className="grid md:grid-cols-2 gap-4">
              {CORE_BLOCK_CONFIGS.filter(b => b.key === 'materials' || b.key === 'applicationGuide').map(renderBlock)}
              {plan.adaptationsGuide && renderBlock(ENRICHED_BLOCK_CONFIGS.find(b => b.key === 'adaptationsGuide')!)}
            </div>
          </div>

          {/* Registro da Resposta */}
          {plan.responseRecord && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Registro do Atendimento</p>
              {renderBlock(CORE_BLOCK_CONFIGS.find(b => b.key === 'responseRecord')!)}
            </div>
          )}

          {/* Próximo Passo */}
          {plan.nextStep && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: '#EFF9FF', border: '1.5px solid #BFDBFE' }}>
              <Shield size={16} style={{ color: PETROL, marginTop: 2, flexShrink: 0 }} />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PETROL }}>Próximo Passo</p>
                <p className="text-sm text-gray-800 mt-0.5 leading-snug">{plan.nextStep}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-[10px] font-mono text-gray-400">
              {plan.registrationNumber} · gerado em {formatDateTimeBR(plan.generatedAt)}
            </p>
            <button
              onClick={() => onPrint(mergedPlan(plan))}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
              style={{ background: TEAL }}
            >
              <Printer size={13} /> Baixar PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── PrintModal ────────────────────────────────────────────────────────────────

const AEEPrintModal: React.FC<{
  plan: AEEActionPlanJSON;
  studentName: string;
  onClose: () => void;
}> = ({ plan, studentName, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const periodLabel = PERIOD_CONFIG[plan.period]?.label ?? 'Mensal';

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win || !ref.current) return;
    win.document.write(`
      <html><head>
        <title>Plano de Ação AEE — ${studentName}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
          body { background: #fff; color: #1f2937; font-size: 11px; padding: 20px 24px; }
          h1 { font-size: 17px; font-weight: 800; color: #0891B2; margin-bottom: 2px; }
          .sub { font-size: 10px; color: #6b7280; margin-bottom: 14px; }
          .section-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9ca3af; margin: 14px 0 6px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .block { border-radius: 10px; overflow: hidden; border: 1.5px solid #e5e7eb; break-inside: avoid; }
          .block-header { padding: 7px 11px; font-size: 10px; font-weight: 700; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
          .item { display: flex; align-items: flex-start; gap: 7px; padding: 5px 11px; border-bottom: 1px solid #f3f4f6; font-size: 10px; line-height: 1.45; }
          .item:last-child { border-bottom: none; }
          .check { font-size: 13px; color: #9ca3af; flex-shrink: 0; margin-top: 1px; }
          .done .check { color: #16a34a; }
          .done span { text-decoration: line-through; color: #9ca3af; }
          .banner { border-radius: 10px; padding: 9px 13px; margin-bottom: 10px; }
          .banner-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 3px; }
          .banner-text { font-size: 11px; line-height: 1.5; }
          .meta { margin-top: 14px; font-size: 8px; color: #9ca3af; font-family: monospace; }
          @media print { body { padding: 10px 16px; } .no-print { display: none; } .block { break-inside: avoid; } }
        </style>
      </head><body>
        ${ref.current.innerHTML}
        <script>window.print(); window.close();</script>
      </body></html>
    `);
    win.document.close();
  };

  function renderPrintBlock(bcfg: AEEBlockConfig) {
    const block = (plan as any)[bcfg.key] as ActionPlanBlock | undefined;
    if (!block || block.items.length === 0) return null;
    return (
      <div key={bcfg.key} className="block" style={{ borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${bcfg.border}`, breakInside: 'avoid' as const }}>
        <div className="block-header" style={{ padding: '7px 11px', fontSize: 10, fontWeight: 700, background: bcfg.bg, borderBottom: `1px solid ${bcfg.border}` }}>{block.title}</div>
        <div>
          {block.items.map((item: ActionPlanItem) => (
            <div key={item.id} className={item.done ? 'item done' : 'item'} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '5px 11px', borderBottom: '1px solid #f3f4f6', fontSize: 10, lineHeight: 1.45 }}>
              <span className="check" style={{ fontSize: 13, color: item.done ? '#16a34a' : '#9ca3af', flexShrink: 0, marginTop: 1 }}>{item.done ? '✓' : '☐'}</span>
              <span style={item.done ? { textDecoration: 'line-through', color: '#9ca3af' } : {}}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-gray-800">Pré-visualização — Plano AEE</h2>
            <p className="text-xs text-gray-500">{studentName} · Plano {periodLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
              style={{ background: TEAL }}
            >
              <Printer size={15} /> Imprimir / PDF
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div ref={ref} className="p-6">
          <h1 style={{ fontSize: 20, fontWeight: 800, color: TEAL, marginBottom: 4 }}>
            Plano de Ação AEE — {studentName}
          </h1>
          <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 16 }}>
            <AEEPeriodBadge period={plan.period} />
            &nbsp;&nbsp;Gerado por: {plan.generatedByName} &nbsp;·&nbsp; {formatDateTimeBR(plan.generatedAt)}
            &nbsp;·&nbsp; Nº {plan.registrationNumber}
          </p>

          {plan.sessionObjective && (
            <div className="banner" style={{ background: '#ECFEFF', border: '1.5px solid #A5F3FC', borderRadius: 10, padding: '9px 13px', marginBottom: 12 }}>
              <p className="banner-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.06em', color: TEAL, marginBottom: 3 }}>Objetivo do Atendimento AEE</p>
              <p className="banner-text" style={{ fontSize: 11, lineHeight: 1.5 }}>{plan.sessionObjective}</p>
            </div>
          )}

          <p className="section-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.08em', color: '#9ca3af', margin: '14px 0 6px' }}>Contexto do Período</p>
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            {CORE_BLOCK_CONFIGS.filter(b => b.key === 'welcomeRoutine' || b.key === 'priorityBarrier').map(renderPrintBlock)}
          </div>

          <p className="section-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.08em', color: '#9ca3af', margin: '14px 0 6px' }}>Roteiro do Atendimento</p>
          <div style={{ marginBottom: 12 }}>
            {renderPrintBlock(CORE_BLOCK_CONFIGS.find(b => b.key === 'sessionScript')!)}
          </div>

          {(['gamesResources','videosResources','printedActivities','digitalResources','dynamicsResources'] as const).some(k => (plan as any)[k]) && (
            <>
              <p className="section-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.08em', color: '#9ca3af', margin: '14px 0 6px' }}>Recursos e Estratégias</p>
              <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {ENRICHED_BLOCK_CONFIGS.filter(b =>
                  ['gamesResources','videosResources','printedActivities','digitalResources','dynamicsResources'].includes(b.key)
                ).map(renderPrintBlock)}
              </div>
            </>
          )}

          <p className="section-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.08em', color: '#9ca3af', margin: '14px 0 6px' }}>Aplicação e Materiais</p>
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            {CORE_BLOCK_CONFIGS.filter(b => b.key === 'materials' || b.key === 'applicationGuide').map(renderPrintBlock)}
            {plan.adaptationsGuide && renderPrintBlock(ENRICHED_BLOCK_CONFIGS.find(b => b.key === 'adaptationsGuide')!)}
          </div>

          <p className="section-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.08em', color: '#9ca3af', margin: '14px 0 6px' }}>Registro do Atendimento</p>
          <div style={{ marginBottom: 12 }}>
            {renderPrintBlock(CORE_BLOCK_CONFIGS.find(b => b.key === 'responseRecord')!)}
          </div>

          {plan.nextStep && (
            <div className="banner" style={{ background: '#EFF9FF', border: '1.5px solid #BFDBFE', borderRadius: 10, padding: '9px 13px', marginBottom: 12 }}>
              <p className="banner-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.06em', color: PETROL, marginBottom: 3 }}>Próximo Passo</p>
              <p className="banner-text" style={{ fontSize: 11, lineHeight: 1.5 }}>{plan.nextStep}</p>
            </div>
          )}

          <p className="meta" style={{ marginTop: 14, fontSize: 8, color: '#9ca3af', fontFamily: 'monospace' }}>
            {plan.registrationNumber} · IncluiAI — Plano de Ação AEE · {formatDateTimeBR(plan.generatedAt)}
          </p>
        </div>
      </div>
    </div>
  );
};

// ── AEEActionPlanTab (main export) ────────────────────────────────────────────

interface AEEActionPlanTabProps {
  student: Student;
  user: any;
  protocols: Protocol[];
}

export const AEEActionPlanTab: React.FC<AEEActionPlanTabProps> = ({ student, user, protocols }) => {
  const [records, setRecords]       = useState<AEEActionPlanRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [period, setPeriod]         = useState<AEEActionPlanPeriod>('mensal');
  const [error, setError]           = useState('');
  const [printPlan, setPrintPlan]   = useState<AEEActionPlanJSON | null>(null);
  const [localDone, setLocalDone]   = useState<Record<string, boolean>>({});

  const hasPAEE = protocols.some(p => p.type === DocumentType.PAEE);

  const paeeDoc = protocols.find(p => p.type === DocumentType.PAEE);
  const paeeContent = paeeDoc
    ? Object.entries((paeeDoc as any).structuredData?.sections ?? {})
        .map(([k, v]: any) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('\n')
        .slice(0, 3000)
    : '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await AEEActionPlanService.listByStudent(student.id);
      setRecords(data);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar planos AEE.');
    } finally {
      setLoading(false);
    }
  }, [student.id]);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    if (!hasPAEE) return;
    setError('');
    setGenerating(true);
    try {
      const tenantId      = user?.tenant_id ?? user?.tenantId ?? '';
      const createdBy     = user?.id ?? '';
      const createdByName = user?.name ?? user?.email ?? 'Profissional AEE';

      const plan = await AIService.generateAEEActionPlan(student, user, period, paeeContent, 1);

      await AEEActionPlanService.save({
        studentId:    student.id,
        tenantId,
        createdBy,
        createdByName,
        planJson:     plan,
        sourceSnapshot: { paeeId: paeeDoc?.id ?? null },
      });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Erro ao gerar plano AEE. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await AEEActionPlanService.archive(id);
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch {
      setError('Erro ao arquivar plano.');
    }
  };

  const handleToggleItem = (planId: string, blockKey: string, itemId: string) => {
    const key = `${planId}:${blockKey}:${itemId}`;
    setLocalDone(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const cost = AI_CREDIT_COSTS.PLANO_ACAO_AEE;

  return (
    <div className="space-y-5">
      {printPlan && (
        <AEEPrintModal plan={printPlan} studentName={student.name} onClose={() => setPrintPlan(null)} />
      )}

      {/* ── Header ── */}
      <div
        className="rounded-2xl p-6 overflow-hidden relative"
        style={{ background: 'linear-gradient(135deg, #0C4A6E 0%, #164E63 100%)' }}
      >
        <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
          <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full" style={{ background: GOLD }} />
          <div className="absolute -left-8 -bottom-10 w-36 h-36 rounded-full" style={{ background: GOLD }} />
        </div>

        <div className="relative">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                <BookOpen size={20} style={{ color: GOLD }} />
                Plano de Ação — AEE
              </h2>
              <p className="text-sm text-cyan-100 mt-1 max-w-xl">
                Roteiro prático das sessões do Atendimento Educacional Especializado —
                barreira, acolhida, roteiro, jogos, recursos e registro.
                Gerado a partir do <strong className="text-white">PAEE</strong> e do perfil de{' '}
                <strong className="text-white">{student.name}</strong>.
              </p>
            </div>
            {records.length > 0 && (
              <div
                className="rounded-xl px-4 py-2.5 text-center"
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <p className="text-2xl font-extrabold text-white">{records.length}</p>
                <p className="text-[11px] text-cyan-200">plano{records.length !== 1 ? 's' : ''} AEE</p>
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            {/* Seletor de período */}
            <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.12)' }}>
              {(['semanal', 'quinzenal', 'mensal', 'bimestral', 'semestral'] as AEEActionPlanPeriod[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition"
                  style={period === p
                    ? { background: '#fff', color: '#0C4A6E' }
                    : { color: '#BAE6FD' }
                  }
                >
                  {PERIOD_CONFIG[p].label}
                </button>
              ))}
            </div>

            {hasPAEE ? (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                style={{ background: GOLD }}
              >
                {generating ? (
                  <><RefreshCw size={15} className="animate-spin" /> Gerando plano AEE…</>
                ) : (
                  <><Sparkles size={15} /> Gerar novo Plano AEE · {cost} créd.</>
                )}
              </button>
            ) : (
              <div
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-not-allowed opacity-60"
                style={{ background: GOLD, color: '#fff' }}
                title="Gere o PAEE antes de criar o Plano de Ação AEE"
              >
                <Sparkles size={15} /> Gerar Plano AEE · {cost} créd.
              </div>
            )}

            <button
              onClick={load}
              className="flex items-center gap-1.5 text-xs text-cyan-200 hover:text-white transition"
            >
              <RefreshCw size={13} /> Atualizar
            </button>
          </div>

          <p className="text-[11px] text-cyan-300 mt-3">
            O plano <strong className="text-white">Semanal</strong> é o mais indicado para roteiro de sessão.
            Cada geração cria uma nova versão — o histórico é preservado.
          </p>
        </div>
      </div>

      {/* ── Aviso: PAEE ausente ── */}
      {!hasPAEE && (
        <div
          className="rounded-2xl p-5 flex items-start gap-4"
          style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A' }}
        >
          <AlertCircle size={20} style={{ color: '#D97706', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="text-sm font-bold text-amber-800">PAEE necessário para geração com IA</p>
            <p className="text-sm text-amber-700 mt-1">
              Para gerar o Plano de Ação AEE com inteligência artificial, primeiro gere o{' '}
              <strong>PAEE</strong> do aluno. O Plano de Ação AEE é construído a partir do PAEE,
              Estudo de Caso, Perfil Inteligente e demais evidências pedagógicas de{' '}
              <strong>{student.name}</strong>.
            </p>
            <p className="text-xs text-amber-600 mt-2">
              Acesse a aba <strong>Dossiê / Documentos</strong> → <strong>PAEE</strong> → Gerar com IA.
            </p>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">{error}</p>
          </div>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <RefreshCw size={18} className="animate-spin" />
          <span className="text-sm">Carregando planos AEE…</span>
        </div>
      ) : records.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ background: '#FAFAF8', border: '2px dashed #E7E2D8' }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: '#ECFEFF', border: '1.5px solid #A5F3FC' }}
          >
            <BookOpen size={28} style={{ color: TEAL }} />
          </div>
          <h3 className="text-base font-bold text-gray-700 mb-1">Nenhum Plano AEE gerado ainda</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6">
            {hasPAEE
              ? `Selecione o período e clique em "Gerar novo Plano AEE" para criar o primeiro plano para ${student.name}.`
              : `Gere o PAEE primeiro — ele é o norteador do Plano de Ação AEE.`}
          </p>
          <div className="grid sm:grid-cols-3 gap-3 max-w-lg mx-auto text-left">
            {CORE_BLOCK_CONFIGS.slice(0, 3).map(b => (
              <div key={b.key} className="rounded-xl p-3" style={{ background: b.bg, border: `1.5px solid ${b.border}` }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span style={{ color: b.badge }}>{b.icon}</span>
                  <span className="text-[11px] font-bold text-gray-700">{b.badgeText}</span>
                </div>
                <div className="space-y-1">
                  {[1, 2, 3].map(n => (
                    <div key={n} className="h-2 rounded-full" style={{ background: `${b.badge}25`, width: `${70 + n * 8}%` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              {records.length} plano{records.length !== 1 ? 's' : ''} AEE · mais recente primeiro
            </p>
            <p className="text-[11px] text-gray-400">Clique em um card para expandir</p>
          </div>
          {records.map((r, i) => (
            <AEEPlanCard
              key={r.id}
              record={r}
              index={i}
              onDelete={handleDelete}
              onPrint={setPrintPlan}
              localDone={localDone}
              onToggleItem={handleToggleItem}
            />
          ))}
        </div>
      )}
    </div>
  );
};
