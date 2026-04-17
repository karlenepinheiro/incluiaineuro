// IncluiLabView.tsx — Laboratório de Adaptações IncluiAI
// v4.0 — Interface assistente simples: prompt → resultado pronto
// 3 modos: Atividade completa | Gerar como imagem A4 | Adaptar imagem enviada

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send, Paperclip, Zap, Sparkles, Loader, Download,
  Printer, BookOpen, ChevronRight, Brain, Coins, X, CheckCircle,
  FileText, Image as ImageIcon, User as UserIcon, Bot, Bookmark,
  Trash2, BookMarked, FileImage, Type,
} from 'lucide-react';
import { User, Student } from '../types';
import { AIService, friendlyAIError } from '../services/aiService';
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
};

// ─── Modos de geração ─────────────────────────────────────────────────────────
type GenerationMode = 'texto' | 'imagem' | 'adaptar';

const MODES: { id: GenerationMode; label: string; desc: string; cost: number }[] = [
  { id: 'texto',   label: 'Atividade completa',    desc: 'Texto formatado + exportar',  cost: INCLUILAB_MODEL_COSTS.TEXT },
  { id: 'imagem',  label: 'Gerar como imagem',     desc: 'PNG A4 pronto para imprimir', cost: INCLUILAB_MODEL_COSTS.GPT_IMAGE },
  { id: 'adaptar', label: 'Adaptar imagem enviada', desc: 'Envie uma imagem → adaptação visual', cost: INCLUILAB_MODEL_COSTS.TEXT + INCLUILAB_MODEL_COSTS.GPT_IMAGE },
];

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface AttachedFile {
  name:       string;
  type:       string;
  base64:     string;
  previewUrl?: string;
}

interface ChatMessage {
  id:             string;
  role:           'user' | 'assistant';
  text:           string;
  file?:          AttachedFile;
  result?:        string;         // markdown (modo texto)
  resultImageUrl?: string;        // data URL PNG (modo imagem/adaptar)
  creditsUsed?:   number;
  savedId?:       string;
  timestamp:      Date;
}

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

function downloadImage(dataUrl: string, filename = 'atividade.png') {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

async function safeDeductCredits(user: User, action: string, cost: number) {
  await (AIService as any).deductCredits(user, action, cost);
  window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: user.id } }));
}

// ─── Prompts ──────────────────────────────────────────────────────────────────
function buildActivityPrompt(topic: string, studentCtx: string): string {
  const sb = studentCtx
    ? `\n\n${studentCtx}\n\nIMPORTANTE: Crie especificamente para este aluno.`
    : '';

  return `Você é especialista em educação inclusiva e criação de atividades pedagógicas.${sb}

Crie uma atividade pedagógica inclusiva sobre o tema: "${topic}"

IMPORTANTE: Seja sucinto e objetivo. O corpo da atividade não deve ultrapassar 300 palavras. Use linguagem direta e passos claros.

Retorne em Markdown formatado:
# Título da Atividade
**Tema:** ${topic}
**Nível:** [Educação Infantil / Anos Iniciais / Anos Finais]

## Objetivo de Aprendizagem

## Materiais Necessários

## Desenvolvimento (Passo a Passo)

## Adaptações Inclusivas

## Dica para o Professor`;
}

function buildImageActivityPrompt(topic: string, studentCtx: string): string {
  const studentHint = studentCtx
    ? `Aluno: ${studentCtx.split('\n').find(l => l.startsWith('Aluno:')) || studentCtx.split('\n')[0] || 'necessidades especiais'}.`
    : 'inclusiva e acessível para todos.';

  return `Folha de atividade pedagógica visual, formato A4 retrato, pronta para imprimir. ` +
    `Tema: "${topic}". ${studentHint} ` +
    `Layout: título grande e colorido no topo, instruções simples em etapas numeradas, ` +
    `ilustrações educativas coloridas e alegres, espaços em branco para o aluno escrever ou desenhar, ` +
    `borda decorativa suave. Fundo branco. Texto legível, fonte grande. Estilo lúdico e educativo infantil. ` +
    `Sem texto excessivo. Cores vivas mas suaves.`;
}

function buildAdaptImagePrompt(studentCtx: string, extraInstructions: string): string {
  const target = studentCtx
    ? `adaptada especificamente para o aluno descrito: ${studentCtx.split('\n').slice(0, 3).join('; ')}`
    : 'adaptada para inclusão e acessibilidade';
  const extra = extraInstructions ? ` Instrução adicional: ${extraInstructions}.` : '';

  return `Analise esta atividade educativa enviada como imagem. Extraia o conteúdo e crie uma versão ` +
    `completamente redesenhada, ${target}.${extra} ` +
    `Simplifique o texto, divida em passos curtos, remova complexidade desnecessária. ` +
    `Descreva detalhadamente como deve ser a nova atividade visual: título, instruções passo a passo, ` +
    `elementos visuais, layout A4 para imprimir.`;
}

// ─── Componente: ChatBubble ───────────────────────────────────────────────────
const ChatBubble: React.FC<{
  msg:          ChatMessage;
  onViewResult: (msg: ChatMessage) => void;
}> = ({ msg, onViewResult }) => {
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
        {isUser ? <UserIcon size={15} color="#fff" /> : <Bot size={15} color="#fff" />}
      </div>

      {/* Balão */}
      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: isUser ? 'flex-end' : 'flex-start' }}>

        {/* Preview de arquivo anexado */}
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

        {/* Texto da mensagem */}
        <div style={{
          padding: '10px 14px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
          background: isUser ? C.dark : C.surface,
          color: isUser ? '#fff' : C.dark,
          border: isUser ? 'none' : `1px solid ${C.border}`,
          fontSize: 14, lineHeight: 1.55,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          {msg.text}
        </div>

        {/* Resultado de texto gerado — chip clicável */}
        {msg.result && (
          <div
            onClick={() => onViewResult(msg)}
            style={{
              padding: '10px 14px', borderRadius: 12,
              background: '#F0F9F4', border: '1px solid #BBF7D0',
              fontSize: 12, color: '#166534', maxWidth: '100%',
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            }}
          >
            <CheckCircle size={14} color="#16A34A" />
            <span style={{ fontWeight: 600 }}>Atividade gerada — clique para visualizar</span>
            {msg.creditsUsed !== undefined && (
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, color: C.gold, fontWeight: 700 }}>
                <Coins size={10} /> {msg.creditsUsed} cr
              </span>
            )}
            <ChevronRight size={13} color="#16A34A" style={{ marginLeft: 4 }} />
          </div>
        )}

        {/* Resultado de imagem gerada — thumbnail clicável */}
        {msg.resultImageUrl && (
          <div
            onClick={() => onViewResult(msg)}
            style={{
              borderRadius: 12, overflow: 'hidden',
              border: `1px solid ${C.border}`, maxWidth: 200,
              cursor: 'pointer', position: 'relative',
            }}
          >
            <img
              src={msg.resultImageUrl}
              alt="Atividade gerada"
              style={{ width: '100%', display: 'block', objectFit: 'cover' }}
            />
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(31,78,95,0.85)', padding: '6px 10px',
              fontSize: 10, color: '#fff', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <FileImage size={10} /> Clique para ver em tamanho completo
            </div>
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

// ─── Componente: Visualização de resultado de texto (A4) ──────────────────────
const A4Preview: React.FC<{
  content:    string;
  title:      string;
  onSave:     () => void;
  saving:     boolean;
  saved:      boolean;
  onExportDoc: () => void;
  onPrint:    () => void;
}> = ({ content, title, onSave, saving, saved, onExportDoc, onPrint }) => (
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
      <button onClick={onExportDoc} title="Baixar .doc" style={btnStyle}>
        <Download size={13} />
      </button>
      <button onClick={onPrint} title="Imprimir" style={btnStyle}>
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

    {/* Folha A4 */}
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', background: C.bg }}>
      <div style={{
        background: '#fff', borderRadius: 8, padding: '32px 28px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)', minHeight: 640,
        maxWidth: 640, margin: '0 auto',
        fontFamily: 'Georgia, serif', fontSize: 13, lineHeight: 1.7, color: '#1a1a1a',
      }}>
        <div className="prose" style={{ maxWidth: '100%' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
    <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
  </div>
);

// ─── Componente: Visualização de resultado de imagem ──────────────────────────
const ImagePreview: React.FC<{
  imageUrl:  string;
  title:     string;
  onSave:    () => void;
  saving:    boolean;
  saved:     boolean;
  onDownload: () => void;
}> = ({ imageUrl, title, onSave, saving, saved, onDownload }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    {/* Toolbar */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
      borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0,
    }}>
      <FileImage size={14} color={C.petrol} />
      <span style={{ fontSize: 12, fontWeight: 700, color: C.dark, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title || 'Imagem A4 Gerada'}
      </span>
      <button onClick={onDownload} title="Baixar PNG" style={btnStyle}>
        <Download size={13} /> <span style={{ fontSize: 11 }}>PNG</span>
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

    {/* Imagem */}
    <div style={{
      flex: 1, overflowY: 'auto', padding: '20px 16px', background: C.bg,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    }}>
      <img
        src={imageUrl}
        alt="Atividade gerada"
        style={{
          maxWidth: '100%', borderRadius: 8,
          boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        }}
      />
    </div>
  </div>
);

const btnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
  background: C.surface, cursor: 'pointer', fontSize: 12, color: C.dark,
  fontWeight: 500, outline: 'none',
};

// ─── Componente: Biblioteca ───────────────────────────────────────────────────
const Library: React.FC<{
  activities: any[];
  loading:    boolean;
  onSelect:   (act: any) => void;
  onDelete:   (id: string) => void;
  selectedId?: string;
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

// ─── Componente: Seletor de aluno ─────────────────────────────────────────────
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
    if (student.supportLevel) ctxText.push(`Nível de suporte: ${student.supportLevel}`);
    if (student.difficulties?.length) ctxText.push(`Principais dificuldades: ${student.difficulties.join('; ')}`);
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

// ─── Props ────────────────────────────────────────────────────────────────────
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
  const [showWorkflow, setShowWorkflow]   = useState(defaultTab === 'workflow');

  // ── Chat ──────────────────────────────────────────────────────────────────
  const [messages,     setMessages]     = useState<ChatMessage[]>([]);
  const [inputText,    setInputText]    = useState('');
  const [pendingFile,  setPendingFile]  = useState<AttachedFile | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // ── Modo de geração ───────────────────────────────────────────────────────
  const [genMode, setGenMode] = useState<GenerationMode>('texto');

  // ── Aluno ─────────────────────────────────────────────────────────────────
  const [studentId,   setStudentId]   = useState('');
  const [studentCtx,  setStudentCtx]  = useState('');
  const [studentName, setStudentName] = useState('');

  // ── Painel direito ────────────────────────────────────────────────────────
  const [rightTab,   setRightTab]   = useState<'preview' | 'library'>('preview');
  const [previewMsg, setPreviewMsg] = useState<ChatMessage | null>(null);
  const [savingId,   setSavingId]   = useState<string | null>(null);

  // ── Biblioteca ────────────────────────────────────────────────────────────
  const [library,        setLibrary]        = useState<any[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySelId,   setLibrarySelId]   = useState<string | null>(null);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef  = useRef<HTMLTextAreaElement>(null);

  // ── Scroll automático ─────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Carrega biblioteca ─────────────────────────────────────────────────────
  useEffect(() => { loadLibrary(); }, []);

  async function loadLibrary() {
    setLibraryLoading(true);
    try {
      const acts = await GeneratedActivityService.getForTenant(user.id);
      setLibrary(acts || []);
    } catch { /* silencioso */ } finally {
      setLibraryLoading(false);
    }
  }

  // ── Mensagem de boas-vindas ────────────────────────────────────────────────
  useEffect(() => {
    setMessages([{
      id: uid(), role: 'assistant', timestamp: new Date(),
      text: 'Olá! Descreva o que precisa e eu crio pronto para você.\n\nExemplos: "Atividade de frações para Anos Iniciais" ou "Leitura sobre animais para aluno com TEA".\n\nEscolha o modo de saída abaixo e clique em Gerar.',
    }]);
  }, []);

  // ── Aluno ─────────────────────────────────────────────────────────────────
  const handleStudentChange = useCallback((id: string, ctx: string, name: string) => {
    setStudentId(id);
    setStudentCtx(ctx);
    setStudentName(name);
    if (id) {
      addAssistantMsg(`Contexto de **${name}** carregado. Todas as gerações serão personalizadas para este aluno.`);
    }
  }, []);

  // ── Helpers de mensagem ───────────────────────────────────────────────────
  function addAssistantMsg(text: string, extra?: Partial<ChatMessage>) {
    setMessages(prev => [...prev, { id: uid(), role: 'assistant', text, timestamp: new Date(), ...extra }]);
  }

  function updateMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
    setPreviewMsg(prev => prev?.id === id ? { ...prev, ...patch } : prev);
  }

  // ── Selecionar arquivo ────────────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    const previewUrl = file.type.startsWith('image/') ? base64 : undefined;
    setPendingFile({ name: file.name, type: file.type, base64, previewUrl });
    e.target.value = '';
  };

  // ── Quando modo 'adaptar' é selecionado, abre o seletor de arquivo ─────────
  const handleModeChange = (mode: GenerationMode) => {
    setGenMode(mode);
    if (mode === 'adaptar' && !pendingFile) {
      // pequeno delay para garantir que o input está disponível
      setTimeout(() => fileInputRef.current?.click(), 100);
    }
  };

  // ── Enviar ────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = inputText.trim();
    const file = pendingFile;

    if (isGenerating) return;

    // Modo adaptar: precisa de arquivo
    if (genMode === 'adaptar') {
      if (!file) {
        addAssistantMsg('⚠️ Para adaptar uma imagem, selecione primeiro a imagem que deseja adaptar.');
        return;
      }
      if (!file.type.startsWith('image/')) {
        addAssistantMsg('⚠️ O modo "Adaptar imagem" aceita apenas arquivos de imagem (PNG, JPG, WEBP).');
        return;
      }
    } else {
      if (!text) return;
    }

    // Mensagem do usuário
    const userMsg: ChatMessage = {
      id: uid(), role: 'user', timestamp: new Date(),
      text: text || (file ? `Adaptar: ${file.name}` : ''),
      file: file ?? undefined,
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setPendingFile(null);

    // Roteamento por modo
    if (genMode === 'texto') {
      await generateTextActivity(text);
    } else if (genMode === 'imagem') {
      await generateImageActivity(text);
    } else if (genMode === 'adaptar' && file) {
      await adaptImageToImage(file, text);
    }
  };

  // ── Modo 1: Atividade completa (texto) ────────────────────────────────────
  async function generateTextActivity(topic: string) {
    const cost = INCLUILAB_MODEL_COSTS.TEXT;

    const hasCredits = creditsAvailable !== undefined
      ? creditsAvailable >= cost
      : await AIService.checkCredits(user, cost);
    if (!hasCredits) { addAssistantMsg(`⚠️ ${CREDIT_INSUFFICIENT_MSG}`); return; }

    setIsGenerating(true);
    const thinkingId = uid();
    setMessages(prev => [...prev, {
      id: thinkingId, role: 'assistant', timestamp: new Date(),
      text: `Criando atividade sobre "${topic}"…`,
    }]);

    try {
      const prompt = buildActivityPrompt(topic, studentCtx);
      const raw = await AIService.generateFromPromptWithImage(prompt, '', user);
      await safeDeductCredits(user, 'INCLUILAB_TEXT', cost);

      const patch: Partial<ChatMessage> = {
        text: `Atividade sobre **"${topic}"** pronta${studentName ? ` para ${studentName}` : ''}!`,
        result: raw,
        creditsUsed: cost,
      };
      updateMessage(thinkingId, patch);
      setPreviewMsg({ id: thinkingId, role: 'assistant', timestamp: new Date(), text: '', ...patch } as ChatMessage);
      setRightTab('preview');
    } catch (err: any) {
      updateMessage(thinkingId, { text: `❌ Erro: ${friendlyAIError(err)}` });
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Modo 2: Gerar como imagem A4 ─────────────────────────────────────────
  async function generateImageActivity(topic: string) {
    const cost = INCLUILAB_MODEL_COSTS.GPT_IMAGE;

    const hasCredits = creditsAvailable !== undefined
      ? creditsAvailable >= cost
      : await AIService.checkCredits(user, cost);
    if (!hasCredits) { addAssistantMsg(`⚠️ ${CREDIT_INSUFFICIENT_MSG}`); return; }

    setIsGenerating(true);
    const thinkingId = uid();
    setMessages(prev => [...prev, {
      id: thinkingId, role: 'assistant', timestamp: new Date(),
      text: `Gerando folha A4 sobre "${topic}"…`,
    }]);

    try {
      const imagePrompt = buildImageActivityPrompt(topic, studentCtx);
      const { ImageGenerationService } = await import('../services/imageGenerationService');
      const tenantId = (user as any).tenant_id ?? user.id;
      const result = await ImageGenerationService.generate(imagePrompt, { tenantId, userId: user.id });

      await safeDeductCredits(user, 'INCLUILAB_IMAGE_A4', cost);

      const patch: Partial<ChatMessage> = {
        text: `Imagem A4 pronta${studentName ? ` para ${studentName}` : ''}! Clique para ver.`,
        resultImageUrl: result.base64DataUrl,
        creditsUsed: cost,
      };
      updateMessage(thinkingId, patch);
      setPreviewMsg({ id: thinkingId, role: 'assistant', timestamp: new Date(), text: '', ...patch } as ChatMessage);
      setRightTab('preview');
    } catch (err: any) {
      updateMessage(thinkingId, { text: `❌ Erro ao gerar imagem: ${friendlyAIError(err)}` });
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Modo 3: Adaptar imagem enviada → saída imagem ─────────────────────────
  async function adaptImageToImage(file: AttachedFile, extraInstructions: string) {
    const step1Cost = AI_CREDIT_COSTS.OCR + INCLUILAB_MODEL_COSTS.TEXT;
    const step2Cost = INCLUILAB_MODEL_COSTS.GPT_IMAGE;
    const totalCost = step1Cost + step2Cost;

    const hasCredits = creditsAvailable !== undefined
      ? creditsAvailable >= totalCost
      : await AIService.checkCredits(user, totalCost);
    if (!hasCredits) { addAssistantMsg(`⚠️ ${CREDIT_INSUFFICIENT_MSG}`); return; }

    setIsGenerating(true);
    const thinkingId = uid();
    setMessages(prev => [...prev, {
      id: thinkingId, role: 'assistant', timestamp: new Date(),
      text: 'Analisando a imagem e gerando versão adaptada…',
    }]);

    try {
      // Passo 1: AI lê a imagem e descreve a versão adaptada
      const analyzePrompt = buildAdaptImagePrompt(studentCtx, extraInstructions);
      const adaptedDescription = await AIService.generateFromPromptWithImage(analyzePrompt, file.base64, user);
      await safeDeductCredits(user, 'INCLUILAB_ADAPT_READ', step1Cost);

      updateMessage(thinkingId, { text: 'Gerando imagem adaptada…' });

      // Passo 2: Gera imagem visual com base na descrição adaptada
      const imagePrompt = `Folha de atividade pedagógica A4, pronta para imprimir. ` +
        `${adaptedDescription.slice(0, 600)} ` +
        `Estilo educativo, texto grande e legível, ilustrações simples, cores suaves, fundo branco.`;

      const { ImageGenerationService } = await import('../services/imageGenerationService');
      const tenantId = (user as any).tenant_id ?? user.id;
      const result = await ImageGenerationService.generate(imagePrompt, { tenantId, userId: user.id });
      await safeDeductCredits(user, 'INCLUILAB_ADAPT_IMAGE', step2Cost);

      const patch: Partial<ChatMessage> = {
        text: `Imagem adaptada pronta${studentName ? ` para ${studentName}` : ''}!`,
        resultImageUrl: result.base64DataUrl,
        creditsUsed: totalCost,
      };
      updateMessage(thinkingId, patch);
      setPreviewMsg({ id: thinkingId, role: 'assistant', timestamp: new Date(), text: '', ...patch } as ChatMessage);
      setRightTab('preview');
    } catch (err: any) {
      updateMessage(thinkingId, { text: `❌ Erro: ${friendlyAIError(err)}` });
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Salvar na biblioteca ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!previewMsg) return;
    if (!previewMsg.result && !previewMsg.resultImageUrl) return;

    setSavingId(previewMsg.id);
    try {
      const lines = (previewMsg.result || '').split('\n');
      const titleLine = lines.find(l => l.startsWith('#'));
      const title = titleLine ? titleLine.replace(/^#+\s*/, '') : 'Atividade IncluiLAB';

      const id = await GeneratedActivityService.save({
        tenantId:    (user as any).tenant_id ?? user.id,
        userId:      user.id,
        studentId:   studentId || undefined,
        title,
        content:     previewMsg.result || `[Imagem gerada — ${new Date().toLocaleString('pt-BR')}]`,
        imageUrl:    previewMsg.resultImageUrl,
        isAdapted:   genMode === 'adaptar',
        creditsUsed: previewMsg.creditsUsed ?? 0,
        tags:        studentName ? [studentName] : [],
      });
      if (id) {
        updateMessage(previewMsg.id, { savedId: id });
        await loadLibrary();
      }
    } catch (e: any) {
      console.error('[IncluiLAB] Erro ao salvar:', e?.message);
    } finally {
      setSavingId(null);
    }
  };

  // ── Deletar da biblioteca ─────────────────────────────────────────────────
  const handleDeleteLib = async (id: string) => {
    if (!window.confirm('Remover esta atividade da biblioteca?')) return;
    await GeneratedActivityService.delete(id);
    setLibrary(prev => prev.filter(a => a.id !== id));
    if (librarySelId === id) setLibrarySelId(null);
  };

  // ── Selecionar da biblioteca ──────────────────────────────────────────────
  const handleLibSelect = (act: any) => {
    setLibrarySelId(act.id);
    const fakeMsg: ChatMessage = {
      id: act.id, role: 'assistant',
      text: act.title,
      result: act.content,
      resultImageUrl: act.image_url,
      creditsUsed: act.credits_used,
      savedId: act.id,
      timestamp: new Date(act.created_at),
    };
    setPreviewMsg(fakeMsg);
    setRightTab('preview');
  };

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  // ── Sugestões rápidas ─────────────────────────────────────────────────────
  const suggestions = [
    'Atividade de frações para Anos Iniciais',
    'Leitura e interpretação sobre animais',
    'Matemática lúdica com material concreto',
    'Produção de texto com apoio visual',
  ];

  // ── AtivaIA canvas ────────────────────────────────────────────────────────
  if (showWorkflow) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
          background: C.surface, borderBottom: `1px solid ${C.border}`,
        }}>
          <button onClick={() => setShowWorkflow(false)} style={{ ...btnStyle, gap: 6 }}>
            ← Voltar
          </button>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: C.petrol, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={16} color="#fff" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.dark }}>AtivaIA</p>
            <p style={{ margin: 0, fontSize: 11, color: C.petrol }}>Canvas de Atividades</p>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <AtivaIACanvas user={user} students={students as any} sidebarOpen={sidebarOpen} onWorkflowNodesChange={onWorkflowNodesChange} />
        </div>
      </div>
    );
  }

  // ── Preview do painel direito ─────────────────────────────────────────────
  const hasImagePreview = !!previewMsg?.resultImageUrl;
  const hasTextPreview  = !!previewMsg?.result;

  const previewTitle = (() => {
    if (!previewMsg?.result) return 'Resultado gerado';
    const line = previewMsg.result.split('\n').find(l => l.startsWith('#'));
    return line ? line.replace(/^#+\s*/, '') : 'Atividade Gerada';
  })();

  // ── Placeholder do textarea muda com o modo ────────────────────────────────
  const inputPlaceholder = genMode === 'adaptar'
    ? (pendingFile ? 'Adicione instruções (opcional): "adaptar para TEA", "simplificar"…' : 'Clique no 📎 para selecionar a imagem a ser adaptada')
    : genMode === 'imagem'
    ? 'Descreva a atividade… ex: "Frações com pizza para 3º ano"'
    : 'Descreva o tema… ex: "Atividade de frações para aluno com TEA"';

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '10px 16px',
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
            <p style={{ margin: 0, fontSize: 10, color: C.petrol, lineHeight: 1.2 }}>Laboratório de Adaptações</p>
          </div>
        </div>

        <div style={{ width: 1, height: 28, background: C.border, flexShrink: 0 }} />

        {/* Seletor de aluno */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <StudentSelector students={students} selectedId={studentId} onChange={handleStudentChange} />
        </div>

        {/* AtivaIA */}
        <button onClick={() => setShowWorkflow(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
          background: C.bg, border: `1.5px solid ${C.border}`, cursor: 'pointer',
          color: C.dark, flexShrink: 0,
        }}>
          <Zap size={13} color={C.petrol} /> AtivaIA
        </button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Coluna esquerda: Chat ────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: `1px solid ${C.border}` }}>

          {/* Mensagens */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
            {messages.map(msg => (
              <ChatBubble
                key={msg.id}
                msg={msg}
                onViewResult={m => { setPreviewMsg(m); setRightTab('preview'); }}
              />
            ))}
            {/* Loader global visível na conversa enquanto gera */}
            {isGenerating && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.petrol, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Bot size={15} color="#fff" />
                </div>
                <div style={{
                  padding: '10px 16px', borderRadius: '4px 18px 18px 18px',
                  background: C.surface, border: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 13, color: C.sec,
                }}>
                  <Loader size={14} color={C.petrol} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                  Gerando…
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Sugestões (somente quando conversa vazia) */}
          {messages.length <= 1 && !isGenerating && (
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

          {/* Preview arquivo pendente */}
          {pendingFile && (
            <div style={{
              margin: '0 16px 8px', padding: '8px 12px', borderRadius: 12,
              background: C.light, border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              {pendingFile.type.startsWith('image/') && pendingFile.previewUrl
                ? <img src={pendingFile.previewUrl} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
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

          {/* ── Seletor de modo ───────────────────────────────────────────── */}
          <div style={{
            padding: '10px 16px 0',
            background: C.surface,
            borderTop: `1px solid ${C.border}`,
          }}>
            <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: C.sec, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Modo de geração
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {MODES.map(m => {
                const active = genMode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => handleModeChange(m.id)}
                    disabled={isGenerating}
                    style={{
                      padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      cursor: isGenerating ? 'default' : 'pointer',
                      background: active ? C.petrol : C.bg,
                      color: active ? '#fff' : C.dark,
                      border: `1.5px solid ${active ? C.petrol : C.border}`,
                      transition: 'all 0.15s', outline: 'none',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                    title={`${m.desc} · ${m.cost} créditos`}
                  >
                    {m.id === 'texto'   && <Type size={11} />}
                    {m.id === 'imagem'  && <FileImage size={11} />}
                    {m.id === 'adaptar' && <Paperclip size={11} />}
                    {m.label}
                    <span style={{
                      fontSize: 9, fontWeight: 700, opacity: 0.75,
                      background: active ? 'rgba(255,255,255,0.2)' : C.border,
                      color: active ? '#fff' : C.sec,
                      borderRadius: 20, padding: '1px 6px',
                    }}>
                      {m.cost} cr
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Input ────────────────────────────────────────────────────── */}
          <div style={{ padding: '10px 16px 14px', background: C.surface, flexShrink: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 8,
              border: `1.5px solid ${isGenerating ? C.border : C.petrol}`,
              borderRadius: 20, padding: '8px 10px',
              background: C.surface, transition: 'border-color 0.2s',
            }}>
              {/* Anexar */}
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Anexar imagem ou arquivo"
                disabled={isGenerating}
                style={{
                  background: 'none', border: 'none',
                  cursor: isGenerating ? 'default' : 'pointer',
                  color: pendingFile ? C.petrol : C.sec,
                  padding: '2px 4px', flexShrink: 0, borderRadius: 8,
                  transition: 'color 0.15s',
                }}
              >
                <Paperclip size={18} />
              </button>

              {/* Textarea */}
              <textarea
                ref={textAreaRef}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={isGenerating ? 'Aguarde…' : inputPlaceholder}
                disabled={isGenerating}
                rows={1}
                style={{
                  flex: 1, border: 'none', outline: 'none', resize: 'none',
                  fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit',
                  background: 'transparent', color: C.dark,
                  minHeight: 24, maxHeight: 120,
                }}
              />

              {/* Enviar */}
              <button
                onClick={handleSend}
                disabled={isGenerating || (genMode !== 'adaptar' && !inputText.trim()) || (genMode === 'adaptar' && !pendingFile)}
                title="Gerar"
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: 'none',
                  background: (() => {
                    if (isGenerating) return C.border;
                    if (genMode === 'imagem') return '#7C3AED';
                    if (genMode === 'adaptar') return '#0369A1';
                    return C.petrol;
                  })(),
                  cursor: isGenerating ? 'default' : 'pointer',
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
              Enter para enviar · Shift+Enter para nova linha
              {genMode === 'adaptar' && ' · Aceita PNG, JPG, WEBP'}
              {genMode === 'texto' && ' · Descreva o tema livremente'}
            </p>
          </div>

          {/* Input file oculto */}
          <input
            ref={fileInputRef}
            type="file"
            accept={genMode === 'adaptar' ? '.png,.jpg,.jpeg,.webp' : '.pdf,.png,.jpg,.jpeg,.webp,.docx,.doc'}
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>

        {/* ── Painel direito ───────────────────────────────────────────────── */}
        <div style={{ width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column', background: C.surface }}>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            {([
              { key: 'preview', label: 'Resultado', icon: Sparkles },
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
              hasImagePreview ? (
                <ImagePreview
                  imageUrl={previewMsg!.resultImageUrl!}
                  title={previewTitle}
                  onSave={handleSave}
                  saving={savingId === previewMsg?.id}
                  saved={!!previewMsg?.savedId}
                  onDownload={() => downloadImage(previewMsg!.resultImageUrl!, `${previewTitle}.png`)}
                />
              ) : hasTextPreview ? (
                <A4Preview
                  content={previewMsg!.result!}
                  title={previewTitle}
                  onSave={handleSave}
                  saving={savingId === previewMsg?.id}
                  saved={!!previewMsg?.savedId}
                  onExportDoc={() => exportAsDoc(previewMsg!.result!, `${previewTitle}.doc`)}
                  onPrint={() => printMarkdown(previewMsg!.result!, previewTitle)}
                />
              ) : (
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  height: '100%', color: C.sec, padding: 32, textAlign: 'center',
                }}>
                  <Sparkles size={40} color={C.border} style={{ marginBottom: 16 }} />
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.dark }}>
                    Resultado aparece aqui
                  </p>
                  <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.6, maxWidth: 240 }}>
                    Escolha um modo, descreva o que precisa e clique em Gerar.
                  </p>
                  <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 260 }}>
                    {MODES.map(m => (
                      <div key={m.id} style={{
                        padding: '10px 14px', borderRadius: 12,
                        background: C.bg, border: `1px solid ${C.border}`,
                        fontSize: 12, color: C.dark, textAlign: 'left',
                      }}>
                        <span style={{ fontWeight: 700 }}>{m.label}</span>
                        <span style={{ color: C.sec }}> — {m.desc}</span>
                      </div>
                    ))}
                  </div>
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
