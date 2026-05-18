import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles, ChevronDown, ChevronUp, FileText, Trash2, RefreshCw,
  CheckSquare, Square, Clock, User, Hash, BookOpen, Zap, Shield,
  MessageSquare, Eye, Printer, AlertCircle, X,
  Target, AlertTriangle, Star, Play, Package, Users, Settings, FileCheck, UserCheck,
} from 'lucide-react';
import { Student, ActionPlanPeriod, ActionPlanJSON, ActionPlanRecord, ActionPlanItem } from '../types';
import { AIService } from '../services/aiService';
import { ActionPlanService } from '../services/actionPlanService';
import { AI_CREDIT_COSTS } from '../config/aiCosts';

// ── Paleta ────────────────────────────────────────────────────────────────────

const PETROL = '#1F4E5F';
const GOLD   = '#C69214';

// ── Configuração de blocos ────────────────────────────────────────────────────

type CoreBlockKey = 'beforeClass' | 'duringClass' | 'activitiesStrategies' |
  'assessment' | 'attentionObservations' | 'communicationTeam';

type EnrichedBlockKey = 'focusPlan' | 'mainBarrier' |
  'suggestedGames' | 'suggestedVideos' | 'suggestedMaterials' | 'suggestedDynamics' |
  'adaptations' | 'evidenceRecording' | 'studentResponse';

interface BlockConfig {
  key: CoreBlockKey | EnrichedBlockKey;
  icon: React.ReactNode;
  bg: string;
  border: string;
  badge: string;
  badgeText: string;
}

// Blocos originais — obrigatórios em todos os planos
const BLOCK_CONFIGS: BlockConfig[] = [
  { key: 'beforeClass',         icon: <Clock size={15} />,       bg: '#EEF2FF', border: '#C7D2FE', badge: '#4F46E5', badgeText: 'Preparação'   },
  { key: 'duringClass',         icon: <Zap size={15} />,         bg: '#EFF6FF', border: '#BFDBFE', badge: '#2563EB', badgeText: 'Em Sala'       },
  { key: 'activitiesStrategies',icon: <BookOpen size={15} />,    bg: '#F0FDF4', border: '#BBF7D0', badge: '#16A34A', badgeText: 'Atividades'    },
  { key: 'assessment',          icon: <CheckSquare size={15} />, bg: '#FFFBEB', border: '#FDE68A', badge: '#D97706', badgeText: 'Avaliação'     },
  { key: 'attentionObservations',icon: <Eye size={15} />,        bg: '#FFF1F2', border: '#FECDD3', badge: '#E11D48', badgeText: 'Atenção'       },
  { key: 'communicationTeam',   icon: <MessageSquare size={15} />,bg: '#F0FDFA', border: '#99F6E4', badge: '#0D9488', badgeText: 'Comunicação'  },
];

// Blocos enriquecidos — opcionais, gerados apenas em planos novos
const ENRICHED_BLOCK_CONFIGS: BlockConfig[] = [
  { key: 'focusPlan',        icon: <Target size={15} />,       bg: '#FFFBEB', border: '#FDE68A', badge: '#D97706', badgeText: 'Foco do Plano'        },
  { key: 'mainBarrier',      icon: <AlertTriangle size={15} />,bg: '#FFF1F2', border: '#FECDD3', badge: '#E11D48', badgeText: 'Barreira em Sala'     },
  { key: 'suggestedGames',   icon: <Star size={15} />,         bg: '#F0FDF4', border: '#BBF7D0', badge: '#16A34A', badgeText: 'Jogos Sugeridos'       },
  { key: 'suggestedVideos',  icon: <Play size={15} />,         bg: '#EFF6FF', border: '#BFDBFE', badge: '#2563EB', badgeText: 'Vídeos Sugeridos'      },
  { key: 'suggestedMaterials',icon: <Package size={15} />,     bg: '#F0FDFA', border: '#99F6E4', badge: '#0D9488', badgeText: 'Materiais Sugeridos'   },
  { key: 'suggestedDynamics',icon: <Users size={15} />,        bg: '#F5F3FF', border: '#DDD6FE', badge: '#7C3AED', badgeText: 'Dinâmicas Sugeridas'  },
  { key: 'adaptations',      icon: <Settings size={15} />,     bg: '#FFF7ED', border: '#FED7AA', badge: '#EA580C', badgeText: 'Adaptações'            },
  { key: 'evidenceRecording',icon: <FileCheck size={15} />,    bg: '#F8FAFC', border: '#CBD5E1', badge: '#64748B', badgeText: 'Registro de Evidências'},
  { key: 'studentResponse',  icon: <UserCheck size={15} />,    bg: '#F1F5F9', border: '#E2E8F0', badge: '#94A3B8', badgeText: 'Resposta do Aluno'     },
];

// ── Configuração de período ────────────────────────────────────────────────────

const PERIOD_CONFIG: Record<ActionPlanPeriod, { label: string; color: string; bg: string }> = {
  semanal:   { label: 'Semanal',   color: '#7C3AED', bg: '#F5F3FF' },
  mensal:    { label: 'Mensal',    color: '#1D4ED8', bg: '#EFF6FF' },
  bimestral: { label: 'Bimestral', color: '#047857', bg: '#ECFDF5' },
  macro:     { label: 'Macro',     color: '#B45309', bg: '#FFFBEB' },
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

const PeriodBadge: React.FC<{ period: ActionPlanPeriod }> = ({ period }) => {
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

const ChecklistBlock: React.FC<{
  config: BlockConfig;
  block: { title: string; items: ActionPlanItem[] };
  onToggle: (itemId: string) => void;
}> = ({ config, block, onToggle }) => {
  const done = block.items.filter(i => i.done).length;
  const total = block.items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: config.bg, border: `1.5px solid ${config.border}` }}
    >
      {/* Header do bloco */}
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
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: config.badge }}
            />
          </div>
          <span className="text-[10px] font-bold" style={{ color: config.badge }}>{done}/{total}</span>
        </div>
      </div>

      {/* Itens */}
      <div className="divide-y" style={{ '--divider': config.border } as React.CSSProperties}>
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
              style={{
                color: item.done ? '#6B7280' : '#1F2937',
                textDecoration: item.done ? 'line-through' : 'none',
              }}
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

const PlanCard: React.FC<{
  record: ActionPlanRecord;
  index: number;
  onDelete: (id: string) => void;
  onPrint: (plan: ActionPlanJSON) => void;
  localDone: Record<string, boolean>;
  onToggleItem: (planId: string, blockKey: string, itemId: string) => void;
}> = ({ record, index, onDelete, onPrint, localDone, onToggleItem }) => {
  const [expanded, setExpanded] = useState(index === 0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const plan = record.plan_json;
  const period = plan?.period ?? 'mensal';
  const cfg = PERIOD_CONFIG[period] ?? PERIOD_CONFIG.mensal;

  const ALL_BLOCK_CONFIGS = [...BLOCK_CONFIGS, ...ENRICHED_BLOCK_CONFIGS];

  const totalItems = ALL_BLOCK_CONFIGS.reduce((acc, b) => {
    const block = (plan as any)?.[b.key];
    return acc + (block?.items?.length ?? 0);
  }, 0);
  const doneItems = ALL_BLOCK_CONFIGS.reduce((acc, b) => {
    const block = (plan as any)?.[b.key];
    return acc + (block?.items?.filter((i: ActionPlanItem) => localDone[`${record.id}:${b.key}:${i.id}`] ?? i.done).length ?? 0);
  }, 0);
  const overallPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const mergedPlan = (planJson: ActionPlanJSON): ActionPlanJSON => {
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
    return p as ActionPlanJSON;
  };

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-sm transition-all duration-200"
      style={{ border: `1.5px solid ${expanded ? cfg.color + '40' : '#E7E2D8'}`, background: '#FFFFFF' }}
    >
      {/* ── Card Header ── */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
        style={{ background: expanded ? `${cfg.bg}` : '#FAFAF8' }}
        onClick={() => setExpanded(v => !v)}
      >
        {/* Número de versão */}
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: cfg.color, color: '#fff' }}
        >
          V{plan?.version ?? index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <PeriodBadge period={period} />
            <span className="text-sm font-bold text-gray-800 truncate">
              Plano {PERIOD_CONFIG[period]?.label} — {formatDateTimeBR(record.created_at).split(',')[0]}
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

        {/* Progress pill */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${overallPct}%`, background: cfg.color }} />
            </div>
            <span className="text-[10px] font-bold" style={{ color: cfg.color }}>{overallPct}%</span>
          </div>

          {/* Action buttons */}
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

      {/* ── Expanded Content ── */}
      {expanded && plan && (
        <div className="p-5 space-y-5" style={{ borderTop: `1px solid ${cfg.color}20` }}>

          {/* Objetivo Prático — banner amarelo */}
          {plan.practicalObjective && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A' }}>
              <Target size={16} style={{ color: '#D97706', marginTop: 2, flexShrink: 0 }} />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#D97706' }}>Objetivo Prático do Período</p>
                <p className="text-sm text-gray-800 mt-0.5 leading-snug">{plan.practicalObjective}</p>
              </div>
            </div>
          )}

          {/* Foco + Barreira — seção de contexto */}
          {(plan.focusPlan || plan.mainBarrier) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Contexto do Período</p>
              <div className="grid md:grid-cols-2 gap-4">
                {[...ENRICHED_BLOCK_CONFIGS.filter(b => b.key === 'focusPlan' || b.key === 'mainBarrier')].map(bcfg => {
                  const block = (plan as any)[bcfg.key];
                  if (!block) return null;
                  const mergedItems = block.items.map((i: ActionPlanItem) => ({
                    ...i,
                    done: localDone[`${record.id}:${bcfg.key}:${i.id}`] ?? i.done,
                  }));
                  return (
                    <ChecklistBlock key={bcfg.key} config={bcfg} block={{ ...block, items: mergedItems }}
                      onToggle={itemId => onToggleItem(record.id, bcfg.key, itemId)} />
                  );
                })}
              </div>
            </div>
          )}

          {/* 6 blocos originais */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Ações Principais</p>
            <div className="grid md:grid-cols-2 gap-4">
              {BLOCK_CONFIGS.map(bcfg => {
                const block = (plan as any)[bcfg.key];
                if (!block) return null;
                const mergedItems = block.items.map((i: ActionPlanItem) => ({
                  ...i,
                  done: localDone[`${record.id}:${bcfg.key}:${i.id}`] ?? i.done,
                }));
                return (
                  <ChecklistBlock key={bcfg.key} config={bcfg} block={{ ...block, items: mergedItems }}
                    onToggle={itemId => onToggleItem(record.id, bcfg.key, itemId)} />
                );
              })}
            </div>
          </div>

          {/* Recursos — jogos, vídeos, materiais, dinâmicas */}
          {(['suggestedGames','suggestedVideos','suggestedMaterials','suggestedDynamics'] as const).some(k => (plan as any)[k]) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Recursos e Estratégias</p>
              <div className="grid md:grid-cols-2 gap-4">
                {ENRICHED_BLOCK_CONFIGS.filter(b => ['suggestedGames','suggestedVideos','suggestedMaterials','suggestedDynamics'].includes(b.key)).map(bcfg => {
                  const block = (plan as any)[bcfg.key];
                  if (!block) return null;
                  const mergedItems = block.items.map((i: ActionPlanItem) => ({
                    ...i,
                    done: localDone[`${record.id}:${bcfg.key}:${i.id}`] ?? i.done,
                  }));
                  return (
                    <ChecklistBlock key={bcfg.key} config={bcfg} block={{ ...block, items: mergedItems }}
                      onToggle={itemId => onToggleItem(record.id, bcfg.key, itemId)} />
                  );
                })}
              </div>
            </div>
          )}

          {/* Adaptações + Evidências */}
          {(plan.adaptations || plan.evidenceRecording) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Adaptações e Evidências</p>
              <div className="grid md:grid-cols-2 gap-4">
                {ENRICHED_BLOCK_CONFIGS.filter(b => b.key === 'adaptations' || b.key === 'evidenceRecording').map(bcfg => {
                  const block = (plan as any)[bcfg.key];
                  if (!block) return null;
                  const mergedItems = block.items.map((i: ActionPlanItem) => ({
                    ...i,
                    done: localDone[`${record.id}:${bcfg.key}:${i.id}`] ?? i.done,
                  }));
                  return (
                    <ChecklistBlock key={bcfg.key} config={bcfg} block={{ ...block, items: mergedItems }}
                      onToggle={itemId => onToggleItem(record.id, bcfg.key, itemId)} />
                  );
                })}
              </div>
            </div>
          )}

          {/* Resposta do Aluno */}
          {plan.studentResponse && (() => {
            const bcfg = ENRICHED_BLOCK_CONFIGS.find(b => b.key === 'studentResponse')!;
            const block = plan.studentResponse;
            const mergedItems = block.items.map((i: ActionPlanItem) => ({
              ...i,
              done: localDone[`${record.id}:studentResponse:${i.id}`] ?? i.done,
            }));
            return (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Registro do Atendimento</p>
                <ChecklistBlock config={bcfg} block={{ ...block, items: mergedItems }}
                  onToggle={itemId => onToggleItem(record.id, 'studentResponse', itemId)} />
              </div>
            );
          })()}

          {/* Próximo Passo — banner petrol */}
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
              style={{ background: PETROL }}
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

const PrintModal: React.FC<{
  plan: ActionPlanJSON;
  studentName: string;
  onClose: () => void;
}> = ({ plan, studentName, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const period = plan.period ?? 'mensal';
  const periodLabel = PERIOD_CONFIG[period]?.label ?? 'Mensal';

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win || !ref.current) return;
    win.document.write(`
      <html><head>
        <title>Plano de Ação — ${studentName}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
          body { background: #fff; color: #1f2937; font-size: 11px; padding: 20px 24px; }
          h1 { font-size: 17px; font-weight: 800; color: #1F4E5F; margin-bottom: 2px; }
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

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-gray-800">Pré-visualização do Plano</h2>
            <p className="text-xs text-gray-500">{studentName} · Plano {PERIOD_CONFIG[plan.period]?.label}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
              style={{ background: PETROL }}
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

        {/* Printable content */}
        <div ref={ref} className="p-6">
          <h1 style={{ fontSize: 20, fontWeight: 800, color: PETROL, marginBottom: 4 }}>
            Plano de Ação — {studentName}
          </h1>
          <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 16 }}>
            <PeriodBadge period={plan.period} />
            &nbsp;&nbsp;Gerado por: {plan.generatedByName} &nbsp;·&nbsp; {formatDateTimeBR(plan.generatedAt)}
            &nbsp;·&nbsp; Nº {plan.registrationNumber}
          </p>

          {/* Objetivo Prático */}
          {plan.practicalObjective && (
            <div className="banner" style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 10, padding: '9px 13px', marginBottom: 12 }}>
              <p className="banner-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#D97706', marginBottom: 3 }}>Objetivo Prático do Período</p>
              <p className="banner-text" style={{ fontSize: 11, lineHeight: 1.5 }}>{plan.practicalObjective}</p>
            </div>
          )}

          {/* Contexto do Período */}
          {(plan.focusPlan || plan.mainBarrier) && (
            <>
              <p className="section-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9ca3af', margin: '14px 0 6px' }}>Contexto do Período</p>
              <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {ENRICHED_BLOCK_CONFIGS.filter(b => b.key === 'focusPlan' || b.key === 'mainBarrier').map(bcfg => {
                  const block = (plan as any)[bcfg.key];
                  if (!block) return null;
                  return (
                    <div key={bcfg.key} className="block" style={{ borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${bcfg.border}`, breakInside: 'avoid' }}>
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
                })}
              </div>
            </>
          )}

          {/* Ações Principais */}
          <p className="section-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9ca3af', margin: '14px 0 6px' }}>Ações Principais</p>
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            {BLOCK_CONFIGS.map(bcfg => {
              const block = (plan as any)[bcfg.key];
              if (!block) return null;
              return (
                <div key={bcfg.key} className="block" style={{ borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${bcfg.border}`, breakInside: 'avoid' }}>
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
            })}
          </div>

          {/* Recursos e Estratégias */}
          {(['suggestedGames','suggestedVideos','suggestedMaterials','suggestedDynamics'] as const).some(k => (plan as any)[k]) && (
            <>
              <p className="section-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9ca3af', margin: '14px 0 6px' }}>Recursos e Estratégias</p>
              <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {ENRICHED_BLOCK_CONFIGS.filter(b => ['suggestedGames','suggestedVideos','suggestedMaterials','suggestedDynamics'].includes(b.key)).map(bcfg => {
                  const block = (plan as any)[bcfg.key];
                  if (!block) return null;
                  return (
                    <div key={bcfg.key} className="block" style={{ borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${bcfg.border}`, breakInside: 'avoid' }}>
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
                })}
              </div>
            </>
          )}

          {/* Adaptações e Evidências */}
          {(plan.adaptations || plan.evidenceRecording) && (
            <>
              <p className="section-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9ca3af', margin: '14px 0 6px' }}>Adaptações e Evidências</p>
              <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {ENRICHED_BLOCK_CONFIGS.filter(b => b.key === 'adaptations' || b.key === 'evidenceRecording').map(bcfg => {
                  const block = (plan as any)[bcfg.key];
                  if (!block) return null;
                  return (
                    <div key={bcfg.key} className="block" style={{ borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${bcfg.border}`, breakInside: 'avoid' }}>
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
                })}
              </div>
            </>
          )}

          {/* Registro do Atendimento */}
          {plan.studentResponse && (() => {
            const bcfg = ENRICHED_BLOCK_CONFIGS.find(b => b.key === 'studentResponse')!;
            const block = plan.studentResponse!;
            return (
              <>
                <p className="section-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9ca3af', margin: '14px 0 6px' }}>Registro do Atendimento</p>
                <div style={{ marginBottom: 12 }}>
                  <div className="block" style={{ borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${bcfg.border}`, breakInside: 'avoid' }}>
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
                </div>
              </>
            );
          })()}

          {/* Próximo Passo */}
          {plan.nextStep && (
            <div className="banner" style={{ background: '#EFF9FF', border: '1.5px solid #BFDBFE', borderRadius: 10, padding: '9px 13px', marginBottom: 12 }}>
              <p className="banner-label" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: PETROL, marginBottom: 3 }}>Próximo Passo</p>
              <p className="banner-text" style={{ fontSize: 11, lineHeight: 1.5 }}>{plan.nextStep}</p>
            </div>
          )}

          <p className="meta" style={{ marginTop: 14, fontSize: 8, color: '#9ca3af', fontFamily: 'monospace' }}>{plan.registrationNumber} · IncluiAI · {formatDateTimeBR(plan.generatedAt)}</p>
        </div>
      </div>
    </div>
  );
};

// ── ActionPlanTab (main export) ───────────────────────────────────────────────

interface Props {
  student: Student;
  user: any;
}

export const ActionPlanTab: React.FC<Props> = ({ student, user }) => {
  const [records, setRecords] = useState<ActionPlanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [period, setPeriod] = useState<ActionPlanPeriod>('mensal');
  const [error, setError] = useState('');
  const [printPlan, setPrintPlan] = useState<ActionPlanJSON | null>(null);
  const [localDone, setLocalDone] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ActionPlanService.listByStudent(student.id);
      setRecords(data);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar planos.');
    } finally {
      setLoading(false);
    }
  }, [student.id]);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    setError('');
    setGenerating(true);
    try {
      const tenantId    = user?.tenant_id ?? user?.tenantId ?? '';
      const createdBy   = user?.id ?? '';
      const createdByName = user?.name ?? user?.email ?? 'Profissional';

      // version_number é calculado pelo trigger do banco — passamos 1 como placeholder
      const plan = await AIService.generateActionPlan(student, user, period, 1);

      await ActionPlanService.save({
        studentId:    student.id,
        tenantId,
        createdBy,
        createdByName,
        planJson:     plan,
      });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Erro ao gerar plano. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await ActionPlanService.archive(id);
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch {
      setError('Erro ao arquivar plano.');
    }
  };

  const handleToggleItem = (planId: string, blockKey: string, itemId: string) => {
    const key = `${planId}:${blockKey}:${itemId}`;
    setLocalDone(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const cost = AI_CREDIT_COSTS.PLANO_ACAO;

  return (
    <div className="space-y-5">
      {/* ── Print Modal ── */}
      {printPlan && (
        <PrintModal plan={printPlan} studentName={student.name} onClose={() => setPrintPlan(null)} />
      )}

      {/* ── Header ── */}
      <div
        className="rounded-2xl p-6 overflow-hidden relative"
        style={{ background: 'linear-gradient(135deg, #1F4E5F 0%, #2E3A59 100%)' }}
      >
        {/* Decoração */}
        <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
          <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full" style={{ background: '#C69214' }} />
          <div className="absolute -left-8 -bottom-10 w-36 h-36 rounded-full" style={{ background: '#C69214' }} />
        </div>

        <div className="relative">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                <Shield size={20} style={{ color: GOLD }} />
                Plano de Ação do Professor Regente
              </h2>
              <p className="text-sm text-blue-100 mt-1 max-w-xl">
                Orientações práticas para aplicação em sala de aula, geradas a partir do PEI,
                Estudo de Caso e Perfil Inteligente de <strong className="text-white">{student.name}</strong>.
              </p>
            </div>
            {records.length > 0 && (
              <div
                className="rounded-xl px-4 py-2.5 text-center"
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <p className="text-2xl font-extrabold text-white">{records.length}</p>
                <p className="text-[11px] text-blue-200">plano{records.length !== 1 ? 's' : ''} gerado{records.length !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>

          {/* Geração */}
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            {/* Seletor de período */}
            <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.12)' }}>
              {(['semanal', 'mensal', 'bimestral'] as ActionPlanPeriod[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className="px-4 py-2 rounded-lg text-sm font-bold transition"
                  style={period === p
                    ? { background: '#fff', color: PETROL }
                    : { color: '#CBD5E1' }
                  }
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ background: GOLD }}
            >
              {generating ? (
                <><RefreshCw size={15} className="animate-spin" /> Gerando plano…</>
              ) : (
                <><Sparkles size={15} /> Gerar novo plano · {cost} créd.</>
              )}
            </button>

            <button
              onClick={load}
              className="flex items-center gap-1.5 text-xs text-blue-200 hover:text-white transition"
            >
              <RefreshCw size={13} /> Atualizar
            </button>
          </div>

          {/* Nota sobre período macro */}
          <p className="text-[11px] text-blue-300 mt-3">
            O plano <strong className="text-white">Semanal</strong> é o mais indicado para acompanhamento contínuo.
            Cada geração cria uma nova versão — o histórico é preservado.
          </p>
        </div>
      </div>

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
          <span className="text-sm">Carregando planos…</span>
        </div>
      ) : records.length === 0 ? (
        /* Empty state */
        <div
          className="rounded-2xl p-12 text-center"
          style={{ background: '#FAFAF8', border: '2px dashed #E7E2D8' }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: '#EFF9FF', border: '1.5px solid #BFDBFE' }}
          >
            <FileText size={28} style={{ color: PETROL }} />
          </div>
          <h3 className="text-base font-bold text-gray-700 mb-1">Nenhum plano gerado ainda</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6">
            Selecione o período acima e clique em <strong>"Gerar novo plano"</strong> para criar
            o primeiro Plano de Ação para {student.name}.
          </p>

          {/* Blocos de prévia */}
          <div className="grid sm:grid-cols-3 gap-3 max-w-lg mx-auto text-left">
            {BLOCK_CONFIGS.slice(0, 3).map(b => (
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
        /* Plan list */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              {records.length} plano{records.length !== 1 ? 's' : ''} · mais recente primeiro
            </p>
            <p className="text-[11px] text-gray-400">Clique em um card para expandir</p>
          </div>

          {records.map((r, i) => (
            <PlanCard
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
