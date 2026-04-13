// WorkflowCanvas.tsx — AtivaIA Premium React Flow Canvas
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  BackgroundVariant,
  getBezierPath,
  type NodeProps,
  type EdgeProps,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  Upload, MessageSquare, BookOpen, Palette, FileText,
  Sparkles, Loader, CheckCircle, AlertCircle, Download,
  X, Star, Coins, Play, RefreshCw, Printer,
  Plus, Search, ArrowRight, Image as ImageIcon, Zap,
  GraduationCap, Brain, ScanText, AlertTriangle, TrendingDown, History,
  Maximize2, Minimize2
} from 'lucide-react';
import { AIService } from '../../services/aiService';
import { WorkflowService, type WorkflowSerializableState } from '../../services/persistenceService';
import { AI_CREDIT_COSTS, CREDIT_INSUFFICIENT_MSG } from '../../config/aiCosts';
import { User, SchoolConfig, Student } from '../../types';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:         '#F6F4EF',
  surface:    '#FFFFFF',
  text:       '#1F2937',
  textSec:    '#667085',
  petrol:     '#1F4E5F',
  dark:       '#2E3A59',
  gold:       '#C69214',
  goldLight:  '#FDF6E3',
  border:     '#E7E2D8',
  borderMid:  '#C9C3B5',
  ok:         '#166534',
  okBg:       '#F0FDF4',
  okBorder:   '#BBF7D0',
  err:        '#991B1B',
  errBg:      '#FEF2F2',
  runBg:      '#EFF9FF',
  runBorder:  '#BAE6FD',
};

// ─── Types ────────────────────────────────────────────────────────────────────
type AIModel    = 'gemini' | 'openai';
type PageSize   = 'A4' | 'A5' | 'Quadrado digital' | 'Vertical digital';
type NodeStatus = 'idle' | 'running' | 'done' | 'error';

interface WorkflowState {
  uploadFile: File | null;
  uploadPreview: string | null;
  prompt: string;
  discipline: string;
  grade: string;
  bnccCode: string;
  bnccDescription: string;
  bnccJustification: string;
  model: AIModel;
  imageCount: number;
  pageSize: PageSize;
  borders: boolean;
  schoolId: string;
  results: ResultImage[];
  pdfReady: boolean;
  // Sprint 1: OCR + Adaptar
  extractedText: string;
  adaptedText: string;
  adaptationType: string;
  adaptarInputText: string;   // texto manual quando não há OCR
  // Sprint 3: Save & metadata
  templateType: string;
  creditsUsed: number;
}

interface ResultImage { id: string; imageUrl: string; description: string; }

interface NodeData extends WorkflowState {
  nodeStatus: NodeStatus;
  progress: string;
  schools: SchoolConfig[];
  onUpdate: (patch: Partial<WorkflowState>) => void;
  onRunBncc: () => void;
  onGeneratePdf: () => void;
  onSaveActivity: () => void;
  onDeleteNode: (id: string) => void;
  [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fileToBase64 = (f: File): Promise<string> =>
  new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f); });

const calcCredits = (_model: AIModel, imageCount: number) =>
  AI_CREDIT_COSTS.IMAGEM_PREMIUM * imageCount;

const DISCIPLINES = ['Língua Portuguesa','Matemática','Ciências','História','Geografia','Arte','Educação Física','Inglês','Educação Especial'];
const GRADES = ['1º Ano EF','2º Ano EF','3º Ano EF','4º Ano EF','5º Ano EF','6º Ano EF','7º Ano EF','8º Ano EF','9º Ano EF','1º Ano EM','2º Ano EM','3º Ano EM'];
const PROMPT_SUGGESTIONS = [
  'Crie uma versão visual desta atividade com apoio de imagens educativas.',
  'Transforme esta atividade em uma versão visual para alunos com autismo.',
  'Crie ilustrações simples que ajudem a explicar o exercício.',
  'Transforme esta atividade em cartões visuais pedagógicos.',
  'Crie 5 imagens educativas para representar cada etapa da atividade.',
];

const PAGE_SIZES: PageSize[] = ['A4','A5','Quadrado digital','Vertical digital'];

const BLOCK_CATALOG = [
  { type: 'uploadNode',      label: 'Enviar Atividade',   icon: Upload,      desc: 'Faça upload de imagem ou PDF' },
  { type: 'ocrNode',         label: 'OCR / Extrair Texto',icon: ScanText,    desc: 'Extrai texto de imagem via IA (1 crédito)' },
  { type: 'adaptarNode',     label: 'Adaptar Atividade',  icon: Brain,       desc: `Adapta para TEA, TDAH, DI etc. (${AI_CREDIT_COSTS.ADAPTAR_ATIVIDADE} créditos)` },
  { type: 'promptNode',      label: 'Prompt IA',          icon: MessageSquare, desc: 'Instrução para a IA gerar' },
  { type: 'bnccNode',        label: 'BNCC Smart',         icon: BookOpen,    desc: 'Identifica habilidade BNCC com IA' },
  { type: 'composicaoNode',  label: 'Composição Visual',  icon: Palette,     desc: 'Configure layout, imagens e escola' },
  { type: 'folhaProntaNode', label: 'FolhaPronta',        icon: FileText,    desc: 'Monta e exporta o documento final' },
  { type: 'resultadoNode',   label: 'Resultado',          icon: Sparkles,    desc: 'Visualize e exporte as imagens' },
];

// ─── Animated Edge ─────────────────────────────────────────────────────────────
const PremiumEdge: React.FC<EdgeProps> = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, style }) => {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const active = !!(data as any)?.active;
  const done   = !!(data as any)?.done;
  const stroke = done ? C.ok : active ? C.petrol : C.borderMid;
  const cleanId = `ep-${id.replace(/[^a-z0-9]/gi, '_')}`;
  const glowId  = `glow-${cleanId}`;

  return (
    <g>
      <defs>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={active || done ? 2 : 0} result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {/* Ghost glow track when active */}
      {(active || done) && (
        <path d={edgePath} fill="none" stroke={done ? C.ok : C.petrol} strokeWidth={6} opacity={0.12} />
      )}
      {/* Main path */}
      <path
        id={cleanId} d={edgePath} fill="none"
        stroke={stroke} strokeWidth={active || done ? 2 : 1.5}
        markerEnd={markerEnd} style={style}
        filter={active || done ? `url(#${glowId})` : undefined}
      />
      {/* Running: two staggered gold pulses */}
      {active && !done && (
        <>
          <circle r={5} fill={C.gold} opacity={0.95}>
            <animateMotion dur="1.3s" repeatCount="indefinite">
              <mpath href={`#${cleanId}`} />
            </animateMotion>
          </circle>
          <circle r={3.5} fill={C.gold} opacity={0.5}>
            <animateMotion dur="1.3s" begin="0.4s" repeatCount="indefinite">
              <mpath href={`#${cleanId}`} />
            </animateMotion>
          </circle>
        </>
      )}
      {/* Done: slow green pulse */}
      {done && (
        <circle r={4} fill={C.ok} opacity={0.75}>
          <animateMotion dur="2.2s" repeatCount="indefinite">
            <mpath href={`#${cleanId}`} />
          </animateMotion>
        </circle>
      )}
    </g>
  );
};

// ─── Node Shell (shared) ──────────────────────────────────────────────────────
const NodeShell: React.FC<{
  title: string;
  icon: React.ElementType;
  status: NodeStatus;
  selected?: boolean;
  children: React.ReactNode;
  width?: number;
  accent?: string;
  onDelete?: () => void;
}> = ({ title, icon: Icon, status, selected, children, width = 380, accent = C.petrol, onDelete }) => {
  const borderColor = status === 'done' ? C.ok : status === 'running' ? C.petrol : status === 'error' ? C.err : C.border;
  const glowStyle = selected
    ? { boxShadow: `0 0 0 2.5px ${C.gold}, 0 12px 40px rgba(198,146,20,0.22)` }
    : { boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.05)' };

  const statusDot = {
    idle:    { bg: C.borderMid,   pulse: false },
    running: { bg: C.petrol,      pulse: true  },
    done:    { bg: C.ok,          pulse: false },
    error:   { bg: C.err,         pulse: false },
  }[status];

  return (
    <div
      style={{ width, background: C.surface, border: `1.5px solid ${borderColor}`, borderRadius: 18, ...glowStyle, transition: 'box-shadow .25s, border-color .3s' }}
    >
      {/* Drag header */}
      <div
        className="node-drag-handle flex items-center gap-3 px-4 py-3.5 rounded-t-2xl cursor-grab active:cursor-grabbing select-none"
        style={{ borderBottom: `1px solid ${C.border}`, background: `linear-gradient(90deg, ${accent}18 0%, transparent 70%)` }}
      >
        <div style={{ background: accent, borderRadius: 9, padding: '6px', display: 'flex', boxShadow: `0 2px 8px ${accent}40` }}>
          <Icon size={15} color="#fff" />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: '-0.015em', flex: 1 }}>{title}</span>
        <div
          style={{ width: 8, height: 8, borderRadius: 99, background: statusDot.bg, flexShrink: 0, boxShadow: status === 'done' ? `0 0 0 3px ${C.ok}30` : undefined }}
          className={statusDot.pulse ? 'animate-pulse' : ''}
        />
        {onDelete && (
          <button
            className="nodrag"
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title="Remover bloco"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 6, display: 'flex', alignItems: 'center', color: C.textSec, marginLeft: 4, transition: 'color .15s' }}
            onMouseOver={e => (e.currentTarget.style.color = C.err)}
            onMouseOut={e => (e.currentTarget.style.color = C.textSec)}
          >
            <X size={13} />
          </button>
        )}
      </div>
      {/* Content */}
      <div className="nodrag p-5 space-y-4">
        {children}
      </div>
    </div>
  );
};

// ── Shared input styles ──────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '7px 10px', fontSize: 12, color: C.text, outline: 'none',
  background: C.surface, boxSizing: 'border-box',
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer', background: C.surface };

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{children}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NODES
// ═══════════════════════════════════════════════════════════════════════════════

const UploadNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const d = data as NodeData;
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <NodeShell title="Enviar Atividade" icon={Upload} status={d.nodeStatus} selected={selected} accent={C.petrol} width={360} onDelete={() => d.onDeleteNode(id)}>
      <Handle type="source" position={Position.Right} style={{ background: C.petrol, border: `2px solid ${C.surface}`, width: 10, height: 10 }} />
      <div
        onClick={() => fileRef.current?.click()}
        style={{ border: `1.5px dashed ${d.uploadFile ? C.ok : C.border}`, borderRadius: 12, padding: '16px 12px', textAlign: 'center', cursor: 'pointer', background: d.uploadFile ? C.okBg : C.bg, transition: 'all .2s' }}
      >
        {d.uploadPreview ? (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img src={d.uploadPreview} alt="preview" style={{ maxHeight: 110, borderRadius: 8, objectFit: 'contain' }} />
            <button
              onClick={e => { e.stopPropagation(); d.onUpdate({ uploadFile: null, uploadPreview: null }); }}
              style={{ position: 'absolute', top: -8, right: -8, width: 20, height: 20, background: C.err, color: '#fff', borderRadius: 99, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={10} />
            </button>
          </div>
        ) : d.uploadFile ? (
          <>
            <FileText size={28} color={C.petrol} style={{ margin: '0 auto 6px' }} />
            <div style={{ fontSize: 11, fontWeight: 600, color: C.petrol, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{d.uploadFile.name}</div>
            <button onClick={e => { e.stopPropagation(); d.onUpdate({ uploadFile: null, uploadPreview: null }); }}
              style={{ marginTop: 4, fontSize: 10, color: C.err, background: 'none', border: 'none', cursor: 'pointer' }}>Remover</button>
          </>
        ) : (
          <>
            <Upload size={24} color={C.borderMid} style={{ margin: '0 auto 6px' }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>Clique para enviar</div>
            <div style={{ fontSize: 10, color: C.borderMid, marginTop: 2 }}>JPG · PNG · PDF</div>
          </>
        )}
      </div>
      <div style={{ fontSize: 10, color: C.textSec, textAlign: 'center' }}>Opcional — enriquece o resultado da IA</div>
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0]; if (!f) return;
          const prev = f.type.startsWith('image/') ? await fileToBase64(f) : null;
          d.onUpdate({ uploadFile: f, uploadPreview: prev });
        }} />
    </NodeShell>
  );
};

const PromptNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const d = data as NodeData;
  return (
    <NodeShell title="Prompt IA" icon={MessageSquare} status={d.nodeStatus} selected={selected} accent={C.dark} width={400} onDelete={() => d.onDeleteNode(id)}>
      <Handle type="target" position={Position.Left}  style={{ background: C.petrol, border: `2px solid ${C.surface}`, width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} style={{ background: C.petrol, border: `2px solid ${C.surface}`, width: 10, height: 10 }} />
      <div>
        <Label>Instrução para a IA</Label>
        <textarea
          value={d.prompt}
          onChange={e => d.onUpdate({ prompt: e.target.value })}
          placeholder="Ex: Crie imagens pedagógicas ilustrando cada etapa desta atividade…"
          rows={4}
          style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
        />
      </div>
      <div>
        <Label>Sugestões rápidas</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {PROMPT_SUGGESTIONS.map((s, i) => (
            <button key={i} onClick={() => d.onUpdate({ prompt: s })}
              style={{ textAlign: 'left', fontSize: 11, color: C.textSec, padding: '6px 8px', borderRadius: 7, border: `1px solid transparent`, background: 'none', cursor: 'pointer', lineHeight: 1.4, display: 'flex', alignItems: 'flex-start', gap: 6, transition: 'all .15s' }}
              onMouseOver={e => { (e.currentTarget.style.background = C.goldLight); (e.currentTarget.style.borderColor = C.border); }}
              onMouseOut={e => { (e.currentTarget.style.background = 'none'); (e.currentTarget.style.borderColor = 'transparent'); }}>
              <Star size={9} color={C.gold} style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{s}</span>
            </button>
          ))}
        </div>
      </div>
    </NodeShell>
  );
};

const BnccNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const d = data as NodeData;
  return (
    <NodeShell title="BNCC Smart" icon={BookOpen} status={d.nodeStatus} selected={selected} accent={C.petrol} width={360} onDelete={() => d.onDeleteNode(id)}>
      <Handle type="target" position={Position.Left}  style={{ background: C.petrol, border: `2px solid ${C.surface}`, width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} style={{ background: C.petrol, border: `2px solid ${C.surface}`, width: 10, height: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <Label>Disciplina</Label>
          <select value={d.discipline} onChange={e => d.onUpdate({ discipline: e.target.value })} style={selectStyle}>
            <option value="">Selecionar</option>
            {DISCIPLINES.map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <Label>Série</Label>
          <select value={d.grade} onChange={e => d.onUpdate({ grade: e.target.value })} style={selectStyle}>
            <option value="">Selecionar</option>
            {GRADES.map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <button onClick={d.onRunBncc} disabled={d.nodeStatus === 'running'}
        style={{ width: '100%', padding: '9px 0', background: d.nodeStatus === 'running' ? C.border : C.petrol, color: d.nodeStatus === 'running' ? C.textSec : '#fff', border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: d.nodeStatus === 'running' ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .2s' }}>
        {d.nodeStatus === 'running' ? <><Loader size={13} className="animate-spin" /> Identificando…</> : <><BookOpen size={13} /> Identificar BNCC com IA</>}
      </button>
      {d.bnccCode && (
        <div style={{ background: C.goldLight, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: C.petrol, color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99 }}>{d.bnccCode}</span>
            {d.nodeStatus === 'done' && <CheckCircle size={14} color={C.ok} />}
          </div>
          {d.bnccDescription && <div style={{ fontSize: 11, color: C.text, lineHeight: 1.5 }}>{d.bnccDescription}</div>}
          {d.bnccJustification && <div style={{ fontSize: 10, color: C.textSec, fontStyle: 'italic', lineHeight: 1.4 }}>{d.bnccJustification}</div>}
          <div>
            <Label>Editar código manualmente</Label>
            <input value={d.bnccCode} onChange={e => d.onUpdate({ bnccCode: e.target.value })} style={inputStyle} />
          </div>
        </div>
      )}
    </NodeShell>
  );
};

const ComposicaoNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const d = data as NodeData;
  const imageCount = d.imageCount ?? 5;
  const model = d.model ?? 'gemini';
  const credits = calcCredits(model, imageCount);
  const school = d.schools?.find((s: SchoolConfig) => s.id === d.schoolId);

  return (
    <NodeShell title="Composição Visual" icon={Palette} status={d.nodeStatus} selected={selected} accent={C.dark} width={380} onDelete={() => d.onDeleteNode(id)}>
      <Handle type="target" position={Position.Left}  style={{ background: C.petrol, border: `2px solid ${C.surface}`, width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} style={{ background: C.petrol, border: `2px solid ${C.surface}`, width: 10, height: 10 }} />

      {/* Model — imagens via Imagen 4.0 (Google) */}
      <div style={{ background: C.petrol + '10', border: `1px solid ${C.petrol}30`, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13 }}>🎨</span>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.dark }}>Imagen 4.0 (Google)</span>
          <span style={{ display: 'block', fontSize: 9, color: C.textSec }}>Alta qualidade visual · {AI_CREDIT_COSTS.IMAGEM_PREMIUM} créditos/imagem</span>
        </div>
      </div>

      {/* Image count — number input for reliability */}
      <div>
        <Label>Número de imagens: {imageCount}</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => d.onUpdate({ imageCount: Math.max(1, imageCount - 1) })}
            style={{ width: 30, height: 30, border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, cursor: 'pointer', fontSize: 16, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 800, color: C.petrol }}>{imageCount}</div>
          <button onClick={() => d.onUpdate({ imageCount: Math.min(10, imageCount + 1) })}
            style={{ width: 30, height: 30, border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, cursor: 'pointer', fontSize: 16, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        </div>
      </div>

      {/* Page size */}
      <div>
        <Label>Tamanho da folha</Label>
        <select value={d.pageSize ?? 'A4'} onChange={e => d.onUpdate({ pageSize: e.target.value as PageSize })} style={selectStyle}>
          {PAGE_SIZES.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>

      {/* Borders */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!d.borders} onChange={e => d.onUpdate({ borders: e.target.checked })}
          style={{ width: 14, height: 14, accentColor: C.petrol }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Borda na folha</span>
      </label>

      {/* School */}
      {(d.schools?.length ?? 0) > 0 && (
        <div>
          <Label>Cabeçalho da Escola</Label>
          <select value={d.schoolId ?? ''} onChange={e => d.onUpdate({ schoolId: e.target.value })} style={selectStyle}>
            <option value="">Sem cabeçalho institucional</option>
            {d.schools.map((s: SchoolConfig) => <option key={s.id} value={s.id}>{s.schoolName}</option>)}
          </select>
          {school && (
            <div style={{ marginTop: 6, background: C.goldLight, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 10, color: C.textSec, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, color: C.text }}>{school.schoolName}</div>
              {school.cnpj && <div>CNPJ: {school.cnpj}</div>}
              {school.inepCode && <div>INEP: {school.inepCode}</div>}
              {school.email && <div>{school.email}</div>}
            </div>
          )}
        </div>
      )}

      {/* Credits */}
      <div style={{ background: C.goldLight, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Coins size={14} color={C.gold} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>
          Esta geração consumirá <strong style={{ color: C.petrol }}>{credits} créditos</strong>
        </span>
        <span style={{ fontSize: 10, color: C.textSec, marginLeft: 'auto' }}>{AI_CREDIT_COSTS.IMAGEM_PREMIUM}c/img</span>
      </div>
    </NodeShell>
  );
};

const FolhaProntaNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const d = data as NodeData;
  const school = d.schools?.find((s: SchoolConfig) => s.id === d.schoolId);

  return (
    <NodeShell title="FolhaPronta" icon={FileText} status={d.nodeStatus} selected={selected} accent={C.dark} width={340} onDelete={() => d.onDeleteNode(id)}>
      <Handle type="target" position={Position.Left}  style={{ background: C.petrol, border: `2px solid ${C.surface}`, width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} style={{ background: C.petrol, border: `2px solid ${C.surface}`, width: 10, height: 10 }} />

      {d.nodeStatus === 'idle' && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: C.textSec, fontSize: 12 }}>
          <FileText size={32} color={C.border} style={{ margin: '0 auto 8px' }} />
          Execute o fluxo para montar a FolhaPronta
        </div>
      )}
      {d.nodeStatus === 'running' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Loader size={28} color={C.petrol} className="animate-spin" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: 12, color: C.textSec }}>Montando documento…</div>
        </div>
      )}
      {d.nodeStatus === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: C.okBg, border: `1px solid ${C.okBorder}`, borderRadius: 10, padding: '10px', textAlign: 'center' }}>
            <CheckCircle size={20} color={C.ok} style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ok }}>Documento pronto!</div>
          </div>
          {/* Mini preview */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
            {school && (
              <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 6, marginBottom: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.text }}>{school.schoolName}</div>
                {school.cnpj && <div style={{ fontSize: 9, color: C.textSec }}>CNPJ: {school.cnpj}</div>}
              </div>
            )}
            {d.bnccCode && (
              <div style={{ marginBottom: 6 }}>
                <span style={{ background: '#DCFCE7', color: C.ok, fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99 }}>{d.bnccCode}</span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {d.results.slice(0, 4).map((img, i) => (
                img.imageUrl
                  ? <img key={i} src={img.imageUrl} alt="" style={{ borderRadius: 5, aspectRatio: '1', objectFit: 'cover', width: '100%' }} />
                  : <div key={i} style={{ borderRadius: 5, aspectRatio: '1', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ImageIcon size={14} color={C.borderMid} />
                    </div>
              ))}
            </div>
          </div>
          <button onClick={d.onGeneratePdf}
            style={{ width: '100%', padding: '9px 0', background: C.dark, color: '#fff', border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background .2s' }}
            onMouseOver={e => (e.currentTarget.style.background = C.petrol)}
            onMouseOut={e => (e.currentTarget.style.background = C.dark)}>
            <Printer size={13} /> Exportar PDF
          </button>
        </div>
      )}
      {d.nodeStatus === 'error' && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
          <AlertCircle size={18} color={C.err} style={{ margin: '0 auto 4px' }} />
          <div style={{ fontSize: 11, color: C.err }}>Erro ao montar documento</div>
        </div>
      )}
    </NodeShell>
  );
};

const ResultadoNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const d = data as NodeData;
  const isTextOnly = d.results.length === 0 && !!d.adaptedText;
  const isDone = d.nodeStatus === 'done';

  // FIX: download via blob para contornar bloqueio CORS do atributo download em URLs cross-origin
  const downloadImageBlob = async (url: string, filename: string) => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Falha ao baixar');
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = filename; a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  const downloadAll = () => {
    d.results.forEach((img, i) => {
      if (img.imageUrl) {
        downloadImageBlob(img.imageUrl, `ativaIA_${i + 1}.png`);
      }
    });
  };

  return (
    <NodeShell title="Resultado" icon={Sparkles} status={d.nodeStatus} selected={selected} accent={C.gold} width={420} onDelete={() => d.onDeleteNode(id)}>
      <Handle type="target" position={Position.Left} style={{ background: C.petrol, border: `2px solid ${C.surface}`, width: 10, height: 10 }} />

      {/* Idle / no result yet */}
      {!isDone && d.results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          {d.nodeStatus === 'running' ? (
            <>
              <Loader size={28} color={C.petrol} className="animate-spin" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 12, color: C.textSec }}>{d.progress || 'Processando…'}</div>
            </>
          ) : (
            <>
              <div style={{ width: 48, height: 48, background: C.bg, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                <Sparkles size={22} color={C.borderMid} />
              </div>
              <div style={{ fontSize: 12, color: C.textSec }}>Execute o fluxo para ver os resultados</div>
            </>
          )}
        </div>
      )}

      {/* Text-only result (relatório / adaptação sem imagens) */}
      {isDone && isTextOnly && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: C.okBg, border: `1px solid ${C.okBorder}`, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={14} color={C.ok} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.ok }}>Documento gerado com sucesso</span>
          </div>
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', maxHeight: 160, overflowY: 'auto' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Prévia do documento</div>
            <div style={{ fontSize: 11, color: C.text, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {d.adaptedText.slice(0, 500)}{d.adaptedText.length > 500 ? '…' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={d.onGeneratePdf}
              style={{ flex: 1, padding: '8px 0', background: C.dark, color: '#fff', border: 'none', borderRadius: 9, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background .2s' }}
              onMouseOver={e => (e.currentTarget.style.background = C.petrol)}
              onMouseOut={e => (e.currentTarget.style.background = C.dark)}>
              <Printer size={12} /> Abrir PDF
            </button>
            <button onClick={d.onSaveActivity}
              style={{ flex: 1, padding: '8px 0', background: C.goldLight, color: C.dark, border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .2s' }}
              onMouseOver={e => { (e.currentTarget.style.background = C.gold); (e.currentTarget.style.color = '#fff'); }}
              onMouseOut={e => { (e.currentTarget.style.background = C.goldLight); (e.currentTarget.style.color = C.dark); }}>
              <Star size={12} /> Salvar
            </button>
          </div>
        </div>
      )}

      {/* Image results */}
      {d.results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {d.progress && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.runBg, border: `1px solid ${C.runBorder}`, borderRadius: 8, padding: '6px 10px', fontSize: 11, color: C.petrol, fontWeight: 600 }}>
              <Loader size={11} className="animate-spin" /> {d.progress}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {d.results.map((img, i) => (
              <div key={img.id} style={{ background: C.bg, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                {img.imageUrl
                  ? <img src={img.imageUrl} alt={`img ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                  : <div style={{ width: '100%', aspectRatio: '1', background: `linear-gradient(135deg, ${C.goldLight} 0%, ${C.bg} 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
                      <ImageIcon size={14} color={C.borderMid} />
                      <span style={{ fontSize: 8, color: C.textSec, textAlign: 'center', marginTop: 2, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>{img.description.slice(0, 50)}</span>
                    </div>
                }
                <div style={{ padding: '3px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9, color: C.textSec, fontWeight: 700 }}>#{i + 1}</span>
                  {img.imageUrl && (
                    <button onClick={() => downloadImageBlob(img.imageUrl, `ativaIA_img_${i + 1}.png`)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                      <Download size={10} color={C.textSec} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {isDone && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={downloadAll}
                style={{ flex: 1, padding: '8px 0', border: `1.5px solid ${C.border}`, background: C.surface, borderRadius: 9, fontSize: 11, fontWeight: 700, color: C.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .2s' }}
                onMouseOver={e => (e.currentTarget.style.background = C.bg)}
                onMouseOut={e => (e.currentTarget.style.background = C.surface)}>
                <Download size={12} /> Baixar ({d.results.length})
              </button>
              <button onClick={d.onSaveActivity}
                style={{ flex: 1, padding: '8px 0', background: C.goldLight, color: C.dark, border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .2s' }}
                onMouseOver={e => { (e.currentTarget.style.background = C.gold); (e.currentTarget.style.color = '#fff'); }}
                onMouseOut={e => { (e.currentTarget.style.background = C.goldLight); (e.currentTarget.style.color = C.dark); }}>
                <Star size={12} /> Salvar
              </button>
            </div>
          )}
        </div>
      )}
    </NodeShell>
  );
};

// ─── OcrNode ──────────────────────────────────────────────────────────────────
const ADAPTATION_OPTIONS = [
  { id: 'autismo', label: 'Autismo (TEA)' },
  { id: 'tdah',    label: 'TDAH' },
  { id: 'dislexia',label: 'Dislexia' },
  { id: 'di',      label: 'Deficiência Intelectual' },
  { id: 'geral',   label: 'Simplificação Geral' },
];

const OcrNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const d = data as NodeData;
  return (
    <NodeShell title="OCR — Extrair Texto" icon={ScanText} status={d.nodeStatus} selected={selected} accent="#7C3AED" width={360} onDelete={() => d.onDeleteNode(id)}>
      <Handle type="target" position={Position.Left}  style={{ background: '#7C3AED', border: `2px solid ${C.surface}`, width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} style={{ background: '#7C3AED', border: `2px solid ${C.surface}`, width: 10, height: 10 }} />

      {d.nodeStatus === 'idle' && (
        <div style={{ textAlign: 'center', padding: '14px 0', color: C.textSec, fontSize: 12 }}>
          <ScanText size={28} color={C.border} style={{ margin: '0 auto 8px' }} />
          Conecte após o bloco de upload.<br/>O texto será extraído automaticamente ao executar.
        </div>
      )}
      {d.nodeStatus === 'running' && (
        <div style={{ textAlign: 'center', padding: '14px 0' }}>
          <Loader size={24} color="#7C3AED" className="animate-spin" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: 12, color: C.textSec }}>Extraindo texto da atividade…</div>
        </div>
      )}
      {d.nodeStatus === 'done' && d.extractedText && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 9, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#7C3AED', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Texto extraído</div>
            <div style={{ fontSize: 11, color: C.text, lineHeight: 1.6, maxHeight: 100, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{d.extractedText}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#166534' }}>
            <CheckCircle size={12} color="#166534" /> Texto extraído com sucesso
          </div>
        </div>
      )}
      {d.nodeStatus === 'error' && (
        <div style={{ background: C.errBg, border: '1px solid #FECACA', borderRadius: 9, padding: '10px', textAlign: 'center' }}>
          <AlertCircle size={16} color={C.err} style={{ margin: '0 auto 4px' }} />
          <div style={{ fontSize: 11, color: C.err }}>Erro ao extrair texto. Verifique se o upload contém imagem.</div>
        </div>
      )}
      <div style={{ fontSize: 10, color: C.textSec, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Coins size={10} color={C.gold} /> 1 crédito por execução
      </div>
    </NodeShell>
  );
};

// ─── AdaptarNode ──────────────────────────────────────────────────────────────
const AdaptarNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const d = data as NodeData;
  const hasSourceText = !!(d.extractedText || d.adaptarInputText);
  return (
    <NodeShell title="Adaptar Atividade" icon={Brain} status={d.nodeStatus} selected={selected} accent="#D97706" width={400} onDelete={() => d.onDeleteNode(id)}>
      <Handle type="target" position={Position.Left}  style={{ background: '#D97706', border: `2px solid ${C.surface}`, width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} style={{ background: '#D97706', border: `2px solid ${C.surface}`, width: 10, height: 10 }} />

      <div>
        <Label>Diagnóstico / Adaptação</Label>
        <select
          value={d.adaptationType ?? 'autismo'}
          onChange={e => d.onUpdate({ adaptationType: e.target.value })}
          style={selectStyle}
        >
          {ADAPTATION_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      {/* Fonte do texto: OCR ou manual */}
      {d.nodeStatus !== 'done' && (
        <div>
          {d.extractedText ? (
            <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 9, padding: '8px 10px', fontSize: 11, color: '#7C3AED' }}>
              <div style={{ fontWeight: 700, marginBottom: 3, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Texto do OCR pronto</div>
              <div style={{ color: C.textSec, lineHeight: 1.5, maxHeight: 60, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{d.extractedText.slice(0, 200)}{d.extractedText.length > 200 ? '…' : ''}</div>
            </div>
          ) : (
            <div>
              <Label>Texto para adaptar</Label>
              <textarea
                value={d.adaptarInputText ?? ''}
                onChange={e => d.onUpdate({ adaptarInputText: e.target.value })}
                placeholder="Cole aqui o texto da atividade que deseja adaptar…"
                rows={5}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.55 }}
              />
              <div style={{ fontSize: 10, color: C.textSec, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertCircle size={10} color={C.textSec} />
                Ou adicione os blocos Upload + OCR antes deste para extrair texto automaticamente.
              </div>
            </div>
          )}
        </div>
      )}

      {d.nodeStatus === 'idle' && hasSourceText && (
        <div style={{ textAlign: 'center', padding: '6px 0', color: C.textSec, fontSize: 11 }}>
          <CheckCircle size={14} color="#166534" style={{ display: 'inline', marginRight: 4 }} />
          Texto pronto — execute o fluxo para adaptar.
        </div>
      )}
      {d.nodeStatus === 'running' && (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <Loader size={22} color="#D97706" className="animate-spin" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: 12, color: C.textSec }}>Adaptando para {ADAPTATION_OPTIONS.find(o => o.id === d.adaptationType)?.label}…</div>
        </div>
      )}
      {d.nodeStatus === 'done' && d.adaptedText && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 9, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#D97706', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Adaptada — {ADAPTATION_OPTIONS.find(o => o.id === d.adaptationType)?.label}
            </div>
            <div style={{ fontSize: 11, color: C.text, lineHeight: 1.6, maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{d.adaptedText}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#166534' }}>
            <CheckCircle size={12} color="#166534" /> Adaptação concluída
          </div>
        </div>
      )}
      {d.nodeStatus === 'error' && (
        <div style={{ background: C.errBg, border: '1px solid #FECACA', borderRadius: 9, padding: '10px', textAlign: 'center' }}>
          <AlertCircle size={16} color={C.err} style={{ margin: '0 auto 4px' }} />
          <div style={{ fontSize: 11, color: C.err, marginBottom: 6 }}>Sem texto para adaptar.</div>
          <div style={{ fontSize: 10, color: C.textSec }}>Adicione texto acima ou conecte um bloco Upload + OCR antes deste.</div>
        </div>
      )}
      <div style={{ fontSize: 10, color: C.textSec, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Coins size={10} color={C.gold} /> 2 créditos por execução
      </div>
    </NodeShell>
  );
};

// ─── Node types (must be module-level, stable reference) ─────────────────────
const nodeTypes = {
  uploadNode:      UploadNode,
  promptNode:      PromptNode,
  bnccNode:        BnccNode,
  composicaoNode:  ComposicaoNode,
  folhaProntaNode: FolhaProntaNode,
  resultadoNode:   ResultadoNode,
  ocrNode:         OcrNode,
  adaptarNode:     AdaptarNode,
};
const edgeTypes = { premiumEdge: PremiumEdge };

// ─── Template definitions ─────────────────────────────────────────────────────
const mkDefaultData = (schools: SchoolConfig[]): NodeData => ({
  uploadFile: null, uploadPreview: null, prompt: '', discipline: '', grade: '',
  bnccCode: '', bnccDescription: '', bnccJustification: '',
  model: 'openai', imageCount: 5, pageSize: 'A4', borders: true,
  schoolId: schools[0]?.id ?? '', results: [], pdfReady: false,
  extractedText: '', adaptedText: '', adaptationType: 'autismo', adaptarInputText: '',
  templateType: 'tea', creditsUsed: 0,
  nodeStatus: 'idle', progress: '', schools,
  onUpdate: () => {}, onRunBncc: () => {}, onGeneratePdf: () => {}, onSaveActivity: () => {}, onDeleteNode: () => {},
});

function makeTemplateNodes(ids: string[], data: NodeData): Node[] {
  const positions: Record<string, {x:number,y:number}> = {
    upload: {x:0,y:0}, prompt: {x:440,y:0}, bncc: {x:880,y:0},
    composicao: {x:440,y:340}, folhapronta: {x:880,y:340}, resultado: {x:1320,y:170},
  };
  const posAll: Record<string, {x:number,y:number}> = {
    upload: {x:0,y:0}, prompt: {x:400,y:0}, bncc: {x:800,y:0},
    composicao: {x:1200,y:0}, folhapronta: {x:1600,y:0}, resultado: {x:2000,y:0},
  };
  return ids.map(id => ({
    id, type: `${id}Node`, position: posAll[id] ?? {x:0,y:0},
    data, dragHandle: '.node-drag-handle',
  }));
}

const TEMPLATES = {
  tea: {
    label: 'Atividade TEA',
    shortDesc: 'Adaptação inclusiva para Autismo',
    desc: 'Faz OCR da atividade, adapta para o Transtorno do Espectro Autista, identifica BNCC e gera imagens visuais pedagógicas.',
    icon: Brain,
    color: '#D97706',
    category: 'Inclusão',
    credits: '~37 créditos',
    nodeIds: ['upload','ocr','adaptar','bncc','composicao','folhapronta','resultado'],
    edgeIds: [['upload','ocr'],['ocr','adaptar'],['adaptar','bncc'],['bncc','composicao'],['composicao','folhapronta'],['folhapronta','resultado']],
    initialPrompt: '',
  },
  illustrated: {
    label: 'Atividade Ilustrada',
    shortDesc: 'Imagens pedagógicas inclusivas',
    desc: 'Extrai o texto da atividade enviada via OCR e gera imagens pedagógicas inclusivas prontas para imprimir.',
    icon: ImageIcon,
    color: C.petrol,
    category: 'Atividades',
    credits: '~34 créditos',
    nodeIds: ['upload','ocr','prompt','composicao','folhapronta','resultado'],
    edgeIds: [['upload','ocr'],['ocr','prompt'],['prompt','composicao'],['composicao','folhapronta'],['folhapronta','resultado']],
    initialPrompt: 'Crie uma versão visual desta atividade com imagens pedagógicas inclusivas e acessíveis.',
  },
  relatorio: {
    label: 'Relatório Pedagógico',
    shortDesc: 'Análise e síntese de documentos',
    desc: 'Analisa documentos pedagógicos (laudos, fichas, avaliações) e gera um relatório estruturado completo em PDF.',
    icon: FileText,
    color: C.dark,
    category: 'Documentos',
    credits: '~3 créditos',
    nodeIds: ['upload','ocr','prompt','folhapronta','resultado'],
    edgeIds: [['upload','ocr'],['ocr','prompt'],['prompt','folhapronta'],['folhapronta','resultado']],
    initialPrompt: 'Com base no documento analisado, elabore um RELATÓRIO PEDAGÓGICO ESTRUTURADO contendo:\n\n1. Síntese do documento\n2. Pontos pedagógicos relevantes\n3. Necessidades identificadas\n4. Recomendações de intervenção\n5. Estratégias pedagógicas sugeridas\n6. Próximos passos\n\nUse linguagem técnica pedagógica formal em português brasileiro.',
  },
};

// ─── Block add panel ──────────────────────────────────────────────────────────
const BlockAddMenu: React.FC<{ onAdd: (type: string) => void; onClose: () => void }> = ({ onAdd, onClose }) => {
  const [search, setSearch] = useState('');
  const filtered = BLOCK_CATALOG.filter(b => b.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <div style={{ position: 'absolute', top: 60, left: 16, zIndex: 100, width: 280, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px 8px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>Adicionar Bloco</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}><X size={14} color={C.textSec} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px' }}>
          <Search size={12} color={C.textSec} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar bloco…"
            style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12, color: C.text, width: '100%' }} />
        </div>
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {filtered.map(b => {
          const Icon = b.icon;
          return (
            <button key={b.type} onClick={() => onAdd(b.type)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background .15s', borderBottom: `1px solid ${C.border}` }}
              onMouseOver={e => (e.currentTarget.style.background = C.bg)}
              onMouseOut={e => (e.currentTarget.style.background = 'none')}>
              <div style={{ background: C.petrol, padding: 7, borderRadius: 8, flexShrink: 0 }}>
                <Icon size={13} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{b.label}</div>
                <div style={{ fontSize: 10, color: C.textSec, marginTop: 1 }}>{b.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── CreditsConfirmModal ─────────────────────────────────────────────────────
interface CreditLineItem { label: string; cost: number; color: string; }

const CreditsConfirmModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  items: CreditLineItem[];
  total: number;
  remaining: number; // -1 = unknown
}> = ({ open, onClose, onConfirm, items, total, remaining }) => {
  const unknown     = remaining === -1;
  const insufficient = !unknown && remaining < total;
  const low          = !unknown && !insufficient && remaining - total < 5;

  if (!open) return null;

  const afterBalance = unknown ? null : remaining - total;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: C.surface, borderRadius: 22, boxShadow: '0 24px 80px rgba(0,0,0,0.22)', width: '100%', maxWidth: 420, padding: '26px 28px', position: 'relative' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: insufficient ? '#FEF2F2' : C.goldLight, border: `2px solid ${insufficient ? '#FECACA' : C.border}`, padding: 10, borderRadius: 13 }}>
              {insufficient
                ? <AlertTriangle size={18} color={C.err} />
                : <Coins size={18} color={C.gold} />}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>
                {insufficient ? 'Saldo insuficiente' : 'Confirmar execução'}
              </div>
              <div style={{ fontSize: 11, color: C.textSec, marginTop: 1 }}>
                Prévia de créditos deste fluxo
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8 }}>
            <X size={16} color={C.textSec} />
          </button>
        </div>

        {/* Breakdown */}
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '8px 14px 6px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.textSec, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Detalhamento</div>
          </div>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: 99, background: item.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{item.label}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: item.color }}>{item.cost} crédito{item.cost !== 1 ? 's' : ''}</span>
            </div>
          ))}
          {/* Total row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: C.goldLight, borderTop: `1.5px solid ${C.border}` }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.dark }}>Total</span>
            <span style={{ fontSize: 15, fontWeight: 900, color: C.petrol }}>{total} créditos</span>
          </div>
        </div>

        {/* Balance info */}
        {!unknown && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: insufficient ? '#FEF2F2' : low ? '#FFFBEB' : C.okBg,
            border: `1px solid ${insufficient ? '#FECACA' : low ? '#FDE68A' : C.okBorder}`,
            borderRadius: 12, padding: '10px 14px', marginBottom: 16
          }}>
            {insufficient
              ? <AlertTriangle size={15} color={C.err} style={{ flexShrink: 0 }} />
              : low
                ? <TrendingDown size={15} color="#D97706" style={{ flexShrink: 0 }} />
                : <CheckCircle size={15} color={C.ok} style={{ flexShrink: 0 }} />}
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
              {insufficient ? (
                <>
                  <span style={{ fontWeight: 700, color: C.err }}>Saldo insuficiente.</span>
                  {' '}Você tem <strong>{remaining}</strong> créditos, mas este fluxo precisa de <strong>{total}</strong>.
                </>
              ) : (
                <>
                  Saldo atual: <strong style={{ color: low ? '#D97706' : C.ok }}>{remaining} créditos</strong>
                  {afterBalance !== null && (
                    <> · Após execução: <strong>{afterBalance} créditos</strong></>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        {insufficient ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose}
              style={{ flex: 1, padding: '10px 0', background: C.surface, color: C.textSec, border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button
              onClick={() => { onClose(); window.open('/planos', '_blank'); }}
              style={{ flex: 2, padding: '10px 0', background: C.petrol, color: '#fff', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: `0 4px 14px ${C.petrol}40` }}>
              <Coins size={13} /> Ver planos e créditos
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose}
              style={{ flex: 1, padding: '10px 0', background: C.surface, color: C.textSec, border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button onClick={() => { onClose(); onConfirm(); }}
              style={{ flex: 2, padding: '10px 0', background: C.petrol, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: `0 4px 14px ${C.petrol}40`, transition: 'all .2s' }}>
              <Play size={13} /> Executar agora
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── SaveActivityModal ────────────────────────────────────────────────────────
const SaveActivityModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSave: (title: string, studentId?: string) => Promise<void>;
  templateType: string;
  creditsUsed: number;
  students: Student[];
}> = ({ open, onClose, onSave, templateType, creditsUsed, students }) => {
  const [title, setTitle]       = useState('');
  const [studentId, setStudentId] = useState('');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');

  const templateLabels: Record<string, string> = {
    tea: 'Atividade TEA', illustrated: 'Atividade Ilustrada', relatorio: 'Relatório Pedagógico',
  };

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setTitle(templateLabels[templateType] ?? 'Atividade Gerada');
      setStudentId('');
      setSaving(false);
      setSaved(false);
      setError('');
    }
  }, [open, templateType]);

  if (!open) return null;

  const handleSave = async () => {
    if (!title.trim()) { setError('Informe um título para a atividade.'); return; }
    setSaving(true); setError('');
    try {
      await onSave(title.trim(), studentId || undefined);
      setSaved(true);
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.surface, borderRadius: 22, boxShadow: '0 24px 80px rgba(0,0,0,0.22)', width: '100%', maxWidth: 440, padding: '28px 30px', position: 'relative' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: `linear-gradient(135deg, ${C.gold} 0%, #E8A020 100%)`, padding: 10, borderRadius: 13, boxShadow: `0 4px 14px ${C.gold}44` }}>
              <Star size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>Salvar Atividade</div>
              <div style={{ fontSize: 11, color: C.textSec, marginTop: 1 }}>Salve no histórico e vincule a um aluno</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8 }}>
            <X size={16} color={C.textSec} />
          </button>
        </div>

        {saved ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 52, height: 52, background: C.okBg, border: `2px solid ${C.okBorder}`, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <CheckCircle size={24} color={C.ok} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.ok, marginBottom: 6 }}>Atividade salva!</div>
            <div style={{ fontSize: 12, color: C.textSec, marginBottom: 20 }}>
              Disponível no histórico do AtivaIA{studentId ? ' e na Timeline do aluno' : ''}.
            </div>
            <button onClick={onClose}
              style={{ padding: '10px 28px', background: C.petrol, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Fechar
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Template info badge */}
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ background: C.goldLight, color: C.dark, border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
                {templateLabels[templateType] ?? templateType}
              </span>
              {creditsUsed > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 10px', fontSize: 11, color: C.textSec }}>
                  <Coins size={10} color={C.gold} /> {creditsUsed} créditos
                </span>
              )}
            </div>

            {/* Title */}
            <div>
              <Label>Título da atividade</Label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Atividade TEA — Matemática 3º Ano"
                style={{ ...inputStyle, fontSize: 13 }}
              />
            </div>

            {/* Student link (optional) */}
            {students.length > 0 && (
              <div>
                <Label>Vincular a aluno (opcional)</Label>
                <select value={studentId} onChange={e => setStudentId(e.target.value)} style={{ ...selectStyle, fontSize: 12 }}>
                  <option value="">Sem vínculo com aluno</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {studentId && (
                  <div style={{ marginTop: 5, fontSize: 10, color: C.textSec, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle size={10} color={C.ok} /> Esta atividade aparecerá na Timeline do aluno
                  </div>
                )}
              </div>
            )}

            {error && (
              <div style={{ background: C.errBg, border: '1px solid #FECACA', borderRadius: 9, padding: '8px 12px', fontSize: 11, color: C.err }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              <button onClick={onClose}
                style={{ flex: 1, padding: '10px 0', background: C.surface, color: C.textSec, border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 2, padding: '10px 0', background: saving ? C.border : C.petrol, color: saving ? C.textSec : '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: saving ? 'none' : `0 4px 14px ${C.petrol}40`, transition: 'all .2s' }}>
                {saving ? <><Loader size={13} className="animate-spin" /> Salvando…</> : <><Star size={13} /> Salvar Atividade</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── InnerCanvas ──────────────────────────────────────────────────────────────
const InnerCanvas: React.FC<{
  user: User;
  students: Student[];
  templateToLoad: keyof typeof TEMPLATES | null;
  onTemplateLoaded: () => void;
  onStarted: () => void;
  onWorkflowNodesChange?: (nodeIds: string[]) => void;
  focusMode?: boolean;
  onToggleFocus?: () => void;
}> = ({ user, students, templateToLoad, onTemplateLoaded, onStarted, onWorkflowNodesChange, focusMode, onToggleFocus }) => {
  const schools: SchoolConfig[] = user.schoolConfigs ?? [];
  const { screenToFlowPosition, fitView } = useReactFlow();

  // Shared workflow state (source of truth)
  const [wf, setWf] = useState<WorkflowState>({
    uploadFile: null, uploadPreview: null, prompt: '', discipline: '', grade: '',
    bnccCode: '', bnccDescription: '', bnccJustification: '',
    model: 'openai', imageCount: 5, pageSize: 'A4', borders: true,
    schoolId: schools[0]?.id ?? '', results: [], pdfReady: false,
    extractedText: '', adaptedText: '', adaptationType: 'autismo', adaptarInputText: '',
    templateType: 'tea', creditsUsed: 0,
  });
  const [stepStatus, setStepStatus] = useState<Record<string, NodeStatus>>({
    upload: 'idle', prompt: 'idle', bncc: 'idle', ocr: 'idle', adaptar: 'idle',
    composicao: 'idle', folhapronta: 'idle', resultado: 'idle',
  });
  const [running, setRunning]         = useState(false);
  const [progress, setProgress]       = useState('');
  const [showAddMenu, setShowAddMenu]   = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [remainingCredits, setRemainingCredits] = useState<number>(-1);
  const [execSummary, setExecSummary] = useState<{ credits: number; remaining: number } | null>(null);

  // ── Persistência DB ────────────────────────────────────────────────────────
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Carrega workflow salvo na primeira renderização */
  useEffect(() => {
    if (!user.id || !user.tenant_id) return;
    WorkflowService.loadOrCreate(user.id, user.tenant_id)
      .then(({ workflowId: wid, data }) => {
        setWorkflowId(wid);
        if (!data) return; // sem dados salvos — usa defaults (template TEA)
        // Restaura layout
        if (data.nodesData.length > 0) {
          setNodes(data.nodesData.map(n => ({
            id:   n.id,
            type: n.type,
            position: n.position,
            data: makeNodeData({ nodeStatus: 'idle' }),
            dragHandle: '.node-drag-handle',
          })));
          setEdges(data.edgesData.map(e => ({
            id:     e.id,
            source: e.source,
            target: e.target,
            type:   e.type ?? 'premiumEdge',
            data:   { active: false, done: false },
          })));
        }
        // Restaura estado de configuração (sem File, sem results)
        if (data.wfState) {
          setWf(prev => ({
            ...prev,
            prompt:          data.wfState.prompt          ?? prev.prompt,
            discipline:      data.wfState.discipline      ?? prev.discipline,
            grade:           data.wfState.grade           ?? prev.grade,
            bnccCode:        data.wfState.bnccCode        ?? prev.bnccCode,
            bnccDescription: data.wfState.bnccDescription ?? prev.bnccDescription,
            model:           (data.wfState.model          ?? prev.model) as any,
            imageCount:      data.wfState.imageCount      ?? prev.imageCount,
            pageSize:        (data.wfState.pageSize       ?? prev.pageSize) as any,
            borders:         data.wfState.borders         ?? prev.borders,
            schoolId:        data.wfState.schoolId        ?? prev.schoolId,
            adaptationType:  data.wfState.adaptationType  ?? prev.adaptationType,
            adaptarInputText: data.wfState.adaptarInputText ?? prev.adaptarInputText,
            templateType:    data.wfState.templateType    ?? prev.templateType,
          }));
        }
        setTimeout(() => fitView({ padding: 0.15 }), 200);
      })
      .catch(e => console.warn('[WorkflowCanvas] load error (não crítico):', e?.message));
  }, []); // eslint-disable-line

  /** Auto-save debounced (1,5s após última mudança) */
  const triggerAutoSave = useCallback((
    currentNodes: typeof nodes,
    currentEdges: typeof edges,
    currentWf: typeof wf
  ) => {
    if (!workflowId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(async () => {
      try {
        const nodesData = currentNodes.map(n => ({ id: n.id, type: n.type ?? '', position: n.position }));
        const edgesData = currentEdges.map(e => ({ id: e.id, source: e.source, target: e.target, type: e.type ?? 'premiumEdge' }));
        const wfState: WorkflowSerializableState = {
          prompt: currentWf.prompt, discipline: currentWf.discipline,
          grade: currentWf.grade, bnccCode: currentWf.bnccCode,
          bnccDescription: currentWf.bnccDescription, model: currentWf.model,
          imageCount: currentWf.imageCount, pageSize: currentWf.pageSize,
          borders: currentWf.borders, schoolId: currentWf.schoolId,
          adaptationType: currentWf.adaptationType,
          adaptarInputText: currentWf.adaptarInputText, templateType: currentWf.templateType,
        };
        await WorkflowService.save(workflowId, { nodesData, edgesData, wfState });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    }, 1500);
  }, [workflowId]);

  // Fetch remaining credits on mount and keep ref for refresh
  const refreshCredits = useCallback(async () => {
    const n = await AIService.getRemainingCredits(user);
    setRemainingCredits(n);
  }, [user]);

  useEffect(() => { refreshCredits(); }, [refreshCredits]);

  // Stable callback refs (avoid stale closures in node data)
  const wfRef = useRef(wf); wfRef.current = wf;
  const updateWf = useCallback((patch: Partial<WorkflowState>) => {
    setWf(prev => ({ ...prev, ...patch }));
  }, []);
  const updateWfRef = useRef(updateWf); updateWfRef.current = updateWf;
  const runBnccRef      = useRef<() => void>(() => {});
  const genPdfRef       = useRef<() => void>(() => {});
  const saveActivityRef = useRef<() => void>(() => {});
  const deleteNodeRef   = useRef<(id: string) => void>(() => {});

  const makeNodeData = useCallback((overrides?: Partial<NodeData>): NodeData => ({
    ...wfRef.current,
    nodeStatus: 'idle',
    progress: '',
    schools,
    onUpdate: (p) => updateWfRef.current(p),
    onRunBncc: () => runBnccRef.current(),
    onGeneratePdf: () => genPdfRef.current(),
    onSaveActivity: () => saveActivityRef.current(),
    onDeleteNode: (id: string) => deleteNodeRef.current(id),
    ...overrides,
  }), [schools]);

  // Initial nodes (full chain) — default is TEA template
  const [nodes, setNodes, onNodesChange] = useNodesState(
    TEMPLATES.tea.nodeIds.map((id, i) => ({
      id, type: `${id}Node`,
      position: { x: i * 420, y: 0 },
      data: makeNodeData({ nodeStatus: 'idle' }),
      dragHandle: '.node-drag-handle',
    }))
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState(
    TEMPLATES.tea.edgeIds.map(([s, t], i) => ({
      id: `e${i}`, source: s, target: t, type: 'premiumEdge',
      data: { active: false, done: false },
    }))
  );

  // Dispara auto-save quando nodes ou edges mudam (excluindo mudanças de nodeStatus/progress)
  const nodesKey = nodes.map(n => `${n.id}:${n.position.x.toFixed(0)},${n.position.y.toFixed(0)}`).join('|');
  const edgesKey = edges.map(e => `${e.source}->${e.target}`).join('|');
  useEffect(() => {
    triggerAutoSave(nodes, edges, wf);
  }, [nodesKey, edgesKey]); // eslint-disable-line

  // Dispara auto-save quando wf state serializável muda
  const wfKey = `${wf.prompt}|${wf.discipline}|${wf.grade}|${wf.model}|${wf.templateType}`;
  useEffect(() => {
    triggerAutoSave(nodes, edges, wf);
  }, [wfKey]); // eslint-disable-line

  // ── Emite IDs dos nodes ao parent (para o Copilot) ─────────────────────────
  useEffect(() => {
    if (onWorkflowNodesChange) {
      onWorkflowNodesChange(nodes.map(n => n.id.replace(/-\d+$/, '')));
    }
  }, [nodes, onWorkflowNodesChange]); // eslint-disable-line

  // ── Sync wf + stepStatus + progress into every node on change ──────────────
  useEffect(() => {
    setNodes(nds => nds.map(n => ({
      ...n,
      data: {
        ...wf,
        nodeStatus: stepStatus[n.id] ?? 'idle',
        progress: stepStatus[n.id] === 'running' ? progress : '',
        schools,
        onUpdate: (p: Partial<WorkflowState>) => updateWfRef.current(p),
        onRunBncc: () => runBnccRef.current(),
        onGeneratePdf: () => genPdfRef.current(),
        onSaveActivity: () => saveActivityRef.current(),
        onDeleteNode: (i: string) => deleteNodeRef.current(i),
      },
    })));
  }, [wf, stepStatus, progress]); // eslint-disable-line

  // ── Template loading ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!templateToLoad) return;
    const t = TEMPLATES[templateToLoad];
    // Apply initialPrompt if template has one (and current prompt is empty)
    const promptToSet = t.initialPrompt && !wfRef.current.prompt.trim()
      ? t.initialPrompt
      : (t.initialPrompt || wfRef.current.prompt);
    const freshWf = { ...wfRef.current, prompt: promptToSet, templateType: templateToLoad as string };
    const data = makeNodeData({ ...freshWf } as any);
    const newNodes: Node[] = t.nodeIds.map((id, i) => ({
      id, type: `${id}Node`, position: { x: i * 460, y: 0 },
      data, dragHandle: '.node-drag-handle',
    }));
    const newEdges: Edge[] = t.edgeIds.map(([s, tgt], i) => ({
      id: `e${i}`, source: s, target: tgt, type: 'premiumEdge',
      data: { active: false, done: false },
    }));
    setNodes(newNodes);
    setEdges(newEdges);
    setStepStatus(Object.fromEntries(t.nodeIds.map(id => [id, 'idle' as NodeStatus])));
    setWf(freshWf);
    setTimeout(() => fitView({ padding: 0.15 }), 100);
    onTemplateLoaded();
  }, [templateToLoad]); // eslint-disable-line

  // ── Edge color sync ──────────────────────────────────────────────────────────
  const setEdgesActive = (active: boolean, done = false) => {
    setEdges(eds => eds.map(e => ({ ...e, data: { ...e.data, active, done } })));
  };

  const setEdgeActive = (source: string, active: boolean, done = false) => {
    setEdges(eds => eds.map(e => e.source === source ? { ...e, data: { ...e.data, active, done } } : e));
  };

  // ── Step helpers ─────────────────────────────────────────────────────────────
  const step = (id: string, s: NodeStatus) =>
    setStepStatus(prev => ({ ...prev, [id]: s }));

  // ── Delete node ──────────────────────────────────────────────────────────
  const deleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
    setStepStatus(prev => { const n = { ...prev }; delete n[nodeId]; return n; });
  }, [setNodes, setEdges]);

  deleteNodeRef.current = deleteNode;

  // ── BNCC identification ───────────────────────────────────────────────────
  const runBncc = useCallback(async () => {
    const cur = wfRef.current;
    step('bncc', 'running');
    setProgress('Identificando habilidade BNCC…');
    setEdgeActive('prompt', true);
    try {
      const raw = await AIService.generateFromPrompt(
        `Você é especialista em BNCC.
Identifique a habilidade BNCC mais adequada para uma atividade de ${cur.discipline || 'disciplina geral'} para o ${cur.grade || 'Ensino Fundamental'}.
Contexto: "${cur.prompt || 'Atividade educacional inclusiva'}"
Retorne SOMENTE JSON: {"code":"EF00XX00","description":"Descrição completa","justification":"Justificativa da escolha"}`,
        user
      );
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const p = JSON.parse(m[0]);
        updateWf({ bnccCode: p.code || '', bnccDescription: p.description || '', bnccJustification: p.justification || '' });
      }
      step('bncc', 'done');
      setEdgeActive('prompt', false, true);
    } catch { step('bncc', 'error'); }
    setProgress('');
  }, [user]);

  runBnccRef.current = runBncc;

  // ── Full workflow execution ────────────────────────────────────────────────
  const runWorkflow = useCallback(async () => {
    const cur = wfRef.current;
    const hasOcr        = nodes.some(n => n.id === 'ocr');
    const hasAdaptar    = nodes.some(n => n.id === 'adaptar');
    const hasPromptNode = nodes.some(n => n.id === 'prompt');
    const hasBnccNode2  = nodes.some(n => n.id === 'bncc');
    const hasComposicao = nodes.some(n => n.id === 'composicao');

    // Validação: sem OCR/Adaptar, o prompt é obrigatório para fluxos com imagem
    if (!hasOcr && !hasAdaptar && hasComposicao && !cur.prompt.trim()) {
      alert('Escreva um prompt no bloco "Prompt IA" antes de executar.');
      return;
    }
    // Para relatório: precisa de upload ou prompt
    if (hasOcr && !hasComposicao && !cur.uploadPreview && !cur.prompt.trim()) {
      alert('Faça upload de um documento ou escreva uma instrução no bloco Prompt IA.');
      return;
    }
    // Para adaptação: precisa de algum texto (OCR, manual, ou prompt)
    if (hasAdaptar) {
      const hasAdaptarSource = cur.uploadPreview || cur.adaptarInputText?.trim() || cur.prompt.trim();
      if (!hasAdaptarSource) {
        alert('Para adaptar a atividade, preencha o campo "Texto para adaptar" no bloco Adaptar, faça upload de uma imagem com OCR, ou escreva um Prompt IA.');
        return;
      }
    }

    // Estima custo total ANTES de iniciar — bloqueia se saldo insuficiente
    const estimatedCost =
      (hasOcr        ? AI_CREDIT_COSTS.OCR               : 0) +
      (hasAdaptar    ? AI_CREDIT_COSTS.ADAPTAR_ATIVIDADE  : 0) +
      (hasBnccNode2  ? AI_CREDIT_COSTS.TEXTO_SIMPLES      : 0) +
      (hasComposicao ? calcCredits(cur.model, cur.imageCount) : 0) +
      (hasPromptNode && !hasComposicao && !hasAdaptar ? AI_CREDIT_COSTS.RELATORIO_PADRAO : 0);

    if (estimatedCost > 0 && !(await AIService.checkCredits(user, estimatedCost))) {
      alert(CREDIT_INSUFFICIENT_MSG);
      return;
    }

    setRunning(true);
    setExecSummary(null);
    setEdgesActive(true);
    onStarted();

    try {
      // ── 1. Upload mark ────────────────────────────────────────────────────
      if (hasOcr || nodes.some(n => n.id === 'upload')) {
        step('upload', 'done');
      }

      // ── 2. OCR ────────────────────────────────────────────────────────────
      if (hasOcr) {
        step('ocr', 'running');
        setProgress('Extraindo texto da atividade…');
        setEdgeActive('upload', true);
        try {
          if (cur.uploadPreview) {
            const extracted = await AIService.extractTextFromImage(cur.uploadPreview, user);
            updateWf({ extractedText: extracted });
            setEdgeActive('upload', false, true);
          }
          step('ocr', 'done');
        } catch (e: any) {
          step('ocr', 'error');
          throw new Error('Falha no OCR: ' + (e?.message || 'verifique o upload'));
        }
      }

      // ── 3. Adaptar (TEA/TDAH/etc.) ────────────────────────────────────────
      if (hasAdaptar) {
        step('adaptar', 'running');
        const diagLabel = ADAPTATION_OPTIONS.find(o => o.id === wfRef.current.adaptationType)?.label || wfRef.current.adaptationType;
        setProgress(`Adaptando para ${diagLabel}…`);
        setEdgeActive('ocr', true);
        try {
          // Prioridade: texto do OCR → texto manual inserido no node → prompt IA
          const source = wfRef.current.extractedText?.trim()
            || wfRef.current.adaptarInputText?.trim()
            || wfRef.current.prompt?.trim();
          if (!source) {
            // Não abortar o fluxo — apenas marcar esse node como erro e continuar
            step('adaptar', 'error');
            setEdgeActive('ocr', false);
          } else {
            const adapted = await AIService.adaptActivityText(
              source,
              wfRef.current.adaptationType || 'autismo',
              wfRef.current.grade,
              user
            );
            updateWf({ adaptedText: adapted, prompt: adapted.slice(0, 400) });
            setEdgeActive('ocr', false, true);
            step('adaptar', 'done');
          }
        } catch (e: any) {
          step('adaptar', 'error');
          // Não lança erro — continua o fluxo sem a adaptação
          setEdgeActive('ocr', false);
        }
      }

      // ── 4. Relatório (prompt → texto, sem imagens) ────────────────────────
      if (hasPromptNode && !hasComposicao && !hasAdaptar) {
        step('prompt', 'running');
        setProgress('Gerando relatório pedagógico…');
        setEdgeActive('ocr', true);
        try {
          const context = wfRef.current.extractedText;
          const instruction = wfRef.current.prompt;
          if (instruction.trim()) {
            const report = await AIService.generateReport(context, instruction, user);
            updateWf({ adaptedText: report });
          }
          setEdgeActive('ocr', false, true);
          step('prompt', 'done');
        } catch (e: any) {
          step('prompt', 'error');
          throw new Error('Falha ao gerar relatório: ' + (e?.message || ''));
        }
      }

      // ── 5. BNCC ───────────────────────────────────────────────────────────
      if (hasBnccNode2 && !wfRef.current.bnccCode) {
        step('bncc', 'running'); setProgress('Identificando BNCC…');
        await runBncc();
      } else if (hasBnccNode2) {
        step('bncc', 'done');
      }

      // ── 6. Composição + Imagens (somente se o nó existe) ──────────────────
      let generated: ResultImage[] = [];
      let imagesGenerated = 0; // declarado fora para ser acessível no passo 8
      if (hasComposicao) {
        step('composicao', 'running'); setProgress('Gerando prompts de imagem…');
        const curFinal = wfRef.current;
        let imagePrompts: string[] = [];
        const count = curFinal.imageCount;
        // Custo real por imagem conforme modelo selecionado pelo usuário
        const costPerImage = AI_CREDIT_COSTS.IMAGEM_PREMIUM; // Imagen 4.0 (Google)

        if (curFinal.uploadPreview) {
          const raw = await AIService.generateFromPromptWithImage(
            `Analise esta atividade. Com base na instrução: "${curFinal.prompt}"
Gere exatamente ${count} prompts em inglês para ilustrações pedagógicas inclusivas, separados por |||, sem numeração.`,
            curFinal.uploadPreview, user
          );
          imagePrompts = raw.split('|||').map(p => p.trim()).filter(Boolean).slice(0, count);
        }
        while (imagePrompts.length < count) {
          imagePrompts.push(`Inclusive educational illustration ${imagePrompts.length + 1}: ${curFinal.prompt}, simple, colorful, accessible`);
        }

        // FIX: deducção em lote — evita double-billing (pre-flight já verificou o total)
        // skipDeduction=true: não debita por imagem, debitamos uma vez abaixo com o total real
        let imageErrors = 0;
        let lastImageErrorMsg = '';
        const { supabase } = await import('../../lib/supabaseClient');
        const tenantId = (user as any).tenant_id ?? user.id;

        for (let i = 0; i < imagePrompts.length; i++) {
          setProgress(`Gerando imagem ${i + 1} de ${imagePrompts.length}…`);
          let imageUrl = '';
          try {
            // FIX: skipDeduction=true — deducção controlada em lote abaixo
            const tempUrl = await AIService.generateImageFromPrompt(imagePrompts[i], user, costPerImage, true);
            imagesGenerated++;
            // FIX: persiste no Storage — URLs DALL-E expiram em 60 minutos
            try {
              const resp = await fetch(tempUrl);
              if (resp.ok) {
                const blob = await resp.blob();
                const ext = blob.type.includes('png') ? 'png' : 'jpg';
                const path = `${tenantId}/${Date.now()}_${i}.${ext}`;
                const { error: upErr } = await supabase.storage
                  .from('imagens_atividades')
                  .upload(path, blob, { cacheControl: '31536000', upsert: false });
                if (!upErr) {
                  const { data: urlData } = supabase.storage.from('imagens_atividades').getPublicUrl(path);
                  imageUrl = urlData?.publicUrl ?? tempUrl;
                } else {
                  imageUrl = tempUrl; // fallback para URL temporária se storage falhar
                }
              } else {
                imageUrl = tempUrl;
              }
            } catch {
              imageUrl = tempUrl; // fallback se storage não configurado
            }
          } catch (imgErr: any) {
            imageErrors++;
            lastImageErrorMsg = imgErr?.message || String(imgErr);
            console.error(`[AtivaIA] Falha na geração da imagem ${i + 1} — erro real:`, lastImageErrorMsg, imgErr);
            // imageUrl permanece '' — placeholder será exibido
          }
          generated.push({ id: `img-${Date.now()}-${i}`, imageUrl, description: imagePrompts[i] });
          setWf(prev => ({ ...prev, results: [...generated] }));
        }

        if (imageErrors === imagePrompts.length) {
          // Todas as imagens falharam — expõe o erro real da API
          step('composicao', 'error');
          throw new Error(`Nenhuma imagem foi gerada. Erro da API: ${lastImageErrorMsg || 'desconhecido — verifique o console do browser.'}`);
        }

        // FIX: debita apenas as imagens que foram efetivamente geradas (sem double-billing)
        if (imagesGenerated > 0) {
          const totalImageCost = costPerImage * imagesGenerated;
          await AIService.deductCredits(user, `ATIVAIAI_IMAGENS:${curFinal.model}:${imagesGenerated}`, totalImageCost);
        }
        step('composicao', 'done');
      }

      // ── 7. FolhaPronta ────────────────────────────────────────────────────
      step('folhapronta', 'running'); setProgress('Montando documento…');
      await new Promise(r => setTimeout(r, 500));
      setWf(prev => ({ ...prev, results: generated, pdfReady: true }));
      step('folhapronta', 'done');

      // ── 8. Resultado ──────────────────────────────────────────────────────
      const ocrC      = nodes.some(n => n.id === 'ocr')      ? AI_CREDIT_COSTS.OCR              : 0;
      const adaptarC  = nodes.some(n => n.id === 'adaptar')  ? AI_CREDIT_COSTS.ADAPTAR_ATIVIDADE : 0;
      const bnccC     = nodes.some(n => n.id === 'bncc')     ? AI_CREDIT_COSTS.TEXTO_SIMPLES     : 0;
      // FIX: usa imagesGenerated (real) e costPerImage correto, não a estimativa do imageCount inicial
      const imageC    = nodes.some(n => n.id === 'composicao')
        ? AI_CREDIT_COSTS.IMAGEM_PREMIUM * imagesGenerated // Imagen 4.0 (Google)
        : 0;
      const relatorioC = (nodes.some(n => n.id === 'prompt') && !nodes.some(n => n.id === 'composicao') && !nodes.some(n => n.id === 'adaptar')) ? AI_CREDIT_COSTS.RELATORIO_PADRAO : 0;
      const totalCredits = ocrC + adaptarC + bnccC + imageC + relatorioC;
      updateWf({ creditsUsed: totalCredits });
      step('resultado', 'done');
      setEdgesActive(false, true);
      // Refresh balance and show post-exec summary
      const updatedRemaining = await AIService.getRemainingCredits(user);
      setRemainingCredits(updatedRemaining);
      setExecSummary({ credits: totalCredits, remaining: updatedRemaining });

    } catch (e: any) {
      alert('Erro: ' + (e?.message || 'Verifique suas chaves de API.'));
      setEdgesActive(false);
    } finally {
      setRunning(false);
      setProgress('');
    }
  }, [nodes, runBncc, user]);

  // ── PDF export ─────────────────────────────────────────────────────────────
  const generatePdf = useCallback(() => {
    const cur = wfRef.current;
    const school = schools.find(s => s.id === cur.schoolId);
    const isTextOnly = cur.results.length === 0;
    const reportContent = cur.adaptedText || cur.prompt || '';
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const adaptLabel = ADAPTATION_OPTIONS.find(o => o.id === cur.adaptationType)?.label ?? '';

    const escHtml = (t: string) => t
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const formatReportHtml = (text: string) => escHtml(text)
      .replace(/^## (.+)$/gm, '<h3 class="h3">$1</h3>')
      .replace(/^# (.+)$/gm, '<h2 class="h2">$1</h2>')
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');

    const schoolHeader = school ? `
      <div class="school-bar">
        <div>
          <div class="school-name">${escHtml(school.schoolName)}</div>
          ${[school.address, school.city, school.state].filter(Boolean).length
            ? `<div class="school-info">${[school.address, school.city, school.state].filter(Boolean).map(escHtml).join(' · ')}</div>`
            : ''}
          ${school.cnpj ? `<div class="school-info">CNPJ: ${school.cnpj}${school.inepCode ? ` &nbsp;|&nbsp; INEP: ${school.inepCode}` : ''}</div>` : ''}
        </div>
        <div class="doc-type-label">Atividade Pedagógica Inclusiva</div>
      </div>` : `
      <div class="school-bar">
        <div class="school-name">IncluiAI — Plataforma de Educação Inclusiva</div>
        <div class="doc-type-label">Atividade Pedagógica</div>
      </div>`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Atividade Pedagógica — IncluiAI</title>
<style>
  @page { size: A4 portrait; margin: 18mm 20mm 18mm 25mm; }
  *{ box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12pt; color: #1F2937; background: #fff; }

  /* ── Cabeçalho ── */
  .school-bar {
    display: flex; align-items: flex-start; justify-content: space-between;
    background: #1F4E5F; color: #fff;
    padding: 12px 16px; border-radius: 10px 10px 0 0;
    margin-bottom: 0;
  }
  .school-name { font-size: 13pt; font-weight: 700; letter-spacing: -0.01em; }
  .school-info { font-size: 8pt; color: rgba(255,255,255,0.72); margin-top: 2px; }
  .doc-type-label { font-size: 9pt; font-weight: 600; color: rgba(255,255,255,0.85); text-align: right; white-space: nowrap; margin-top: 3px; }

  /* ── Faixa de metadata ── */
  .meta-bar {
    background: #F6F4EF; border: 1px solid #E7E2D8; border-top: none;
    padding: 7px 16px; display: flex; align-items: center; justify-content: space-between;
    font-size: 8pt; color: #667085; border-radius: 0 0 8px 8px;
    margin-bottom: 18px;
  }
  .meta-bar strong { color: #2E3A59; }

  /* ── BNCC badge ── */
  .bncc-row { margin-bottom: 14px; display: flex; align-items: flex-start; gap: 10px; }
  .bncc-badge {
    background: #DCFCE7; color: #166534; font-size: 10pt; font-weight: 800;
    padding: 4px 12px; border-radius: 99px; white-space: nowrap; flex-shrink: 0;
  }
  .bncc-desc { font-size: 10pt; color: #374151; line-height: 1.5; }

  /* ── Adaptação badge ── */
  .adapt-badge {
    display: inline-block; background: #FFFBEB; color: #D97706; border: 1px solid #FDE68A;
    font-size: 9pt; font-weight: 700; padding: 3px 12px; border-radius: 99px; margin-bottom: 14px;
  }

  /* ── Título e subtítulo ── */
  .doc-title { font-size: 16pt; font-weight: 800; color: #1F2937; margin-bottom: 4px; letter-spacing: -0.02em; }
  .doc-subtitle { font-size: 10pt; color: #4B5563; margin-bottom: 16px; line-height: 1.5; }

  /* ── Grade de imagens ── */
  .img-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0; }
  .img-box { border: 1px solid #E7E2D8; border-radius: 10px; overflow: hidden; aspect-ratio: 1; }
  .img-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .img-placeholder {
    width: 100%; height: 100%; background: linear-gradient(135deg, #FDF6E3 0%, #F6F4EF 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 8pt; color: #9CA3AF; padding: 8px; text-align: center; line-height: 1.4;
  }

  /* ── Seção de resposta ── */
  .answer-section {
    margin-top: 20px; padding-top: 14px; border-top: 1.5px solid #E7E2D8;
  }
  .answer-label {
    font-size: 9pt; font-weight: 700; color: #667085; text-transform: uppercase;
    letter-spacing: 0.07em; margin-bottom: 10px;
  }
  .answer-line { border-bottom: 1px dashed #D1D5DB; margin: 12px 0; }

  /* ── Relatório / texto adaptado ── */
  .report-body { line-height: 1.75; color: #1F2937; font-size: 11pt; }
  .report-body p { margin-bottom: 10px; }
  .report-body li { margin: 4px 0 4px 20px; }
  .h2 { font-size: 13pt; font-weight: 700; color: #1F2937; margin: 18px 0 8px; }
  .h3 { font-size: 11pt; font-weight: 700; color: #1F4E5F; margin: 14px 0 6px; border-bottom: 1px solid #E7E2D8; padding-bottom: 4px; }

  /* ── Seção divisora ── */
  .section-divider {
    background: #2E3A59; color: #fff;
    font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    padding: 5px 12px; border-radius: 6px; margin: 18px 0 10px;
  }

  /* ── Borda na folha ── */
  .bordered { border: 1.5px solid #C9C3B5; border-radius: 12px; padding: 20px; }

  /* ── Rodapé ── */
  .footer {
    margin-top: 24px; padding-top: 8px; border-top: 1px solid #E7E2D8;
    font-size: 8pt; color: #9CA3AF; display: flex; justify-content: space-between;
    align-items: center;
  }

  @media print {
    body { margin: 0; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="${cur.borders ? 'bordered' : ''}">
  ${schoolHeader}

  <div class="meta-bar">
    <span>Gerado em <strong>${dateStr}</strong> às <strong>${timeStr}</strong> &nbsp;·&nbsp; IncluiAI</span>
    <span>${cur.templateType ? `Template: <strong>${cur.templateType.toUpperCase()}</strong> &nbsp;·&nbsp;` : ''}${cur.creditsUsed ? `${cur.creditsUsed} créditos` : ''}</span>
  </div>

  ${cur.bnccCode ? `
  <div class="bncc-row">
    <span class="bncc-badge">${escHtml(cur.bnccCode)}</span>
    <span class="bncc-desc">${escHtml(cur.bnccDescription || '')}</span>
  </div>` : ''}

  ${adaptLabel ? `<div class="adapt-badge">Adaptado para: ${escHtml(adaptLabel)}</div>` : ''}

  ${isTextOnly ? `
    <div class="doc-title">${cur.bnccCode ? 'Relatório Pedagógico' : 'Documento Pedagógico Adaptado'}</div>
    <div class="section-divider">Conteúdo</div>
    <div class="report-body"><p>${formatReportHtml(reportContent)}</p></div>
    <div class="answer-section">
      <div class="answer-label">Observações do Professor</div>
      <div class="answer-line"></div>
      <div class="answer-line"></div>
      <div class="answer-line"></div>
    </div>
  ` : `
    <div class="doc-title">Atividade Pedagógica Inclusiva</div>
    ${cur.prompt ? `<div class="doc-subtitle">${escHtml(cur.prompt.slice(0, 200))}${cur.prompt.length > 200 ? '…' : ''}</div>` : ''}
    <div class="section-divider">Materiais Pedagógicos</div>
    <div class="img-grid">
      ${cur.results.map(img => `
        <div class="img-box">
          ${img.imageUrl
            ? `<img src="${img.imageUrl}" alt="Ilustração pedagógica" />`
            : `<div class="img-placeholder">${escHtml(img.description.slice(0, 80))}${img.description.length > 80 ? '…' : ''}</div>`
          }
        </div>
      `).join('')}
    </div>
    <div class="answer-section">
      <div class="answer-label">Espaço para Resposta do Aluno</div>
      <div class="answer-line"></div>
      <div class="answer-line"></div>
      <div class="answer-line"></div>
      <div class="answer-line"></div>
    </div>
  `}

  <div class="footer">
    <span>IncluiAI — Plataforma de Educação Inclusiva · incluiai.com</span>
    <span>${dateStr}</span>
  </div>
</div>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 600));</script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    }
  }, [schools]);

  genPdfRef.current = generatePdf;

  // ── Save activity ────────────────────────────────────────────────────────
  const openSaveModal = useCallback(() => setShowSaveModal(true), []);
  saveActivityRef.current = openSaveModal;

  const handleSaveActivity = useCallback(async (title: string, studentId?: string) => {
    const cur = wfRef.current;
    const content = cur.adaptedText || cur.prompt || cur.extractedText;
    // FIX: passa as URLs reais das imagens persistidas no Storage
    const imageUrls = cur.results.map(r => r.imageUrl).filter(Boolean);
    const hasImages = imageUrls.length > 0;
    try {
      await AIService.saveGeneratedActivity({
        user,
        title,
        templateType: cur.templateType || 'custom',
        content,
        imageCount: cur.results.length,
        creditsUsed: cur.creditsUsed,
        studentId,
        modelUsed: cur.model,
        outputType: hasImages ? 'text_image' : 'text',
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      });
    } catch (err: any) {
      const msg = err?.message ?? 'Erro ao salvar atividade.';
      alert(msg);
    }
  }, [user]);

  // ── Add block ─────────────────────────────────────────────────────────────
  const addBlock = (type: string) => {
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const rawId = type.replace('Node', '');
    const id = `${rawId}-${Date.now()}`;
    const newNode: Node = {
      id, type,
      position: { x: center.x - 170, y: center.y - 100 },
      data: makeNodeData(),
      dragHandle: '.node-drag-handle',
    };
    setNodes(prev => [...prev, newNode]);
    setStepStatus(prev => ({ ...prev, [id]: 'idle' }));
    setShowAddMenu(false);
  };

  const resetFlow = () => {
    const fresh: WorkflowState = {
      uploadFile: null, uploadPreview: null, prompt: '', discipline: '', grade: '',
      bnccCode: '', bnccDescription: '', bnccJustification: '',
      model: 'openai', imageCount: 5, pageSize: 'A4', borders: true,
      schoolId: schools[0]?.id ?? '', results: [], pdfReady: false,
      extractedText: '', adaptedText: '', adaptationType: 'autismo', adaptarInputText: '',
      templateType: 'tea', creditsUsed: 0,
    };
    setWf(fresh);
    setStepStatus(Object.fromEntries(nodes.map(n => [n.id, 'idle' as NodeStatus])));
    setEdgesActive(false);
  };

  const onConnect = useCallback(
    (conn: Connection) => setEdges(eds => addEdge({ ...conn, type: 'premiumEdge', data: { active: false, done: false } }, eds)),
    [setEdges]
  );

  const hasOcrNode      = nodes.some(n => n.id === 'ocr');
  const hasAdaptarNode  = nodes.some(n => n.id === 'adaptar');
  const hasBnccNode     = nodes.some(n => n.id === 'bncc');
  const hasComposicaoN  = nodes.some(n => n.id === 'composicao');
  const hasPromptN      = nodes.some(n => n.id === 'prompt');
  const ocrCost         = hasOcrNode ? AI_CREDIT_COSTS.OCR              : 0;
  const adaptarCost     = hasAdaptarNode ? AI_CREDIT_COSTS.ADAPTAR_ATIVIDADE : 0;
  const bnccCost        = hasBnccNode ? AI_CREDIT_COSTS.TEXTO_SIMPLES     : 0;
  const imageCost       = hasComposicaoN ? calcCredits(wf.model, wf.imageCount) : 0;
  const relatorioCost   = (hasPromptN && !hasComposicaoN && !hasAdaptarNode) ? AI_CREDIT_COSTS.RELATORIO_PADRAO : 0;
  const credits = imageCost + ocrCost + adaptarCost + bnccCost + relatorioCost;
  const isDone = Object.values(stepStatus).some(s => s === 'done');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 16px', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowAddMenu(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: `1.5px solid ${C.border}`, borderRadius: 9, background: showAddMenu ? C.bg : C.surface, fontSize: 12, fontWeight: 700, color: C.text, cursor: 'pointer', transition: 'all .2s' }}>
            <Plus size={13} /> Bloco
          </button>
          {isDone && (
            <button onClick={resetFlow}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: `1.5px solid ${C.border}`, borderRadius: 9, background: C.surface, fontSize: 12, fontWeight: 600, color: C.textSec, cursor: 'pointer', transition: 'all .2s' }}>
              <RefreshCw size={12} /> Reiniciar
            </button>
          )}
          {onToggleFocus && (
            <button
              onClick={onToggleFocus}
              title={focusMode ? 'Sair do Modo Foco (Esc)' : 'Modo Foco — tela cheia'}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: `1.5px solid ${focusMode ? C.petrol : C.border}`, borderRadius: 9, background: focusMode ? `${C.petrol}18` : C.surface, fontSize: 12, fontWeight: 600, color: focusMode ? C.petrol : C.textSec, cursor: 'pointer', transition: 'all .2s' }}>
              {focusMode ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              {focusMode ? 'Sair Foco' : 'Modo Foco'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Credit cost badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: (remainingCredits !== -1 && remainingCredits < credits) ? '#FEF2F2' : C.goldLight,
            border: `1px solid ${(remainingCredits !== -1 && remainingCredits < credits) ? '#FECACA' : C.border}`,
            borderRadius: 9, padding: '6px 12px', fontSize: 12, fontWeight: 700,
            color: (remainingCredits !== -1 && remainingCredits < credits) ? C.err : C.dark,
          }}>
            {(remainingCredits !== -1 && remainingCredits < credits)
              ? <AlertTriangle size={13} color={C.err} />
              : <Coins size={13} color={C.gold} />}
            {credits} créditos
            {remainingCredits !== -1 && (
              <span style={{ fontSize: 10, fontWeight: 600, color: C.textSec, marginLeft: 4, borderLeft: `1px solid ${C.border}`, paddingLeft: 8 }}>
                de {remainingCredits} disponíveis
              </span>
            )}
          </div>
          {/* Auto-save indicator */}
          {saveStatus !== 'idle' && (
            <span style={{ fontSize: 11, color: saveStatus === 'saved' ? C.ok : C.textSec, display: 'flex', alignItems: 'center', gap: 4 }}>
              {saveStatus === 'saving'
                ? <><Loader size={11} className="animate-spin" /> Salvando…</>
                : <><CheckCircle size={11} /> Salvo</>}
            </span>
          )}
          {/* Execute button — opens confirm modal */}
          <button onClick={() => setShowConfirmModal(true)} disabled={running}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: running ? C.border : C.petrol, color: running ? C.textSec : '#fff', border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: running ? 'not-allowed' : 'pointer', boxShadow: running ? 'none' : `0 4px 16px ${C.petrol}40`, transition: 'all .2s' }}>
            {running ? <><Loader size={13} className="animate-spin" /> {progress || 'Processando…'}</> : <><Play size={13} /> Executar Fluxo</>}
          </button>
        </div>
      </div>

      {/* Block add menu */}
      {showAddMenu && <BlockAddMenu onAdd={addBlock} onClose={() => setShowAddMenu(false)} />}

      {/* Canvas */}
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          fitView fitViewOptions={{ padding: 0.15 }}
          minZoom={0.25} maxZoom={1.5}
          deleteKeyCode={['Delete', 'Backspace']}
          proOptions={{ hideAttribution: true }}
          onNodesDelete={deleted => setStepStatus(prev => {
            const n = { ...prev };
            deleted.forEach(node => delete n[node.id]);
            return n;
          })}
          style={{ background: C.bg }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#C9C3B5" />
          <Controls showInteractive={false} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }} />
          <MiniMap
            nodeColor={n => {
              const s = ((n.data as NodeData).nodeStatus ?? 'idle');
              return s === 'done' ? C.ok : s === 'running' ? C.petrol : s === 'error' ? C.err : C.border;
            }}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}
          />
        </ReactFlow>
      </div>

      {/* Progress bar */}
      {running && (
        <div style={{ padding: '8px 16px', background: C.runBg, borderTop: `1px solid ${C.runBorder}`, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.petrol, fontWeight: 600 }}>
          <Loader size={11} className="animate-spin" />
          {progress}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {nodes.map(n => {
              const s = stepStatus[n.id] ?? 'idle';
              const col = s === 'done' ? C.ok : s === 'running' ? C.petrol : s === 'error' ? C.err : C.border;
              return <div key={n.id} style={{ width: 7, height: 7, borderRadius: 99, background: col, transition: 'background .3s' }} className={s === 'running' ? 'animate-pulse' : ''} />;
            })}
          </div>
        </div>
      )}

      {/* Post-execution summary bar */}
      {execSummary && !running && (
        <div style={{ padding: '7px 16px', background: C.okBg, borderTop: `1px solid ${C.okBorder}`, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.ok, fontWeight: 600 }}>
          <CheckCircle size={13} color={C.ok} />
          Fluxo concluído — <strong>{execSummary.credits} créditos usados</strong>
          {execSummary.remaining !== -1 && (
            <> · <History size={11} color={C.ok} /> <strong>{execSummary.remaining} créditos restantes</strong></>
          )}
          <button onClick={() => setExecSummary(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 2, borderRadius: 6, display: 'flex', alignItems: 'center', color: C.textSec }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Credits Confirm Modal */}
      <CreditsConfirmModal
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={runWorkflow}
        remaining={remainingCredits}
        total={credits}
        items={[
          ...(hasOcrNode      ? [{ label: 'OCR — Extrair Texto',    cost: ocrCost,      color: '#7C3AED' }] : []),
          ...(hasAdaptarNode  ? [{ label: 'Adaptação Inclusiva',     cost: adaptarCost,  color: '#D97706' }] : []),
          ...(hasBnccNode     ? [{ label: 'BNCC Smart',              cost: bnccCost,     color: C.petrol  }] : []),
          ...(hasComposicaoN  ? [{ label: `Imagens (${wf.imageCount}× Imagen 4.0)`, cost: imageCost, color: C.dark }] : []),
          ...(hasPromptN && !hasComposicaoN && !hasAdaptarNode ? [{ label: 'Relatório Pedagógico', cost: relatorioCost, color: C.dark }] : []),
        ]}
      />

      {/* Save Activity Modal */}
      <SaveActivityModal
        open={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveActivity}
        templateType={wf.templateType}
        creditsUsed={wf.creditsUsed}
        students={students}
      />
    </div>
  );
};

// ─── Template Card (individual) ───────────────────────────────────────────────
const TemplateCard: React.FC<{
  id: keyof typeof TEMPLATES;
  template: typeof TEMPLATES[keyof typeof TEMPLATES];
  onLoad: (id: keyof typeof TEMPLATES) => void;
}> = ({ id, template: t, onLoad }) => {
  const [hover, setHover] = useState(false);
  const Icon = t.icon;

  return (
    <div
      style={{
        background: C.surface,
        border: `2px solid ${hover ? t.color : C.border}`,
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: hover ? `0 10px 36px ${t.color}22` : '0 2px 12px rgba(0,0,0,0.06)',
        transition: 'all .22s',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
    >
      {/* Accent bar */}
      <div style={{ height: 5, background: `linear-gradient(90deg, ${t.color} 0%, ${t.color}55 100%)` }} />

      {/* Body */}
      <div style={{ padding: '20px 22px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ background: t.color, padding: 11, borderRadius: 13, boxShadow: `0 4px 14px ${t.color}44`, flexShrink: 0 }}>
              <Icon size={20} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{t.label}</div>
              <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{(t as any).shortDesc}</div>
            </div>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700,
            background: `${t.color}14`, color: t.color,
            padding: '4px 10px', borderRadius: 99,
            border: `1px solid ${t.color}28`,
            flexShrink: 0, whiteSpace: 'nowrap'
          }}>{(t as any).category}</span>
        </div>

        {/* Description */}
        <p style={{ fontSize: 12, color: C.textSec, margin: 0, lineHeight: 1.65 }}>{t.desc}</p>

        {/* Flow preview */}
        <div style={{ background: C.bg, borderRadius: 12, padding: '10px 14px', border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textSec, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Pipeline</div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
            {t.nodeIds.map((nid, i) => {
              const blockLabel = BLOCK_CATALOG.find(b => b.type === `${nid}Node`)?.label ?? nid;
              const isFirst = i === 0;
              return (
                <React.Fragment key={nid}>
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    background: isFirst ? `${t.color}18` : C.surface,
                    border: `1.5px solid ${isFirst ? t.color : C.border}`,
                    color: isFirst ? t.color : C.textSec,
                    padding: '3px 8px', borderRadius: 99,
                    whiteSpace: 'nowrap'
                  }}>{blockLabel}</span>
                  {i < t.nodeIds.length - 1 && <ArrowRight size={8} color={C.borderMid} style={{ flexShrink: 0 }} />}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 'auto', paddingTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.textSec }}>
            <Coins size={11} color={C.gold} />
            <span style={{ fontWeight: 600 }}>{(t as any).credits}</span>
          </div>
          <button
            onClick={() => onLoad(id)}
            style={{
              padding: '9px 20px',
              background: hover ? t.color : C.surface,
              color: hover ? '#fff' : t.color,
              border: `2px solid ${t.color}`,
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all .18s',
              boxShadow: hover ? `0 4px 14px ${t.color}40` : 'none',
            }}
          >
            <Zap size={12} /> Usar Template
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Templates section — Biblioteca de Fluxos Pedagógicos ────────────────────
const TemplatesSection: React.FC<{ onLoad: (id: keyof typeof TEMPLATES) => void }> = ({ onLoad }) => (
  <div style={{ padding: '40px 0 16px' }}>
    {/* Section header */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
      <div style={{
        background: `linear-gradient(135deg, ${C.petrol} 0%, ${C.dark} 100%)`,
        padding: '10px',
        borderRadius: 14,
        boxShadow: `0 4px 16px ${C.petrol}44`,
        flexShrink: 0
      }}>
        <GraduationCap size={20} color="#fff" />
      </div>
      <div>
        <h3 style={{ fontSize: 19, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          Biblioteca de Fluxos Pedagógicos
        </h3>
        <p style={{ fontSize: 12, color: C.textSec, margin: 0 }}>
          Templates prontos para educação inclusiva — clique em <strong style={{ color: C.text }}>Usar Template</strong> para carregar no editor visual
        </p>
      </div>
    </div>

    {/* Cards grid */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
      {(Object.entries(TEMPLATES) as [keyof typeof TEMPLATES, typeof TEMPLATES[keyof typeof TEMPLATES]][]).map(([id, t]) => (
        <TemplateCard key={id} id={id} template={t} onLoad={onLoad} />
      ))}
    </div>
  </div>
);

// ─── Step guide ───────────────────────────────────────────────────────────────
const STEPS = [
  { n: 1, icon: Upload,       title: 'Enviar Atividade',   desc: 'Envie imagem, PDF ou comece do zero sem upload.' },
  { n: 2, icon: MessageSquare, title: 'Prompt IA',          desc: 'Explique à IA o que você quer criar ou adaptar.' },
  { n: 3, icon: BookOpen,     title: 'BNCC Smart',          desc: 'A IA identifica automaticamente a habilidade BNCC mais adequada.' },
  { n: 4, icon: Palette,      title: 'Composição Visual',   desc: 'Escolha tamanho da folha, número de imagens, bordas e escola.' },
  { n: 5, icon: FileText,     title: 'FolhaPronta',         desc: 'Monte a atividade final pronta para imprimir com cabeçalho institucional.' },
  { n: 6, icon: Sparkles,     title: 'Resultado',           desc: 'Visualize as imagens geradas, baixe individualmente ou tudo de uma vez.' },
];

const StepGuide: React.FC = () => (
  <div style={{ padding: '28px 0 32px' }}>
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ width: 3, height: 18, background: C.petrol, borderRadius: 99 }} />
        <h3 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>Como montar seu fluxo</h3>
      </div>
      <p style={{ fontSize: 12, color: C.textSec, margin: 0 }}>Siga estas etapas para criar atividades inclusivas com IA</p>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
      {STEPS.map(s => {
        const Icon = s.icon;
        return (
          <div key={s.n} style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: '18px 18px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: `linear-gradient(135deg, ${C.petrol} 0%, ${C.dark} 100%)`, color: '#fff', width: 30, height: 30, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0, boxShadow: `0 3px 10px ${C.petrol}30` }}>{s.n}</div>
              <div style={{ background: C.goldLight, padding: '6px 7px', borderRadius: 9, border: `1px solid ${C.border}` }}><Icon size={14} color={C.gold} /></div>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>{s.title}</span>
            </div>
            <p style={{ fontSize: 12, color: C.textSec, margin: 0, lineHeight: 1.6 }}>{s.desc}</p>
          </div>
        );
      })}
    </div>
  </div>
);

// ─── Empty State ──────────────────────────────────────────────────────────────
const EmptyState: React.FC<{ onStart: () => void; onTemplate: (id: keyof typeof TEMPLATES) => void }> = ({ onStart, onTemplate }) => (
  <div style={{ textAlign: 'center', maxWidth: 480, padding: '0 24px' }}>
    <div style={{
      width: 68, height: 68,
      background: `linear-gradient(135deg, ${C.petrol} 0%, ${C.dark} 100%)`,
      borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
      margin: '0 auto 22px', boxShadow: `0 10px 36px ${C.petrol}50`
    }}>
      <Zap size={30} color="#fff" />
    </div>
    <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
      Editor Visual de IA — AtivaIA
    </h2>
    <p style={{ fontSize: 13, color: C.textSec, margin: '0 0 26px', lineHeight: 1.65 }}>
      Crie atividades inclusivas, relatórios pedagógicos e documentos adaptados com fluxos visuais de IA.
    </p>

    {/* Template quick picks */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
      {(Object.entries(TEMPLATES) as [keyof typeof TEMPLATES, any][]).map(([id, t]) => (
        <button key={id} onClick={() => onTemplate(id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px',
            background: C.surface, color: C.dark,
            border: `2px solid ${C.border}`,
            borderRadius: 13, fontSize: 13, fontWeight: 700,
            cursor: 'pointer', textAlign: 'left',
            transition: 'all .18s',
          }}
          onMouseOver={e => { (e.currentTarget.style.borderColor = t.color); (e.currentTarget.style.boxShadow = `0 4px 16px ${t.color}28`); }}
          onMouseOut={e => { (e.currentTarget.style.borderColor = C.border); (e.currentTarget.style.boxShadow = 'none'); }}
        >
          <div style={{ background: t.color, padding: '8px', borderRadius: 10, flexShrink: 0, boxShadow: `0 3px 10px ${t.color}44` }}>
            <t.icon size={15} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{t.label}</div>
            <div style={{ fontSize: 11, color: C.textSec, marginTop: 1 }}>{t.shortDesc}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.textSec, flexShrink: 0 }}>
            <Coins size={10} color={C.gold} />
            <span>{t.credits}</span>
          </div>
          <ArrowRight size={14} color={C.textSec} style={{ flexShrink: 0 }} />
        </button>
      ))}
    </div>

    <button onClick={onStart}
      style={{
        width: '100%', padding: '10px 22px',
        background: 'none', color: C.textSec,
        border: `1.5px dashed ${C.border}`,
        borderRadius: 11, fontSize: 12, fontWeight: 600,
        cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 7, transition: 'all .2s'
      }}
      onMouseOver={e => { (e.currentTarget.style.borderColor = C.petrol); (e.currentTarget.style.color = C.petrol); }}
      onMouseOut={e => { (e.currentTarget.style.borderColor = C.border); (e.currentTarget.style.color = C.textSec); }}
    >
      <Plus size={14} /> Criar fluxo do zero
    </button>
  </div>
);

// ─── Public export ────────────────────────────────────────────────────────────
export const WorkflowCanvas: React.FC<{
  user: User;
  students?: Student[];
  sidebarOpen?: boolean;
  onWorkflowNodesChange?: (nodeIds: string[]) => void;
}> = ({ user, students = [], sidebarOpen = true, onWorkflowNodesChange }) => {
  const [templateToLoad, setTemplateToLoad] = useState<keyof typeof TEMPLATES | null>(null);
  const [started, setStarted] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  // Resize tracking for normal mode height
  const [windowH, setWindowH] = useState(window.innerHeight);
  useEffect(() => {
    const onResize = () => setWindowH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ESC exits focus mode
  useEffect(() => {
    if (!focusMode) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocusMode(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [focusMode]);

  const canvasHeight = sidebarOpen ? 720 : Math.max(720, windowH - 280);

  const canvasWrapStyle: React.CSSProperties = focusMode
    ? { position: 'fixed', inset: 0, zIndex: 9900, borderRadius: 0, border: 'none', overflow: 'hidden', background: C.bg }
    : { borderRadius: 18, border: `1.5px solid ${C.border}`, overflow: 'hidden', height: canvasHeight, background: C.bg, position: 'relative', boxShadow: '0 4px 28px rgba(0,0,0,0.09)', transition: 'height 0.35s ease' };

  return (
    <div>
      {/* Canvas */}
      <div style={canvasWrapStyle}>
        {/* Empty state overlay */}
        {!started && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${C.bg}F0`, backdropFilter: 'blur(2px)', borderRadius: focusMode ? 0 : 18 }}>
            <EmptyState
              onStart={() => setStarted(true)}
              onTemplate={id => { setTemplateToLoad(id); setStarted(true); }}
            />
          </div>
        )}
        <ReactFlowProvider>
          <InnerCanvas
            user={user}
            students={students}
            templateToLoad={templateToLoad}
            onTemplateLoaded={() => setTemplateToLoad(null)}
            onStarted={() => setStarted(true)}
            onWorkflowNodesChange={onWorkflowNodesChange}
            focusMode={focusMode}
            onToggleFocus={() => setFocusMode(v => !v)}
          />
        </ReactFlowProvider>
      </div>

      {/* Templates + Guide — hidden in focus mode */}
      {!focusMode && (
        <>
          <TemplatesSection onLoad={id => { setTemplateToLoad(id); setStarted(true); }} />
          <StepGuide />
        </>
      )}
    </div>
  );
};
