// IncluiLabView.tsx — Central de Inteligência Inclusiva (chat unificado)
// v3.0 — Interface Gemini-style: input central, contexto persistente, roteamento automático
import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send, Paperclip, FlaskConical, Zap, Sparkles, Loader, Download,
  Printer, BookOpen, ChevronRight, Brain, Coins, X, CheckCircle,
  FileText, Image as ImageIcon, User as UserIcon, Bot, Bookmark,
  Trash2, BookMarked, ExternalLink,
} from 'lucide-react';
import { User, Student } from '../types';
import { AIService, friendlyAIError, modelGeneratesImage, getModelsForContext, getModelConfig } from '../services/aiService';
import { AI_CREDIT_COSTS, INCLUILAB_MODEL_COSTS, CREDIT_INSUFFICIENT_MSG } from '../config/aiCosts';
import { StudentContextService } from '../services/studentContextService';
import { GeneratedActivityService } from '../services/persistenceService';
import { WorkflowCanvas as AtivaIACanvas } from '../components/ativaIA/WorkflowCanvas';

// ─── Paleta ───────────────────────────────────────────────────────────────────
const C = {
  petrol:  '#1F4E5F',
  dark:    '#2E3A59',
  gold:    '#C69214',
  bg:      '#F6F4EF',
  surface: '#FFFFFF',
  border:  '#E7E2D8',
  sec:     '#667085',
  light:   '#F0F7FA',
  orange:  '#EA580C',
};

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface AttachedFile {
  name:      string;
  type:      string;   // MIME
  base64:    string;
  previewUrl?: string; // para imagens
}

interface ActionButton {
  label:   string;
  variant: 'primary' | 'ghost';
  payload: Record<string, any>;
}

interface ChatMessage {
  id:              string;
  role:            'user' | 'assistant';
  text:            string;
  file?:           AttachedFile;
  result?:         string;   // markdown gerado
  resultImageUrl?: string;
  actionButtons?:  ActionButton[];
  creditsUsed?:    number;
  savedId?:        string;   // ID em generated_activities após salvar
  timestamp:       Date;
}

type ActivityModelId = 'texto_apenas' | 'nano_banana_pro' | 'chatgpt_imagem';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function exportAsDoc(content: string, filename: string) {
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
    xmlns:w='urn:schemas-microsoft-com:office:word'
    xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'/><title>${filename}</title></head>
    <body><pre style="font-family:Arial,sans-serif;font-size:12pt;line-height:1.6">
    ${content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
    </pre></body></html>`;
  const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function printMarkdown(content: string, title: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
  <style>body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.6;padding:40px;max-width:800px;margin:0 auto}
  h1,h2,h3{color:#1F4E5F}pre{white-space:pre-wrap}@media print{body{padding:20px}}</style></head>
  <body><pre>${content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
  <script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
  win.document.close();
}

async function persistImageToStorage(urlOrBase64: string, tenantId: string): Promise<string | null> {
  try {
    const { supabase } = await import('../services/supabase');
    let blob: Blob;
    if (urlOrBase64.startsWith('data:')) {
      const [header, data] = urlOrBase64.split(',');
      const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/png';
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      blob = new Blob([bytes], { type: mime });
    } else {
      const resp = await fetch(urlOrBase64);
      if (!resp.ok) return null;
      blob = await resp.blob();
    }
    const ext = blob.type.includes('png') ? 'png' : 'jpg';
    const path = `${tenantId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('imagens_atividades')
      .upload(path, blob, { cacheControl: '31536000', upsert: false });
    if (error) return null;
    const { data } = supabase.storage.from('imagens_atividades').getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch { return null; }
}

async function safeDeductCredits(user: User, action: string, cost: number) {
  await (AIService as any).deductCredits(user, action, cost);
  window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: user.id } }));
}

// ─── Prompts de geração ───────────────────────────────────────────────────────
function buildAdaptPrompt(adaptType: string, studentCtx: string, originalText: string): string {
  const sb = studentCtx
    ? `\n\n${studentCtx}\n\nIMPORTANTE: Adapte especificamente para este aluno.`
    : '';
  return `Você é especialista em educação inclusiva. Adapte o material abaixo para alunos com ${adaptType}.${sb}

Regras:
- Simplifique sem perder o objetivo pedagógico
- Divida instruções em passos numerados curtos
- Para TEA: linguagem literal, sem ambiguidade, estrutura clara
- Para TDAH: instruções curtas, destaque o essencial
- Para Dislexia: frases curtas, vocabulário simples
- Para DI: linguagem concreta e contextualizada

Material original:
${originalText}

Retorne a versão adaptada em Markdown formatado, com:
# Título da Atividade Adaptada
## Objetivo
## Materiais Necessários (se aplicável)
## Passo a Passo
## Dica para o Professor`;
}

function buildFileAdaptPrompt(adaptType: string, studentCtx: string): string {
  const sb = studentCtx
    ? `\n\n${studentCtx}\n\nIMPORTANTE: Adapte especificamente para este aluno.`
    : '';
  return `Você é especialista em educação inclusiva. Analise o conteúdo desta atividade (extraia o texto da imagem/PDF) e crie uma versão adaptada para alunos com ${adaptType}.${sb}

Regras:
- Extraia o texto do material e adapte completamente
- Simplifique sem perder o objetivo pedagógico
- Divida instruções em passos numerados curtos

Retorne em Markdown formatado:
# Título da Atividade Adaptada
## Objetivo
## Materiais Necessários (se aplicável)
## Passo a Passo
## Dica para o Professor`;
}

function buildActivityFromTopicPrompt(topic: string, studentCtx: string): string {
  const sb = studentCtx
    ? `\n\n${studentCtx}\n\nIMPORTANTE: Crie especificamente para este aluno.`
    : '';
  return `Você é especialista em educação inclusiva e criação de atividades pedagógicas.${sb}

Crie uma atividade pedagógica inclusiva sobre o tema: "${topic}"

A atividade deve:
- Ser acessível e inclusiva desde o princípio
- Ter objetivo claro e alinhado à BNCC
- Incluir instruções em passos curtos e claros
- Ser adaptável a diferentes níveis de suporte

Retorne em Markdown formatado:
# Título da Atividade
**Tema:** ${topic}
**Nível:** [Educação Infantil / Anos Iniciais / Anos Finais]

## Objetivo de Aprendizagem

## Materiais Necessários

## Desenvolvimento (Passo a Passo)

## Adaptações Inclusivas

## Avaliação / Registro

## Dica para o Professor`;
}

// ─── Componente: Bolha de Chat ─────────────────────────────────────────────────
const ChatBubble: React.FC<{
  msg:         ChatMessage;
  studentName: string;
  onConfirm:   (payload: Record<string, any>) => void;
  onViewResult:(msg: ChatMessage) => void;
  isLatest:    boolean;
}> = ({ msg, studentName, onConfirm, onViewResult, isLatest }) => {
  const isUser = msg.role === 'user';

  return (
    <div style={{
      display: 'flex', gap: 10, marginBottom: 16,
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
    }}>
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: isUser ? C.dark : C.petrol,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isUser
          ? <UserIcon size={15} color="#fff" />
          : <Bot size={15} color="#fff" />
        }
      </div>

      {/* Balão */}
      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        {/* File preview */}
        {msg.file && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 12,
            background: isUser ? '#E8F0F7' : C.light,
            border: `1px solid ${C.border}`, maxWidth: 240,
          }}>
            {msg.file.type.startsWith('image/') && msg.file.previewUrl
              ? <img src={msg.file.previewUrl} alt="preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} />
              : <FileText size={20} color={C.petrol} />
            }
            <span style={{ fontSize: 12, color: C.dark, fontWeight: 600, wordBreak: 'break-all' }}>
              {msg.file.name}
            </span>
          </div>
        )}

        {/* Texto */}
        <div style={{
          padding: '10px 14px', borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
          background: isUser ? C.dark : C.surface,
          color: isUser ? '#fff' : C.dark,
          border: isUser ? 'none' : `1px solid ${C.border}`,
          fontSize: 14, lineHeight: 1.55,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          {msg.text}
        </div>

        {/* Botões de ação (roteamento automático) */}
        {msg.actionButtons && msg.actionButtons.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
            {msg.actionButtons.map((btn, i) => (
              <button key={i} onClick={() => onConfirm(btn.payload)} style={{
                padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', border: 'none', outline: 'none',
                background: btn.variant === 'primary' ? C.petrol : 'transparent',
                color: btn.variant === 'primary' ? '#fff' : C.sec,
                border: btn.variant === 'ghost' ? `1px solid ${C.border}` : 'none',
                transition: 'opacity 0.15s',
              }}>
                {btn.label}
              </button>
            ))}
          </div>
        )}

        {/* Resultado gerado — preview compacto */}
        {msg.result && (
          <div style={{
            padding: '10px 14px', borderRadius: 12,
            background: '#F0F9F4', border: '1px solid #BBF7D0',
            fontSize: 12, color: '#166534', maxWidth: '100%',
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          }} onClick={() => onViewResult(msg)}>
            <CheckCircle size={14} color="#16A34A" />
            <span style={{ fontWeight: 600 }}>Atividade gerada</span>
            {msg.creditsUsed !== undefined && (
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, color: C.gold, fontWeight: 700 }}>
                <Coins size={10} /> {msg.creditsUsed} cr
              </span>
            )}
            <ChevronRight size={13} color="#16A34A" style={{ marginLeft: 'auto' }} />
          </div>
        )}

        {/* Timestamp */}
        <span style={{ fontSize: 10, color: C.sec, paddingInline: 2 }}>
          {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          {msg.savedId && <span style={{ marginLeft: 6, color: '#16A34A', fontWeight: 600 }}>· salvo</span>}
        </span>
      </div>
    </div>
  );
};

// ─── Componente: Painel A4 ────────────────────────────────────────────────────
const A4Preview: React.FC<{
  content:      string;
  imageUrl?:    string;
  title:        string;
  onSave:       () => void;
  saving:       boolean;
  saved:        boolean;
  onExportDoc:  () => void;
  onPrint:      () => void;
}> = ({ content, imageUrl, title, onSave, saving, saved, onExportDoc, onPrint }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    {/* Toolbar */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
      borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0,
    }}>
      <FileText size={14} color={C.petrol} />
      <span style={{ fontSize: 12, fontWeight: 700, color: C.dark, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title || 'Atividade Gerada'}
      </span>
      <button onClick={onExportDoc} title="Baixar .doc" style={{ ...btnStyle, padding: '5px 8px' }}>
        <Download size={13} />
      </button>
      <button onClick={onPrint} title="Imprimir" style={{ ...btnStyle, padding: '5px 8px' }}>
        <Printer size={13} />
      </button>
      <button onClick={onSave} disabled={saving || saved} style={{
        ...btnStyle, padding: '5px 12px', fontSize: 12, fontWeight: 700, gap: 5,
        background: saved ? '#DCFCE7' : C.petrol,
        color: saved ? '#16A34A' : '#fff',
        border: saved ? '1px solid #BBF7D0' : 'none',
        opacity: saving ? 0.7 : 1,
      }}>
        {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Bookmark size={12} />}
        {saved ? 'Salvo!' : 'Salvar'}
      </button>
    </div>

    {/* A4 content */}
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', background: C.bg }}>
      <div style={{
        background: '#fff', borderRadius: 8, padding: '32px 28px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)', minHeight: 640,
        maxWidth: 640, margin: '0 auto',
        fontFamily: 'Georgia, serif', fontSize: 13, lineHeight: 1.7, color: '#1a1a1a',
      }}>
        {imageUrl && (
          <img src={imageUrl} alt="ilustração" style={{ width: '100%', borderRadius: 8, marginBottom: 20, objectFit: 'contain', maxHeight: 260 }} />
        )}
        <div className="prose" style={{ maxWidth: '100%' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>

    <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
  </div>
);

const btnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
  background: C.surface, cursor: 'pointer', fontSize: 12, color: C.dark,
  fontWeight: 500, outline: 'none',
};

// ─── Componente: Biblioteca de Atividades ─────────────────────────────────────
const Library: React.FC<{
  activities:    any[];
  loading:       boolean;
  onSelect:      (act: any) => void;
  onDelete:      (id: string) => void;
  selectedId?:   string;
}> = ({ activities, loading, onSelect, onDelete, selectedId }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: C.petrol, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>
        Biblioteca Pessoal
      </p>
    </div>
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
          <Loader size={18} color={C.sec} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      )}
      {!loading && activities.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: C.sec, fontSize: 13 }}>
          <BookMarked size={28} color={C.border} style={{ margin: '0 auto 8px' }} />
          <p style={{ margin: 0 }}>Nenhuma atividade salva ainda.</p>
          <p style={{ margin: '4px 0 0', fontSize: 11 }}>Gere e salve atividades para criar sua biblioteca.</p>
        </div>
      )}
      {activities.map(act => (
        <div key={act.id} onClick={() => onSelect(act)} style={{
          padding: '12px 14px', borderBottom: `1px solid ${C.border}`,
          cursor: 'pointer', transition: 'background 0.12s',
          background: selectedId === act.id ? C.light : 'transparent',
        }}
          onMouseEnter={e => { if (selectedId !== act.id) (e.currentTarget as HTMLElement).style.background = '#FAFAF8'; }}
          onMouseLeave={e => { if (selectedId !== act.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <BookOpen size={14} color={C.petrol} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.dark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {act.title || 'Atividade sem título'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 10, color: C.sec }}>
                {act.is_adapted ? '📎 Adaptada' : '✨ Criada'} · {new Date(act.created_at).toLocaleDateString('pt-BR')}
                {act.tags?.length ? ` · ${act.tags.slice(0,2).join(', ')}` : ''}
              </p>
            </div>
            <button onClick={e => { e.stopPropagation(); onDelete(act.id); }} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              borderRadius: 6, color: '#ccc', flexShrink: 0,
            }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#ccc'}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
    <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
  </div>
);

// ─── Componente: StudentSelector ──────────────────────────────────────────────
const StudentSelector: React.FC<{
  students:   Student[];
  selectedId: string;
  onChange:   (id: string, ctx: string, name: string) => void;
}> = ({ students, selectedId, onChange }) => {
  const [fetching, setFetching] = useState(false);

  const handleChange = async (id: string) => {
    if (!id) { onChange('', '', ''); return; }
    const student = students.find(s => s.id === id);
    if (!student) { onChange(id, '', ''); return; }

    let ctxText = [`Aluno: ${student.name}`];
    if ((student as any).grade) ctxText.push(`Ano/Série: ${(student as any).grade}`);
    if (student.diagnosis?.length) ctxText.push(`Diagnóstico(s): ${student.diagnosis.join(', ')}`);
    if (student.supportLevel)      ctxText.push(`Nível de suporte: ${student.supportLevel}`);
    if (student.difficulties?.length) ctxText.push(`Principais dificuldades: ${student.difficulties.join('; ')}`);
    if (student.strategies?.length)   ctxText.push(`Estratégias PEI/PDI: ${student.strategies.join('; ')}`);
    if (student.abilities?.length)    ctxText.push(`Habilidades preservadas: ${student.abilities.join('; ')}`);
    let ctx = ctxText.join('\n');

    try {
      setFetching(true);
      const full = await StudentContextService.buildContext(id);
      if (StudentContextService.hasData(full)) ctx = StudentContextService.toPromptText(full);
    } catch { /* usa básico */ } finally { setFetching(false); }

    onChange(id, ctx, student.name);
  };

  const selected = students.find(s => s.id === selectedId);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <UserIcon size={14} color={C.petrol} />
      <select
        value={selectedId}
        onChange={e => handleChange(e.target.value)}
        disabled={fetching}
        style={{
          padding: '6px 28px 6px 10px', borderRadius: 20, fontSize: 13,
          border: `1.5px solid ${selectedId ? C.petrol : C.border}`,
          background: selectedId ? C.light : C.surface,
          color: selectedId ? C.petrol : C.sec,
          fontWeight: selectedId ? 600 : 400,
          outline: 'none', cursor: 'pointer', appearance: 'none',
          backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%231F4E5F\' stroke-width=\'1.5\' fill=\'none\'/%3E%3C/svg%3E")',
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
        }}
      >
        <option value="">Sem aluno específico</option>
        {students.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}{s.diagnosis?.length ? ` · ${s.diagnosis[0]}` : ''}
          </option>
        ))}
      </select>
      {fetching && <Loader size={12} color={C.sec} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
      {selected && !fetching && (
        <span style={{ fontSize: 10, color: '#16A34A', fontWeight: 600, whiteSpace: 'nowrap' }}>
          ✓ prontuário carregado
        </span>
      )}
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
};

// ─── Props do IncluiLabView ───────────────────────────────────────────────────
interface IncluiLabViewProps {
  user:                   User;
  students:               Student[];
  defaultTab?:            string;
  sidebarOpen?:           boolean;
  onWorkflowNodesChange?: (nodeIds: string[]) => void;
  creditsAvailable?:      number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export const IncluiLabView: React.FC<IncluiLabViewProps> = ({
  user, students, defaultTab, sidebarOpen = true, onWorkflowNodesChange, creditsAvailable,
}) => {
  // ── Estado: workflow canvas ──────────────────────────────────────────────────
  const [showWorkflow, setShowWorkflow] = useState(defaultTab === 'workflow');

  // ── Estado: chat ─────────────────────────────────────────────────────────────
  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [inputText,   setInputText]   = useState('');
  const [pendingFile, setPendingFile] = useState<AttachedFile | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // ── Estado: aluno selecionado ─────────────────────────────────────────────────
  const [studentId,   setStudentId]   = useState('');
  const [studentCtx,  setStudentCtx]  = useState('');
  const [studentName, setStudentName] = useState('');

  // ── Estado: painel direito ───────────────────────────────────────────────────
  const [rightTab,    setRightTab]    = useState<'preview' | 'library'>('preview');
  const [previewMsg,  setPreviewMsg]  = useState<ChatMessage | null>(null);  // msg cujo result está em foco
  const [savingId,    setSavingId]    = useState<string | null>(null);        // msgId sendo salvo

  // ── Estado: biblioteca ────────────────────────────────────────────────────────
  const [library,      setLibrary]      = useState<any[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySelId,   setLibrarySelId]   = useState<string | null>(null);

  // Modelo de geração
  const [modelId, setModelId] = useState<ActivityModelId>('texto_apenas');

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef  = useRef<HTMLTextAreaElement>(null);

  // ── Scroll to bottom ──────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Carrega biblioteca ao montar ──────────────────────────────────────────────
  useEffect(() => {
    loadLibrary();
  }, []);

  async function loadLibrary() {
    setLibraryLoading(true);
    try {
      const acts = await GeneratedActivityService.getForTenant(user.id);
      setLibrary(acts || []);
    } catch { /* silencioso */ } finally {
      setLibraryLoading(false);
    }
  }

  // ── Mensagem de boas-vindas ───────────────────────────────────────────────────
  useEffect(() => {
    const welcome: ChatMessage = {
      id: uid(), role: 'assistant', timestamp: new Date(),
      text: `Olá! Sou sua Central de Inteligência Inclusiva. 🧠\n\nPosso ajudar você a:\n• **Adaptar materiais** — envie uma foto, PDF ou Word de qualquer atividade\n• **Criar atividades do zero** — descreva o tema e eu gero o material completo\n• **Redesenhar textos** — cole qualquer texto para torná-lo mais acessível\n\nSelecione um aluno no topo para personalizar tudo automaticamente.`,
    };
    setMessages([welcome]);
  }, []);

  // ── Selecionar aluno ──────────────────────────────────────────────────────────
  const handleStudentChange = useCallback((id: string, ctx: string, name: string) => {
    setStudentId(id);
    setStudentCtx(ctx);
    setStudentName(name);
    if (id) {
      addAssistantMsg(`Contexto de **${name}** carregado. Enviarei o prontuário completo em cada solicitação automaticamente.`);
    }
  }, []);

  // ── Helpers de mensagens ──────────────────────────────────────────────────────
  function addAssistantMsg(text: string, extra?: Partial<ChatMessage>) {
    setMessages(prev => [...prev, { id: uid(), role: 'assistant', text, timestamp: new Date(), ...extra }]);
  }

  function updateMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  }

  // ── Anexar arquivo ────────────────────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    const previewUrl = file.type.startsWith('image/') ? base64 : undefined;
    setPendingFile({ name: file.name, type: file.type, base64, previewUrl });
    e.target.value = '';
  };

  // ── Enviar mensagem ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text   = inputText.trim();
    const file   = pendingFile;
    if (!text && !file) return;
    if (isGenerating) return;

    // Mensagem do usuário
    const userMsgId = uid();
    const userMsg: ChatMessage = {
      id: userMsgId, role: 'user', timestamp: new Date(),
      text: text || (file ? `Enviei: ${file.name}` : ''),
      file: file ?? undefined,
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setPendingFile(null);

    // ── Roteamento ──────────────────────────────────────────────────────────────
    if (file) {
      // Arquivo → pergunta de confirmação
      const studentLabel = studentName ? `para **${studentName}**` : 'para inclusão geral';
      const asstMsgId = uid();
      const asstMsg: ChatMessage = {
        id: asstMsgId, role: 'assistant', timestamp: new Date(),
        text: `Recebi **${file.name}**.\n\nDeseja adaptar este material ${studentLabel}?`,
        actionButtons: [
          { label: 'Sim, adaptar agora', variant: 'primary', payload: { action: 'adapt_file', fileBase64: file.base64, fileName: file.name, fileType: file.type, studentCtx, studentName, triggerMsgId: asstMsgId } },
          { label: 'Cancelar', variant: 'ghost', payload: { action: 'cancel', triggerMsgId: asstMsgId } },
        ],
      };
      setMessages(prev => [...prev, asstMsg]);
    } else if (text) {
      // Texto → gera atividade do tema
      await generateActivityFromTopic(text);
    }
  };

  // ── Confirmar ação dos botões ────────────────────────────────────────────────
  const handleConfirm = async (payload: Record<string, any>) => {
    const { action, triggerMsgId } = payload;

    // Remove os botões da mensagem gatilho para evitar re-clique
    if (triggerMsgId) {
      setMessages(prev => prev.map(m => m.id === triggerMsgId ? { ...m, actionButtons: [] } : m));
    }

    if (action === 'cancel') {
      addAssistantMsg('Tudo bem! Pode enviar outro arquivo ou digitar um tema para criar uma atividade nova.');
      return;
    }

    if (action === 'adapt_file') {
      await adaptFile(payload.fileBase64, payload.fileName, payload.fileType, payload.studentCtx ?? studentCtx, payload.studentName ?? studentName);
    }

    if (action === 'adapt_text') {
      await adaptText(payload.text, payload.studentCtx ?? studentCtx, payload.studentName ?? studentName);
    }
  };

  // ── Adaptar arquivo (EduLensIA) ───────────────────────────────────────────────
  async function adaptFile(base64: string, fileName: string, fileType: string, ctx: string, sName: string) {
    const OCR_COST  = AI_CREDIT_COSTS.OCR ?? 1;
    const TEXT_COST = INCLUILAB_MODEL_COSTS.TEXT ?? 3;
    const totalCost = OCR_COST + TEXT_COST;

    const hasCredits = creditsAvailable !== undefined
      ? creditsAvailable >= totalCost
      : await AIService.checkCredits(user, totalCost);
    if (!hasCredits) { addAssistantMsg(`⚠️ ${CREDIT_INSUFFICIENT_MSG}`); return; }

    setIsGenerating(true);
    const thinkingId = uid();
    setMessages(prev => [...prev, { id: thinkingId, role: 'assistant', timestamp: new Date(), text: '⌛ Analisando o material e gerando a adaptação...' }]);

    try {
      const adaptType = ctx.includes('autismo') || ctx.includes('TEA') ? 'Autismo (TEA)'
                      : ctx.includes('TDAH') ? 'TDAH'
                      : ctx.includes('dislexia') ? 'Dislexia'
                      : ctx.includes('Intelectual') ? 'Deficiência Intelectual'
                      : 'necessidades de inclusão geral';

      const prompt = buildFileAdaptPrompt(adaptType, ctx);
      const raw = await AIService.generateFromPromptWithImage(prompt, base64, user);

      await safeDeductCredits(user, `INCLUILAB_ADAPT_FILE:${modelId}`, totalCost);

      const resultMsg: Partial<ChatMessage> = {
        text: `✅ Material adaptado para **${sName || 'inclusão geral'}** com sucesso!`,
        result: raw, creditsUsed: totalCost,
      };
      setMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, ...resultMsg } : m));
      setPreviewMsg({ id: thinkingId, role: 'assistant', timestamp: new Date(), text: '', ...resultMsg } as ChatMessage);
      setRightTab('preview');
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, text: `❌ Erro: ${friendlyAIError(err)}` } : m));
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Adaptar texto ─────────────────────────────────────────────────────────────
  async function adaptText(text: string, ctx: string, sName: string) {
    const TEXT_COST = INCLUILAB_MODEL_COSTS.TEXT ?? 3;

    const hasCredits = creditsAvailable !== undefined
      ? creditsAvailable >= TEXT_COST
      : await AIService.checkCredits(user, TEXT_COST);
    if (!hasCredits) { addAssistantMsg(`⚠️ ${CREDIT_INSUFFICIENT_MSG}`); return; }

    setIsGenerating(true);
    const thinkingId = uid();
    setMessages(prev => [...prev, { id: thinkingId, role: 'assistant', timestamp: new Date(), text: '⌛ Redesenhando o texto de forma inclusiva...' }]);

    try {
      const adaptType = 'inclusão geral';
      const prompt = buildAdaptPrompt(adaptType, ctx, text);
      const raw = await AIService.generateFromPromptWithImage(prompt, '', user);

      await safeDeductCredits(user, `INCLUILAB_ADAPT_TEXT`, TEXT_COST);

      const resultMsg: Partial<ChatMessage> = {
        text: `✅ Texto redesenhado${sName ? ` para **${sName}**` : ''}!`,
        result: raw, creditsUsed: TEXT_COST,
      };
      setMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, ...resultMsg } : m));
      setPreviewMsg({ id: thinkingId, role: 'assistant', timestamp: new Date(), text: '', ...resultMsg } as ChatMessage);
      setRightTab('preview');
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, text: `❌ Erro: ${friendlyAIError(err)}` } : m));
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Criar atividade a partir de tema ─────────────────────────────────────────
  async function generateActivityFromTopic(topic: string) {
    const TEXT_COST = INCLUILAB_MODEL_COSTS.TEXT ?? 3;

    const hasCredits = creditsAvailable !== undefined
      ? creditsAvailable >= TEXT_COST
      : await AIService.checkCredits(user, TEXT_COST);
    if (!hasCredits) { addAssistantMsg(`⚠️ ${CREDIT_INSUFFICIENT_MSG}`); return; }

    setIsGenerating(true);
    const thinkingId = uid();
    setMessages(prev => [...prev, { id: thinkingId, role: 'assistant', timestamp: new Date(), text: `⌛ Criando atividade inclusiva sobre "${topic}"...` }]);

    try {
      const prompt = buildActivityFromTopicPrompt(topic, studentCtx);
      const raw = await AIService.generateFromPromptWithImage(prompt, '', user);

      await safeDeductCredits(user, `INCLUILAB_CREATE:${modelId}`, TEXT_COST);

      const resultMsg: Partial<ChatMessage> = {
        text: `✅ Atividade sobre **"${topic}"** criada${studentName ? ` para **${studentName}**` : ''}!`,
        result: raw, creditsUsed: TEXT_COST,
      };
      setMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, ...resultMsg } : m));
      const fullMsg = { id: thinkingId, role: 'assistant' as const, timestamp: new Date(), text: '', ...resultMsg } as ChatMessage;
      setPreviewMsg(fullMsg);
      setRightTab('preview');
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, text: `❌ Erro: ${friendlyAIError(err)}` } : m));
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Salvar atividade na biblioteca ────────────────────────────────────────────
  const handleSave = async () => {
    if (!previewMsg?.result) return;
    setSavingId(previewMsg.id);
    try {
      const lines   = previewMsg.result.split('\n');
      const titleLine = lines.find(l => l.startsWith('#'));
      const title  = titleLine ? titleLine.replace(/^#+\s*/, '') : 'Atividade IncluiLAB';
      const id = await GeneratedActivityService.save({
        tenantId:   (user as any).tenant_id ?? user.id,
        userId:     user.id,
        studentId:  studentId || undefined,
        title,
        content:    previewMsg.result,
        imageUrl:   previewMsg.resultImageUrl,
        isAdapted:  !!previewMsg.file,
        creditsUsed: previewMsg.creditsUsed ?? 0,
        modelUsed:  modelId,
        outputType: modelId === 'texto_apenas' ? 'text' : 'text_image',
        tags:       studentName ? [studentName] : [],
      });
      if (id) {
        updateMessage(previewMsg.id, { savedId: id });
        setPreviewMsg(prev => prev ? { ...prev, savedId: id } : prev);
        await loadLibrary();
      }
    } catch (e: any) {
      console.error('[IncluiLAB] Erro ao salvar:', e?.message);
    } finally {
      setSavingId(null);
    }
  };

  // ── Deletar da biblioteca ─────────────────────────────────────────────────────
  const handleDeleteLib = async (id: string) => {
    if (!window.confirm('Remover esta atividade da biblioteca?')) return;
    await GeneratedActivityService.delete(id);
    setLibrary(prev => prev.filter(a => a.id !== id));
    if (librarySelId === id) { setLibrarySelId(null); }
  };

  // ── Selecionar da biblioteca ───────────────────────────────────────────────────
  const handleLibSelect = (act: any) => {
    setLibrarySelId(act.id);
    const fakeMsg: ChatMessage = {
      id:              act.id,
      role:            'assistant',
      text:            act.title,
      result:          act.content,
      resultImageUrl:  act.image_url,
      creditsUsed:     act.credits_used,
      savedId:         act.id,
      timestamp:       new Date(act.created_at),
    };
    setPreviewMsg(fakeMsg);
    setRightTab('preview');
  };

  // ── Keyboard shortcut (Enter) ─────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Resize textarea ───────────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  // ── Sugestões rápidas ─────────────────────────────────────────────────────────
  const suggestions = [
    'Atividade de frações para Anos Iniciais',
    'Leitura e interpretação sobre animais',
    'Matemática lúdica com material concreto',
    'Produção de texto com apoio visual',
  ];

  // ── AtivaIA canvas (modo especial) ────────────────────────────────────────────
  if (showWorkflow) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
          background: C.surface, borderBottom: `1px solid ${C.border}`,
        }}>
          <button onClick={() => setShowWorkflow(false)} style={{ ...btnStyle, gap: 6 }}>
            ← Voltar ao Chat
          </button>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: C.petrol, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={16} color="#fff" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.dark }}>AtivaIA</p>
            <p style={{ margin: 0, fontSize: 11, color: C.petrol }}>Canvas de Atividades com React Flow</p>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <AtivaIACanvas user={user} students={students as any} sidebarOpen={sidebarOpen} onWorkflowNodesChange={onWorkflowNodesChange} />
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LAYOUT PRINCIPAL: Chat (esquerda) + Painel (direita)
  // ─────────────────────────────────────────────────────────────────────────────
  const previewContent  = previewMsg?.result ?? '';
  const previewImageUrl = previewMsg?.resultImageUrl;
  const previewTitle    = (() => {
    if (!previewContent) return '';
    const line = previewContent.split('\n').find(l => l.startsWith('#'));
    return line ? line.replace(/^#+\s*/, '') : 'Atividade Gerada';
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        flexWrap: 'wrap', gap: 10,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: C.petrol, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brain size={17} color="#fff" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.dark, lineHeight: 1 }}>IncluiLAB</p>
            <p style={{ margin: 0, fontSize: 10, color: C.petrol, lineHeight: 1.2 }}>Central de Inteligência</p>
          </div>
        </div>

        {/* Divisor */}
        <div style={{ width: 1, height: 28, background: C.border, flexShrink: 0, display: window.innerWidth < 640 ? 'none' : 'block' }} />

        {/* Seletor de aluno */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <StudentSelector students={students} selectedId={studentId} onChange={handleStudentChange} />
        </div>

        {/* AtivaIA button */}
        <button onClick={() => setShowWorkflow(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
          background: C.bg, border: `1.5px solid ${C.border}`, cursor: 'pointer',
          color: C.dark, flexShrink: 0,
        }}>
          <Zap size={13} color={C.petrol} /> AtivaIA
        </button>
      </div>

      {/* ── Body: Chat + Painel ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Coluna Esquerda: Chat ────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: `1px solid ${C.border}` }}>

          {/* Mensagens */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
            {messages.map((msg, i) => (
              <ChatBubble
                key={msg.id}
                msg={msg}
                studentName={studentName}
                onConfirm={handleConfirm}
                onViewResult={m => { setPreviewMsg(m); setRightTab('preview'); }}
                isLatest={i === messages.length - 1}
              />
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Sugestões (se conversa vazia) */}
          {messages.length <= 1 && (
            <div style={{ padding: '0 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {suggestions.map(s => (
                <button key={s} onClick={() => { setInputText(s); textAreaRef.current?.focus(); }} style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                  background: C.surface, border: `1px solid ${C.border}`,
                  color: C.dark, cursor: 'pointer',
                }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Preview do arquivo pendente */}
          {pendingFile && (
            <div style={{
              margin: '0 16px 8px', padding: '8px 12px', borderRadius: 12,
              background: C.light, border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              {pendingFile.type.startsWith('image/') && pendingFile.previewUrl
                ? <img src={pendingFile.previewUrl} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} />
                : <FileText size={18} color={C.petrol} />
              }
              <span style={{ fontSize: 12, fontWeight: 600, color: C.dark, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pendingFile.name}
              </span>
              <button onClick={() => setPendingFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sec, padding: 2 }}>
                <X size={14} />
              </button>
            </div>
          )}

          {/* Input bar */}
          <div style={{
            padding: '10px 16px 14px', background: C.surface,
            borderTop: `1px solid ${C.border}`, flexShrink: 0,
          }}>
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 8,
              border: `1.5px solid ${isGenerating ? C.border : C.petrol}`,
              borderRadius: 20, padding: '8px 10px',
              background: C.surface, transition: 'border-color 0.2s',
            }}>
              {/* Attach */}
              <button onClick={() => fileInputRef.current?.click()} title="Anexar arquivo" style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.sec, padding: '2px 4px', flexShrink: 0, borderRadius: 8,
                transition: 'color 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = C.petrol}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = C.sec}
              >
                <Paperclip size={18} />
              </button>

              {/* Textarea */}
              <textarea
                ref={textAreaRef}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={isGenerating ? 'Aguarde…' : 'Descreva o tema ou envie um arquivo…'}
                disabled={isGenerating}
                rows={1}
                style={{
                  flex: 1, border: 'none', outline: 'none', resize: 'none',
                  fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit',
                  background: 'transparent', color: C.dark,
                  minHeight: 24, maxHeight: 120,
                }}
              />

              {/* Send */}
              <button
                onClick={handleSend}
                disabled={isGenerating || (!inputText.trim() && !pendingFile)}
                style={{
                  width: 34, height: 34, borderRadius: '50%', border: 'none',
                  background: (isGenerating || (!inputText.trim() && !pendingFile)) ? C.border : C.petrol,
                  cursor: (isGenerating || (!inputText.trim() && !pendingFile)) ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'background 0.15s',
                }}
              >
                {isGenerating
                  ? <Loader size={15} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                  : <Send size={15} color="#fff" />
                }
              </button>
            </div>

            <p style={{ fontSize: 10, color: C.sec, margin: '6px 0 0', textAlign: 'center' }}>
              Enter para enviar · Shift+Enter para nova linha · Aceita PDF, PNG, JPG, DOCX
            </p>
          </div>

          {/* Input file oculto */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.doc"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>

        {/* ── Painel Direito ────────────────────────────────────────────────────── */}
        <div style={{ width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column', background: C.surface }}>

          {/* Tabs do painel */}
          <div style={{
            display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
          }}>
            {([
              { key: 'preview', label: 'Visualização A4', icon: FileText },
              { key: 'library', label: `Biblioteca (${library.length})`, icon: BookMarked },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setRightTab(key)} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '11px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: 'none', borderBottom: rightTab === key ? `2px solid ${C.petrol}` : '2px solid transparent',
                background: 'transparent', color: rightTab === key ? C.petrol : C.sec,
                transition: 'all 0.15s',
              }}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          {/* Conteúdo do painel */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {rightTab === 'preview' ? (
              previewContent ? (
                <A4Preview
                  content={previewContent}
                  imageUrl={previewImageUrl}
                  title={previewTitle}
                  onSave={handleSave}
                  saving={savingId === previewMsg?.id}
                  saved={!!previewMsg?.savedId}
                  onExportDoc={() => exportAsDoc(previewContent, `${previewTitle}.doc`)}
                  onPrint={() => printMarkdown(previewContent, previewTitle)}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.sec, padding: 32, textAlign: 'center' }}>
                  <Sparkles size={36} color={C.border} style={{ marginBottom: 12 }} />
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.dark }}>Folha A4 pronta</p>
                  <p style={{ margin: '6px 0 0', fontSize: 12 }}>Gere uma atividade para visualizá-la aqui. As adaptações aparecem em formato de folha imprimível.</p>
                </div>
              )
            ) : (
              <Library
                activities={library}
                loading={libraryLoading}
                onSelect={handleLibSelect}
                onDelete={handleDeleteLib}
                selectedId={librarySelId ?? undefined}
              />
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
};

export default IncluiLabView;
