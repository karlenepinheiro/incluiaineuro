// IncluiLabView.tsx — IncluiLAB v5.0 Studio
// Layout: Studio centralizado estilo Claude/Gemini — sem bolhas de chat

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Brain, Zap, Sparkles, Loader, Download,
  BookOpen, Coins, X, CheckCircle,
  FileText, Bookmark,
  Trash2, BookMarked, FileImage, Type, Paperclip,
  RefreshCw, User as UserIcon, ChevronDown, ChevronRight,
  Clock, Star, Layers, Target, Package, ListOrdered,
  Lightbulb, GraduationCap, AlertCircle, SlidersHorizontal,
  PlusCircle,
} from 'lucide-react';
import { User, Student, ActivitySchema, ActivityVisualAsset, ActivityPackage, OriginalActivityType, IncluiLabOutputFormat } from '../types';
import { INCLUILAB_NEW_UI } from '../config/incluilabUi';
import { isIncluiLabCanonicalModeEnabled } from '../config/incluilabPipeline';
import { AVALIACAO_KEYWORDS } from '../services/incluilab/intentExtractor';
import { AIService, friendlyAIError, cleanJsonString } from '../services/aiService';
import { callAIGateway } from '../services/aiGatewayService';
import { CreditTransactionService } from '../services/creditService';
import { INCLUILAB_ACTIVITY_COSTS, CREDIT_INSUFFICIENT_MSG } from '../config/aiCosts';
import { StudentContextService } from '../services/studentContextService';
import { GeneratedActivityService } from '../services/persistenceService';
import { WorkflowCanvas as AtivaIACanvas } from '../components/ativaIA/WorkflowCanvas';
import { A4ActivityRenderer } from '../components/incluilab/A4ActivityRenderer';
import { AnswerKeyRenderer } from '../components/incluilab/AnswerKeyRenderer';
import { ActivityA4Premium, ActivityVisualStyle } from '../components/incluilab/ActivityA4Premium';
import { exportAsPDF, exportAsPNG } from '../utils/incluilabExport';
import {
  buildIncluiLabWordFilename,
  downloadWordDocument,
  exportIncluiLabActivityToWord,
} from '../services/wordExportService';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import {
  getStoredContentJson,
  IncluiLabActivityContent,
  normalizeIncluiLabActivity,
  sanitizePdfFilename,
} from '../utils/incluilabActivity';
import {
  isActivitySchemaValidationError,
} from '../utils/validateActivitySchema';
import { CreditBalanceBadge } from '../components/CreditBalanceBadge';
// Sprint 2B — Activity Pipeline canônico (atrás da flag INCLUILAB_CANONICAL_PIPELINE, desligada por padrão).
// Não substitui o fluxo legado acima — apenas usado quando a flag está ligada. Ver src/config/incluilabUi.ts.
import { extractCanonicalIntent } from '../services/incluilab/intentExtractor';
import {
  buildTeacherGuideMarkdown,
  runCanonicalActivityPipeline,
} from '../services/incluilab/canonicalActivityPipeline';
import {
  buildActivityPackageFromStoredRow,
  buildCanonicalActivityStorageContent,
  parseStoredActivityFromPayload,
} from '../services/incluilab/activityPackageStorage';

// ─── Paleta ───────────────────────────────────────────────────────────────────
const C = {
  petrol:  '#1F4E5F',
  dark:    '#111827',
  gold:    '#C69214',
  bg:      '#FFFFFF',
  surface: '#FFFFFF',
  border:  '#E5E7EB',
  sec:     '#6B7280',
  light:   '#F3F4F6',
  green:   '#16A34A',
  greenBg: '#DCFCE7',
  greenBorder: '#BBF7D0',
};

// ─── Modos de geração ─────────────────────────────────────────────────────────
type GenerationMode =
  | 'a4_economica'
  | 'avaliacao'
  | 'a4_visual'
  | 'a4_premium'
  | 'adaptar_economico'
  | 'adaptar_visual'
  | 'adaptar_premium';

interface ModeConfig {
  id: GenerationMode;
  label: string;
  desc: string;
  maxCost: number;
  icon: React.ElementType;
  requiresFile: boolean;
}

const MODES_CRIAR: ModeConfig[] = [
  { id: 'a4_economica', label: 'A4 Econômica',     desc: 'Folha estruturada com validação canônica',                         maxCost: INCLUILAB_ACTIVITY_COSTS.A4_ECONOMICA,  icon: FileText,  requiresFile: false },
  { id: 'avaliacao',    label: 'Avaliação',        desc: 'Folha do aluno + gabarito obrigatório',                            maxCost: INCLUILAB_ACTIVITY_COSTS.A4_ECONOMICA,  icon: CheckCircle, requiresFile: false },
  { id: 'a4_visual',    label: 'A4 Visual',         desc: 'Guia pedagógico (texto) + folha A4 como imagem via Imagen',       maxCost: INCLUILAB_ACTIVITY_COSTS.A4_VISUAL_MAX, icon: Sparkles,  requiresFile: false },
  { id: 'a4_premium',   label: 'Premium Ilustrada', desc: 'Guia pedagógico + worksheet A4 premium retrato HD via Imagen',    maxCost: INCLUILAB_ACTIVITY_COSTS.A4_PREMIUM,    icon: FileImage, requiresFile: false },
];

const MODES_ADAPTAR: ModeConfig[] = [
  { id: 'adaptar_economico', label: 'Adaptar — Texto',   desc: 'Analisa imagem + reconstrói como A4 estruturado (Gemini)',        maxCost: INCLUILAB_ACTIVITY_COSTS.ADAPTAR_ECONOMICO,  icon: Layers,    requiresFile: true },
  { id: 'adaptar_visual',    label: 'Adaptar — Visual',  desc: 'Analisa + guia pedagógico + folha A4 imagem via Imagen',          maxCost: INCLUILAB_ACTIVITY_COSTS.ADAPTAR_VISUAL_MAX, icon: Sparkles,  requiresFile: true },
  { id: 'adaptar_premium',   label: 'Adaptar — Premium', desc: 'Analisa + guia pedagógico + worksheet A4 premium HD via Imagen',  maxCost: INCLUILAB_ACTIVITY_COSTS.ADAPTAR_PREMIUM,   icon: FileImage, requiresFile: true },
];

const ALL_MODES: ModeConfig[] = [...MODES_CRIAR, ...MODES_ADAPTAR];
const showAtivaAI = false;

function getModeConfig(mode: GenerationMode): ModeConfig {
  return ALL_MODES.find(m => m.id === mode) ?? MODES_CRIAR[0];
}

function isAdaptarMode(mode: GenerationMode): boolean {
  return mode.startsWith('adaptar_');
}

// ─── Seções com ícones mapeados ───────────────────────────────────────────────
const SECTION_ICONS: Record<string, React.ElementType> = {
  'objetivo':    Target,
  'materiais':   Package,
  'desenvolv':   ListOrdered,
  'adaptaç':     Lightbulb,
  'dica':        GraduationCap,
  'avalia':      CheckCircle,
  'recurso':     Star,
};

function getSectionIcon(title: string): React.ElementType {
  const t = title.toLowerCase();
  for (const [key, icon] of Object.entries(SECTION_ICONS)) {
    if (t.includes(key)) return icon;
  }
  return BookOpen;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface AttachedFile {
  name:       string;
  type:       string;
  base64:     string;
  previewUrl?: string;
}

interface GeneratedResult {
  id:           string;
  title:        string;
  prompt?:      string;
  contentJson?: IncluiLabActivityContent;
  activity?:    ActivitySchema;
  content?:     string;
  imageUrl?:    string;
  analysisText?: string;
  guiaText?:    string;  // Guia Pedagógico texto para modos Visual/Premium (OpenAI)
  creditsUsed:  number;
  mode:         GenerationMode;
  savedId?:     string;
  /** Sprint 2B — presente apenas quando o resultado veio do Activity Pipeline canônico (schemaVersion 2.0). */
  activityPackage?: ActivityPackage;
  outputFormat?: IncluiLabOutputFormat;
  outputFormatNotice?: string;
  /** Checkpoint 4E — gabarito do pipeline legado, quando requestType=avaliacao (ver buildPremiumActivityPrompt). */
  legacyAnswerKey?: IncluiLabAnswerKeyItem[];
  /** Checkpoint 4E — tipo estrutural detectado do material original, só em modos de adaptação. */
  originalActivityType?: OriginalActivityType | null;
}

interface PendingFormatRequest {
  mode: GenerationMode;
  topic: string;
  inputText: string;
  file: AttachedFile | null;
}

/** Checkpoint 4E — item Gabarito. Correlaciona por número de questão (não por id — o
 *  contrato legado de sections/items não tem id estável, só `number`). */
export interface IncluiLabAnswerKeyItem {
  numero: number;
  resposta: string;
  explicacao?: string;
}

type LabState = 'idle' | 'generating' | 'result';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }

function outputFormatLabel(format?: IncluiLabOutputFormat): string {
  if (format === 'docx') return 'Word';
  if (format === 'pdf') return 'PDF';
  if (format === 'png') return 'Imagem';
  return 'Não informado';
}

function outputFormatButtonLabel(format?: IncluiLabOutputFormat): string {
  if (format === 'docx') return 'Baixar Word';
  if (format === 'pdf') return 'Baixar PDF';
  if (format === 'png') return 'Baixar PNG';
  return 'Baixar PDF';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function activityToJson(activity: unknown): string {
  return JSON.stringify(activity, null, 2);
}

function exportActivityJson(activity: unknown, filename: string) {
  const blob = new Blob([activityToJson(activity)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadImage(dataUrl: string, filename = 'atividade.png') {
  const a = document.createElement('a');
  a.href = dataUrl; a.download = filename; a.click();
}

async function safeDeductCredits(user: User, action: string, cost: number) {
  await (AIService as any).deductCredits(user, action, cost);
  window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: user.id } }));
}

async function runReservedCreditFlow<T>(params: {
  user: User;
  amount: number;
  actionKey: string;
  description: string;
  metadata?: Record<string, unknown>;
  work: (reservationId: string, operationId: string) => Promise<T>;
}): Promise<T> {
  const tenantId = (params.user as any).tenant_id;
  const userId = (params.user as any).id ?? null;
  const operationId = CreditTransactionService.createOperationId(params.actionKey);

  const reserve = await CreditTransactionService.atomicReserveCredits({
    tenantId,
    amount: params.amount,
    description: params.description,
    userId,
    operationId,
    metadata: params.metadata ?? {},
    source: 'incluilab.reserve',
  });

  const reservationId = reserve.reservation_id;
  if (!reservationId) throw new Error('Falha ao reservar créditos para a operação.');

  try {
    const result = await params.work(reservationId, operationId);
    await CreditTransactionService.atomicCommitReservedCredits({
      tenantId,
      reservationId,
      description: params.description,
      userId,
      operationId: `${operationId}:commit`,
      metadata: params.metadata ?? {},
      source: 'incluilab.commit',
    });
    window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: params.user.id } }));
    return result;
  } catch (error) {
    try {
      await CreditTransactionService.atomicReleaseReservedCredits({
        tenantId,
        reservationId,
        description: `Falha em ${params.description}`,
        userId,
        operationId: `${operationId}:release`,
        metadata: {
          ...(params.metadata ?? {}),
          failure_kind: 'multimodal_generation_failed',
          error_message: error instanceof Error ? error.message : String(error),
        },
        source: 'incluilab.release',
      });
      window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: params.user.id } }));
    } catch (releaseError) {
      console.error('[IncluiLAB] Falha ao liberar reserva de créditos:', releaseError);
    }
    throw error;
  }
}

// Gera até `maxImages` imagens IA pequenas para os visualAssets do tipo placeholder.
// Cobra `perImageCost` créditos por imagem bem-sucedida; falhas usam emoji/pictograma fallback sem cobrança.
async function generateSmallImagesForAssets(
  assets: ActivityVisualAsset[],
  user: User,
  perImageCost: number,
  maxImages: number,
): Promise<{ updatedAssets: ActivityVisualAsset[]; imagesGenerated: number }> {
  const { ImageGenerationService } = await import('../services/imageGenerationService');
  const tenantId = (user as any).tenant_id ?? user.id;
  let imagesGenerated = 0;
  const updatedAssets = assets.map(a => ({ ...a }));
  const targets = updatedAssets.filter(a => a.type === 'placeholder').slice(0, maxImages);
  for (const asset of targets) {
    // Usa imagePrompt do JSON se disponível; caso contrário, monta prompt genérico
    const imgPrompt = asset.imagePrompt
      || `ilustracao educativa infantil premium, fundo branco, cores suaves, traco limpo, sem texto na imagem: ${asset.description || asset.title}`;
    try {
      const result = await ImageGenerationService.generate(imgPrompt, { tenantId, userId: user.id });
      const idx = updatedAssets.findIndex(a => a.id === asset.id);
      if (idx >= 0) updatedAssets[idx] = { ...updatedAssets[idx], url: result.base64DataUrl, type: 'image' };
      await safeDeductCredits(user, 'INCLUILAB_VISUAL_IMAGE', perImageCost);
      imagesGenerated++;
    } catch {
      // Imagem falhou — sem cobrança, renderer usa fallbackEmoji ou pictogramLibrary
    }
  }
  return { updatedAssets, imagesGenerated };
}

function activitySchemaErrorMessage(err: unknown): string {
  if (isActivitySchemaValidationError(err)) {
    return `${err.message} Revise o pedido e tente gerar novamente.`;
  }
  return `Erro: ${friendlyAIError(err)}`;
}

function createLegacyActivity(title: string, content: string): ActivitySchema {
  const lines = content
    .split('\n')
    .map(line => line.replace(/^#+\s*/, '').replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    schemaVersion: '1.0',
    header: {
      title: title || 'Atividade',
      theme: 'Conteudo salvo',
      objective: lines[0] || 'Atividade salva anteriormente na biblioteca.',
      instructions: ['Leia as orientacoes.', 'Resolva uma etapa por vez.'],
    },
    blocks: lines.slice(1, 5).map((line, index) => ({
      id: `legacy-block-${index + 1}`,
      type: 'practice',
      title: `Orientacao ${index + 1}`,
      content: line,
      items: [],
      visualAssetIds: [],
    })),
    exercises: [
      {
        id: 'legacy-exercise-1',
        type: 'short_answer',
        title: 'Registro da atividade',
        prompt: lines.slice(5).join(' ') || 'Use este espaco para registrar a resposta.',
        options: [],
        answerLines: 4,
      },
    ],
    visualAssets: [],
    accessibilityNotes: {
      supports: [],
      adaptations: [],
      teacherNotes: ['Conteudo legado convertido apenas para visualizacao A4.'],
    },
    footer: { note: 'Atividade salva na biblioteca IncluiLAB.', generatedBy: 'IncluiLAB' },
  };
}

// ─── Helpers de guia pedagógico ───────────────────────────────────────────────

function buildFallbackGuide(topic: string): string {
  return `# Guia do Professor

## Objetivo da Aula
Desenvolver competências relacionadas ao tema: **${topic}**.

## Tempo Estimado
30 a 45 minutos

## Materiais Necessários
- Folha de atividade impressa
- Lápis e borracha
- Materiais visuais de apoio (opcional)

## Metodologia Adaptada
Apresente o tema com exemplos concretos e linguagem simples. Leia os enunciados em voz alta para alunos com dificuldades de leitura. Permita o uso de recursos de apoio visual.

## Dicas de Mediação
- Explique cada questão individualmente antes de pedir a resposta
- Ofereça pistas visuais ou verbais quando necessário
- Divida tarefas maiores em etapas menores
- Valorize o processo e o esforço, não apenas o resultado

## Adaptações Inclusivas
- **TEA**: mantenha rotina e antecipe as etapas da atividade
- **DI**: simplifique enunciados oralmente e use exemplos concretos
- **TDAH**: divida a atividade em blocos curtos com pausas
- **Motoras**: aceite respostas verbais ou com apontamento

## Critérios de Avaliação
- Participação ativa na proposta
- Compreensão do tema central
- Realização das atividades com autonomia ou com apoio adequado
- Progresso em relação ao ponto de partida individual`;
}

function extractGuiaText(parsedJson: any, topic: string): string {
  const g = parsedJson?.guia_pedagogico;
  if (typeof g === 'string' && g.trim().length > 30) return g;
  if (g && typeof g === 'object') {
    const lines: string[] = ['# Guia do Professor'];
    if (g.objetivo_da_aula) lines.push(`\n## Objetivo da Aula\n${g.objetivo_da_aula}`);
    if (g.tempo_estimado) lines.push(`\n## Tempo Estimado\n${g.tempo_estimado}`);
    if (Array.isArray(g.materiais_necessarios) && g.materiais_necessarios.length)
      lines.push(`\n## Materiais Necessários\n${(g.materiais_necessarios as string[]).map(m => `- ${m}`).join('\n')}`);
    if (g.metodologia_adaptada) lines.push(`\n## Metodologia Adaptada\n${g.metodologia_adaptada}`);
    if (Array.isArray(g.dicas_de_mediacao) && g.dicas_de_mediacao.length)
      lines.push(`\n## Dicas de Mediação\n${(g.dicas_de_mediacao as string[]).map(d => `- ${d}`).join('\n')}`);
    if (Array.isArray(g.adaptacoes_inclusivas) && g.adaptacoes_inclusivas.length)
      lines.push(`\n## Adaptações Inclusivas\n${(g.adaptacoes_inclusivas as string[]).map(a => `- ${a}`).join('\n')}`);
    if (Array.isArray(g.criterios_de_avaliacao) && g.criterios_de_avaliacao.length)
      lines.push(`\n## Critérios de Avaliação\n${(g.criterios_de_avaliacao as string[]).map(c => `- ${c}`).join('\n')}`);
    if (lines.length > 1) return lines.join('');
  }
  return buildFallbackGuide(topic);
}

// ─── Checkpoint 4E — Preservação do tipo original em adaptações ──────────────
//
// Item "Adaptação não preserva o material original": antes, o prompt de
// adaptação não sabia (nem perguntava) que TIPO de atividade foi enviado —
// só recebia o texto extraído da análise de imagem, então o modelo recriava
// livremente como uma lista de perguntas genéricas, mesmo quando o original
// era um caça-palavras, cruzadinha, etc.
//
// Heurística de melhor esforço: procura pistas textuais na análise já feita
// pelo Gemini Vision (buildAdaptImagePrompt) — não é um classificador visual
// dedicado, é best-effort a partir da descrição em texto do que foi enviado.
export type { OriginalActivityType } from '../types';

export const ORIGINAL_ACTIVITY_TYPE_LABELS: Record<OriginalActivityType, string> = {
  word_search:     'caça-palavras',
  crossword:       'cruzadinha',
  multiple_choice: 'questões objetivas (múltipla escolha)',
  open_questions:  'questões discursivas',
  matching:        'ligar colunas / associação',
  fill_blank:      'completar lacunas',
  coloring:        'atividade de colorir',
  table:           'tabela',
  mixed:           'atividade mista',
  other:           'outro formato',
};

// Tipos que o contrato atual consegue renderizar sem converter para perguntas
// genéricas. word_search/crossword têm suporte mínimo no renderer canônico
// (grade/banco de palavras/pistas); Visual/Premium seguem legados.
const RENDERER_SUPPORTED_ORIGINAL_TYPES: ReadonlySet<OriginalActivityType> = new Set([
  'word_search', 'crossword', 'multiple_choice', 'open_questions', 'matching', 'fill_blank', 'coloring', 'table', 'mixed',
]);

export function rendererSupportsOriginalType(type: OriginalActivityType | null): boolean {
  return type !== null && RENDERER_SUPPORTED_ORIGINAL_TYPES.has(type);
}

export function detectOriginalActivityType(analysisText: string): OriginalActivityType | null {
  const t = (analysisText || '').toLowerCase();
  if (!t.trim()) return null;
  if (/ca[çc]a[\s-]?palavras/.test(t)) return 'word_search';
  if (/cruzadinha|palavras\s+cruzadas/.test(t)) return 'crossword';
  if (/colorir|pintar|atividade\s+de\s+colorir/.test(t)) return 'coloring';
  if (/tabela|quadro\s+de\s+respostas|complete\s+a\s+tabela|preencha\s+a\s+tabela/.test(t)) return 'table';
  if (/complet[ae]r?\s+(a\s+)?lacuna|preench[ae]r?\s+(a\s+)?lacuna|lacunas?/.test(t)) return 'fill_blank';
  if (/liga[çc][ãa]o\s+de\s+colunas|ligar\s+(as\s+)?colunas|associa[çc][ãa]o|coluna\s*a.*coluna\s*b/.test(t)) return 'matching';
  if (/m[uú]ltipla\s+escolha|alternativas?\b|assinale\s+a\s+(alternativa|op[çc][ãa]o)/.test(t)) return 'multiple_choice';
  if (/discursiv|resposta\s+livre|responda\s+com\s+suas\s+palavras|pergunta\s+aberta/.test(t)) return 'open_questions';
  return null;
}

// ─── Checkpoint 4E — Gabarito do pipeline legado (Avaliação) ─────────────────
// Componente próprio, estilo consistente com AnswerKeyRenderer.tsx, mas
// trabalhando direto com IncluiLabAnswerKeyItem[] (contrato sections/items,
// sem id estável — só `number`). Não reaproveita AnswerKeyRenderer porque
// aquele exige ActivitySchema/exercises do pipeline canônico.
const LegacyAnswerKeyView: React.FC<{ items: IncluiLabAnswerKeyItem[]; title: string }> = ({ items, title }) => (
  <div
    data-incluilab-pdf-page="true"
    style={{
      width: 794, minHeight: 1123, maxWidth: 794, boxSizing: 'border-box',
      background: '#fff', borderRadius: 12, padding: '40px 44px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.10)', fontFamily: "'Segoe UI', Arial, sans-serif",
      overflowWrap: 'break-word', wordBreak: 'break-word', overflowX: 'hidden',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, paddingBottom: 18, borderBottom: '2px solid #D0D8DC' }}>
      <div style={{ width: 42, height: 42, borderRadius: 11, background: '#F4FBF7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <CheckCircle size={20} color="#16A34A" />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 10, color: '#667085', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          IncluiLAB · Uso exclusivo do professor
        </p>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#20263A', overflowWrap: 'break-word' }}>
          Gabarito — {title || 'Atividade'}
        </h2>
      </div>
    </div>
    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.sort((a, b) => a.numero - b.numero).map(item => (
        <li key={item.numero} style={{ border: '1px solid #D0D8DC', borderRadius: 10, padding: '12px 16px' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1F4E5F' }}>Questão {item.numero}</p>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#20263A' }}>{item.resposta}</p>
          {item.explicacao && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#667085', fontStyle: 'italic' }}>{item.explicacao}</p>
          )}
        </li>
      ))}
    </ol>
  </div>
);

// Checkpoint 4E — item "Título vindo do filename": ordem de prioridade pedida:
// (1) título identificado dentro do próprio material, (2) título semântico do
// conteúdo, (3) tema principal, (4) só em último caso, filename sanitizado.
// O JSON schema (buildPremiumActivityPrompt) já pede "title" ao modelo — isso
// cobre (1)/(2)/(3) quando o modelo responde bem. Esta função só decide o
// FALLBACK (quando normalizeIncluiLabActivity não recebe um title utilizável).
export function deriveAdaptedFallbackTitle(analysisText: string, fileName: string): string {
  const explicit = (analysisText || '').match(/t[íi]tulo\s*[:\-]\s*([^\n]{4,90})/i);
  if (explicit) {
    const candidate = explicit[1].trim().replace(/["'*_#]/g, '').trim();
    if (candidate.length >= 4) return candidate;
  }
  const firstLine = (analysisText || '')
    .split('\n')
    .map(l => l.replace(/^[-*#\s]+/, '').trim())
    .find(l => l.length >= 6 && l.length <= 90 && !/^t[íi]tulo\s*[:\-]/i.test(l));
  if (firstLine) return firstLine;
  return sanitizeFileNameForTitle(fileName);
}

function sanitizeFileNameForTitle(fileName: string): string {
  const withoutExt = (fileName || '').replace(/\.[a-zA-Z0-9]{2,5}$/, '');
  const spaced = withoutExt.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!spaced) return 'Atividade Adaptada';
  return spaced.replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const IMAGE_STYLE_PROMPT = 'imagem pequena educativa para apoiar atividade escolar, fundo branco, cores suaves, traco limpo, sem texto na imagem';
// Checkpoint 4E — item "A4 Visual com qualidade ruim": reduzido de "no maximo 5
// questoes" para "no maximo 2 a 3 questoes curtas" — modelos de imagem (Imagen)
// nao sao confiaveis para renderizar grandes quantidades de texto pedagogico
// com ortografia correta; menos texto pedido reduz (nao elimina) o risco de
// erro. A correção arquitetural completa (texto vindo 100% do modelo textual +
// renderer do IncluiAI, Imagen só para ilustração) fica documentada como
// proposta de Sprint Visual — ver relatório do Checkpoint 4E.
const A4_WORKSHEET_STYLE_PROMPT = 'Gerar imagem A4 vertical de atividade escolar brasileira, fundo branco, estilo worksheet didatico premium, titulo grande no topo, cabecalho Nome/Data/Turma, questoes em quadros separados, imagens pequenas e educativas, bordas finas, poucas cores, texto legivel, linhas para resposta, sem poluicao visual, sem texto cortado, sem sobreposicao, sem repetir numeracao, no maximo 2 a 3 questoes curtas (priorize ilustracao ao texto), aparencia de material pronto para imprimir e vender';

function buildImageActivityPrompt(topic: string, studentCtx: string): string {
  const studentHint = studentCtx
    ? `Aluno: ${studentCtx.split('\n').find(l => l.startsWith('Aluno:')) || studentCtx.split('\n')[0] || 'necessidades especiais'}.`
    : 'inclusiva e acessivel para todos.';
  return `${A4_WORKSHEET_STYLE_PROMPT}. ` +
    `Tema: "${topic}". ${studentHint} ` +
    `Cabeçalho simples com Nome, Data e Turma. Use 3 a 5 questões em quadros separados, com espaços de resposta. ` +
    `Nao inclua objetivo pedagogico longo, metodologia, materiais ou guia do professor na folha do aluno.`;
}

function buildActivitySchemaPrompt(topic: string, studentCtx: string): string {
  const studentBlock = studentCtx
    ? `\n\nCONTEXTO DO ALUNO:\n${studentCtx}\n\nCrie especificamente para este aluno.`
    : '';

  return `Voce e especialista em educacao inclusiva e criacao de atividades pedagogicas.${studentBlock}

Crie uma atividade pedagogica inclusiva sobre o tema: "${topic}".

RETORNE APENAS JSON valido. Nao use Markdown. Nao escreva texto antes ou depois do JSON.

Use exatamente este contrato:
{
  "guia_pedagogico": {
    "objetivo_da_aula": "Objetivo claro da aula em uma frase",
    "metodologia_adaptada": "Como aplicar a atividade com adaptacoes inclusivas",
    "dicas_de_mediacao": ["Dica 1 para o professor", "Dica 2"],
    "criterios_de_avaliacao": ["Criterio 1 observavel", "Criterio 2"],
    "materiais_necessarios": ["Material 1", "Material 2"],
    "tempo_estimado": "30 minutos",
    "adaptacoes_inclusivas": ["Adaptacao 1", "Adaptacao 2"],
    "bncc_alinhamento": {
      "componente": "Componente curricular",
      "ano_serie": "Ano/Serie",
      "codigo_bncc": "EF__XX__ (ou 'Sugerido — validar com o professor' se incerto)",
      "habilidade": "Descricao da habilidade BNCC",
      "objetivo": "Objetivo de aprendizagem",
      "adaptacao_inclusiva": "Como a atividade adapta a habilidade ao perfil do aluno"
    }
  },
  "folha_do_aluno": {
    "cabecalho": {
      "escola": "",
      "aluno": "",
      "data": "",
      "disciplina": "Disciplina",
      "ano": "Ano/Serie",
      "tema": "${topic}"
    },
    "titulo": "Titulo curto e atraente da atividade",
    "objetivo_simplificado": "Frase curta para orientar o aluno, sem explicacao pedagogica",
    "instrucoes_simplificadas": ["Leia e responda com calma."],
    "conteudo_visual": [
      {
        "id": "cv-1",
        "posicao": 1,
        "titulo": "Nome do elemento visual",
        "texto_apoio": "Texto curto de apoio",
        "prompt_ia_imagem": "${IMAGE_STYLE_PROMPT}, [descreva o elemento visual especifico]",
        "url_gerada": null,
        "fallback_emoji": "🖼️"
      }
    ],
    "exercicios": [
      {
        "id": "ex-1",
        "tipo": "multipla_escolha",
        "titulo": "Atividade 1",
        "comando": "Enunciado curto e claro para o aluno",
        "opcoes": ["Opcao A", "Opcao B", "Opcao C"],
        "linhas_resposta": 3,
        "prompt_ia_imagem": "${IMAGE_STYLE_PROMPT}, [elemento visual deste exercicio]",
        "url_gerada": null,
        "dica_visual": "Apoio opcional"
      }
    ]
  }
}

Tipos validos de exercicio: multipla_escolha | ligar_colunas | completar_frase | circular | desenho | resposta_curta | verdadeiro_falso

Para ligar_colunas: use itens_esquerda e itens_direita (arrays) em vez de opcoes.
Para verdadeiro_falso: opcoes = ["Verdadeiro", "Falso"].

Regras pedagogicas:
- Portugues do Brasil.
- FOLHA DO ALUNO: visual de worksheet escolar A4 tradicional, fundo branco, titulo grande, quadros simples, bordas discretas e poucas cores.
- Nao misture objetivo longo, metodologia, materiais, BNCC, observacoes do professor ou explicacoes pedagogicas na folha_do_aluno.
- bncc_alinhamento: preencha SEMPRE no guia_pedagogico; se nao identificar o codigo com seguranca, use "Sugerido — validar com o professor" — nunca invente codigo.
- TAMANHO: 3 a 5 exercicios no maximo. Atividade simples: 3 exercicios. Atividade padrao: 4 exercicios. Nunca passe de 5.
- Cada exercicio deve conter 1 ideia central. Enunciado com no maximo 2 frases curtas.
- Se o conteudo ficar extenso: resumir e remover redundancia. NUNCA truncar com "...".
- Objetivo: atividade enxuta que caiba em 1 pagina A4 quando simples e no maximo 2 paginas quando media.
- VISUAL: use no maximo 2 elementos em conteudo_visual; imagens pequenas e laterais apenas quando ajudam.
- Nao repita "Materiais necessarios" em mais de 1 bloco.
- Linguagem direta, frases curtas — e para o aluno, nao para o professor.
- Guia do professor deve ser separado e detalhado.
- Nao retorne texto livre fora do JSON.`;
}

// Checkpoint 4D — item "Quantidade": buildPremiumActivityPrompt tinha um limite
// FIXO ("3 a 6 questoes no maximo") independente do que o professor pedisse no
// campo de tema. Se o professor digitasse "10 questoes sobre fracoes", o prompt
// simplesmente ignorava esse número e mandava o modelo gerar no máximo 6 —
// a causa raiz do relato "quantidade solicitada não é respeitada" para este modo
// (correção completa e definitiva de quantidade — com validação/reparo pós-
// geração — já existe no pipeline canônico via intentExtractor/validateAgainstRequest;
// aqui aplicamos apenas a correção mínima possível sem religar essa arquitetura).
// Reconhece variações comuns: "5 questões", "10 exercicios", "3 perguntas".
export function extractRequestedQuestionCount(topic: string): number | null {
  const match = topic.match(/\b(\d{1,2})\s*(question|questõe|questoe|quest[aã]o|exerc[ií]cio|pergunta)/i);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (!Number.isFinite(n) || n < 1) return null;
  // Limite de segurança pedagógica/visual para uma folha A4 — não deixa o
  // professor pedir, por exemplo, 80 questões e estourar o layout de impressão.
  return Math.min(n, 15);
}

// Checkpoint 4E — item "Avaliação sem Gabarito": reaproveita a MESMA lista de
// palavras-chave já usada e testada no pipeline canônico (intentExtractor.ts),
// em vez de reinventar uma segunda heurística.
function topicRequestsAvaliacao(topic: string): boolean {
  const lower = topic.toLowerCase();
  return AVALIACAO_KEYWORDS.some(k => lower.includes(k));
}

export interface BuildActivityPromptOptions {
  /** Inclui o campo guia_pedagogico no contrato (A4 Visual/Premium usam; A4 Econômica não). */
  includeGuia?: boolean;
  /**
   * Tipo estrutural do material original, quando esta é uma ADAPTAÇÃO (Checkpoint 4E,
   * item "Adaptação não preserva estrutura"). Quando presente, o prompt exige
   * preservar esse formato em vez de recriar como lista genérica de questões.
   */
  originalActivityType?: OriginalActivityType | null;
}

function buildPremiumActivityPrompt(topic: string, studentCtx: string, options: BuildActivityPromptOptions = {}): string {
  const studentBlock = studentCtx
    ? `\n\nCONTEXTO DO ALUNO:\n${studentCtx}\n\nCrie especificamente para este aluno.`
    : '';
  const requestedCount = extractRequestedQuestionCount(topic);
  const quantityRule = requestedCount
    ? `Use EXATAMENTE ${requestedCount} questoes — nem mais, nem menos. O professor pediu explicitamente esta quantidade.`
    : 'Use 3 a 6 questoes no maximo, com enunciados curtos.';

  // Checkpoint 4E — item "Avaliação sem Gabarito": quando o texto livre indica
  // avaliação/prova/teste, o contrato PASSA A EXIGIR um campo "gabarito" —
  // sem isso, requestType=avaliacao nunca produzia resposta correta alguma
  // (o schema de A4 Econômica nunca teve esse campo, em nenhum modo).
  const isAvaliacao = topicRequestsAvaliacao(topic);
  const gabaritoContractField = isAvaliacao
    ? `,
  "gabarito": [
    { "numero": 1, "resposta": "Resposta correta ou criterio objetivo de correcao", "explicacao": "Justificativa breve, opcional" }
  ]`
    : '';
  const gabaritoRule = isAvaliacao
    ? '\n- Isto e uma AVALIACAO: o campo "gabarito" e OBRIGATORIO e deve conter exatamente um item por numero de questao gerada, com a resposta correta (ou criterio objetivo de correcao para questoes discursivas). Nao deixe "gabarito" vazio nem incompleto.'
    : '';

  // Checkpoint 4E — item "Autosave que já funciona": campo opcional, não muda
  // o contrato quando includeGuia=false (A4 Econômica continua exatamente igual).
  const guiaContractField = options.includeGuia
    ? `,
  "guia_pedagogico": "Texto markdown curto com Objetivo da Aula, Metodologia, Dicas de Mediacao, Criterios de Avaliacao"`
    : '';
  const guiaRule = options.includeGuia
    ? ''
    : '\n- Nao gerar texto corrido longo, metodologia, BNCC ou guia do professor na folha.';

  // Checkpoint 4E — item "Adaptação não preserva estrutura": regra forte,
  // no texto exato pedido, só entra quando há um tipo original identificado.
  const preserveStructureRule = options.originalActivityType && options.originalActivityType !== 'other'
    ? `\n\nREGRA FUNDAMENTAL DE ADAPTACAO — O MATERIAL ORIGINAL E DO TIPO "${ORIGINAL_ACTIVITY_TYPE_LABELS[options.originalActivityType]}":
Preserve o formato e a natureza pedagogica da atividade original. Nao transforme um caca-palavras, cruzadinha, atividade de ligar, completar, colorir ou outro formato especifico em uma lista generica de perguntas, salvo se houver impossibilidade pedagogica explicita. Adapte dificuldade, linguagem, quantidade, suporte visual e organizacao MANTENDO a estrutura central do tipo "${ORIGINAL_ACTIVITY_TYPE_LABELS[options.originalActivityType]}". Use o "kind" de questao mais proximo disponivel no contrato (match para ligar/associar, fill_blank para completar lacunas, coloring para colorir) em vez de converter tudo para multiple_choice/short_answer.`
    : '';

  // Checkpoint 4E — item "Prompt A4 Econômica pobre" (qualidade pedagógica).
  // Bloco aplicado a TODOS os modos que usam este builder (Econômica, Visual,
  // Premium e as 3 variantes de Adaptar) — não duplicado por modo.
  const qualityBlock = `
Qualidade pedagogica obrigatoria:
- Considere serie/ano, disciplina e tema informados para calibrar vocabulario e complexidade.
- De progressao: comece mais simples e aumente a dificuldade ao longo das questoes.
- Varie os formatos quando fizer sentido para o tema (objetiva, discursiva curta, completar, associacao, interpretacao, situacao-problema, aplicacao pratica) — sem obrigar todos os formatos em todo tema; o formato precisa ser coerente com o conteudo e a serie.
- Use exemplos concretos e contextualizados (situacoes do cotidiano do aluno), nao apenas definicoes abstratas.
- Priorize clareza, coerencia e intencionalidade pedagogica — mais texto nao e melhor atividade.
- Nao repita a mesma pergunta ou o mesmo exemplo de formas diferentes.
- Se houver referencia a habilidade BNCC no contexto do aluno, pode citar; caso contrario, NUNCA invente codigo BNCC.
- Portugues do Brasil, formal e adequado a faixa etaria.`;

  return `Voce e especialista em educacao inclusiva e design de atividades escolares para impressao.${studentBlock}

Crie uma atividade visual em folha escolar A4 sobre: "${topic}".${preserveStructureRule}

RETORNE APENAS JSON valido. Nao use Markdown. Nao escreva texto antes ou depois do JSON.

Use exatamente este contrato:
{
  "title": "Titulo grande e claro, especifico do conteudo — nunca copie nome de arquivo",
  "subtitle": "Subtitulo curto opcional",
  "subject": "Disciplina",
  "grade": "Ano/Serie",
  "studentFields": ["Nome", "Turma", "Data"],
  "introText": "Instrucao curta para o aluno",
  "sections": [
    {
      "type": "text",
      "title": "Leitura",
      "content": "Texto curto, revisado e adequado ao ano/serie."
    },
    {
      "type": "questions",
      "title": "Questoes",
      "items": [
        {
          "number": 1,
          "kind": "multiple_choice",
          "statement": "Enunciado curto e claro.",
          "options": ["A) Opcao", "B) Opcao", "C) Opcao", "D) Opcao"],
          "answerLines": 0
        },
        {
          "number": 2,
          "kind": "short_answer",
          "statement": "Pergunta com espaco para resposta.",
          "options": [],
          "answerLines": 3
        }
      ]
    }
  ],
  "visualStyle": {
    "theme": "school_clean",
    "background": "white",
    "border": "discreet",
    "illustrations": "small_colored",
    "density": "balanced"
  }${guiaContractField}${gabaritoContractField}
}

Tipos validos de sections: text | info_box | vocabulary | questions | match | fill_blank | coloring | table | steps.
Tipos validos de question.kind: multiple_choice | short_answer | fill_blank | match | coloring | table | steps.
${qualityBlock}
Regras obrigatorias:
- Folha escolar A4, fundo branco, titulo grande e campos Nome/Turma/Data.
- Atividade visual para impressao, com questoes em quadros.
- Texto revisado, linguagem adequada ao ano/serie e frases curtas.
- Elementos ilustrativos pequenos apenas quando ajudam; pouca poluicao visual.${guiaRule}${gabaritoRule}
- Nao repetir numeracao; use numbers apenas sequenciais.
- ${quantityRule}
- Quando usar table, match, fill_blank, coloring ou steps, preencha os campos necessarios para renderizacao.
- Retorne somente JSON.`;
}

function buildPremiumAdaptActivityPrompt(
  analysis: string,
  studentCtx: string,
  extraInstructions: string,
  originalActivityType?: OriginalActivityType | null,
): string {
  const extra = extraInstructions ? `\n\nINSTRUCAO EXTRA DO PROFESSOR:\n${extraInstructions}` : '';
  return buildPremiumActivityPrompt(
    `Adaptar a atividade original mantendo o objetivo pedagogico. Conteudo extraido: ${analysis.slice(0, 1200)}${extra}`,
    studentCtx,
    { includeGuia: true, originalActivityType },
  );
}

function buildAdaptImagePrompt(studentCtx: string, extraInstructions: string): string {
  const target = studentCtx
    ? `adaptada especificamente para o aluno descrito: ${studentCtx.split('\n').slice(0, 3).join('; ')}`
    : 'adaptada para inclusao e acessibilidade';
  const extra = extraInstructions ? ` Instrucao adicional: ${extraInstructions}.` : '';
  return `Analise esta atividade educativa enviada como imagem. Extraia o conteudo e crie uma versao ` +
    `completamente redesenhada, ${target}.${extra} ` +
    `Simplifique o texto, divida em passos curtos, remova complexidade desnecessaria. ` +
    `Descreva detalhadamente o conteudo: titulo, objetivo, instrucoes, exercicios com enunciados completos.`;
}

// ─── A4 Renderer — renderização visual rica ───────────────────────────────────
function buildAdaptActivitySchemaPrompt(analysis: string, studentCtx: string, extraInstructions: string): string {
  const studentBlock = studentCtx
    ? `\n\nCONTEXTO DO ALUNO:\n${studentCtx}\n\nAdapte especificamente para este aluno.`
    : '';
  const extra = extraInstructions ? `\n\nINSTRUCAO EXTRA DO PROFESSOR:\n${extraInstructions}` : '';

  return `Voce e especialista em educacao inclusiva.${studentBlock}${extra}

Com base na analise abaixo de uma atividade original, crie uma NOVA atividade pedagogica inclusiva em formato A4.

ANALISE DA ATIVIDADE ORIGINAL:
${analysis.slice(0, 1400)}

RETORNE APENAS JSON valido. Nao use Markdown. Nao escreva texto antes ou depois do JSON.

Use exatamente este contrato:
{
  "guia_pedagogico": {
    "objetivo_da_aula": "Objetivo pedagogico preservado e adaptado",
    "metodologia_adaptada": "Como aplicar a atividade adaptada",
    "dicas_de_mediacao": ["Dica 1", "Dica 2"],
    "criterios_de_avaliacao": ["Criterio 1", "Criterio 2"],
    "materiais_necessarios": ["Material 1", "Material 2"],
    "tempo_estimado": "30 minutos",
    "adaptacoes_inclusivas": ["Adaptacao 1", "Adaptacao 2"]
  },
  "folha_do_aluno": {
    "cabecalho": {
      "escola": "",
      "aluno": "",
      "data": "",
      "disciplina": "Disciplina",
      "ano": "Ano/Serie",
      "tema": "Tema principal"
    },
    "titulo": "Titulo curto da atividade adaptada",
    "objetivo_simplificado": "Frase curta para orientar o aluno",
    "instrucoes_simplificadas": ["Leia e responda com calma."],
    "conteudo_visual": [
      {
        "id": "cv-1",
        "posicao": 1,
        "titulo": "Elemento visual",
        "texto_apoio": "Texto de apoio",
        "prompt_ia_imagem": "${IMAGE_STYLE_PROMPT}, [elemento especifico]",
        "url_gerada": null,
        "fallback_emoji": "🖼️"
      }
    ],
    "exercicios": [
      {
        "id": "ex-1",
        "tipo": "resposta_curta",
        "titulo": "Atividade 1",
        "comando": "Enunciado curto para o aluno",
        "opcoes": [],
        "linhas_resposta": 4,
        "prompt_ia_imagem": "${IMAGE_STYLE_PROMPT}, [elemento deste exercicio]",
        "url_gerada": null,
        "dica_visual": "Apoio opcional"
      }
    ]
  }
}

Tipos validos de exercicio: multipla_escolha | ligar_colunas | completar_frase | circular | desenho | resposta_curta | verdadeiro_falso

Regras:
- Preserve o objetivo pedagogico da atividade original.
- Reduza carga de leitura e aumente clareza visual.
- FOLHA DO ALUNO: worksheet escolar A4 tradicional, fundo branco, titulo grande, quadros simples, bordas discretas e poucas cores.
- Nao misture objetivo longo, metodologia, materiais, BNCC, observacoes do professor ou explicacoes pedagogicas na folha_do_aluno.
- TAMANHO: 3 a 5 exercicios no maximo. 1 ideia por exercicio. Enunciado com no maximo 2 frases.
- Se conteudo ficar extenso: resumir, remover redundancia. Nunca truncar com "...".
- VISUAL: use no maximo 2 elementos em conteudo_visual; imagens pequenas e laterais apenas quando ajudam.
- Nao repita "Materiais necessarios" em mais de 1 bloco.
- Objetivo: atividade simples em 1 pagina A4 e media no maximo 2 paginas.
- Nao retorne texto livre.`;
}

function buildAdaptPremiumImagePrompt(analysis: string, studentCtx: string): string {
  const target = studentCtx
    ? `adaptado para o aluno: ${studentCtx.split('\n').slice(0, 3).join('; ')}`
    : 'inclusivo e acessivel para todos';
  return `${A4_WORKSHEET_STYLE_PROMPT}. ` +
    `Versao inclusiva e adaptada de atividade original: ${analysis.slice(0, 400)}. ` +
    `${target}. ` +
    `Cabeçalho simples com Nome, Data e Turma. Use 3 a 5 questões em quadros separados, com espaços de resposta. ` +
    `Nao inclua objetivo pedagogico longo, metodologia, materiais ou guia do professor na folha do aluno.`;
}

// ─── Helpers para modos OpenAI ────────────────────────────────────────────────

type TargetType = 'turma_geral' | 'adaptada';

interface GuiaConteudoResult {
  titulo_atividade: string;
  guia_pedagogico:  string;
  descricao_folha:  string;
}

function safeParseGuiaJson(raw: string): GuiaConteudoResult {
  try {
    const cleaned = cleanJsonString(raw);
    const parsed = JSON.parse(cleaned);
    return {
      titulo_atividade: parsed.titulo_atividade || '',
      guia_pedagogico:  parsed.guia_pedagogico  || '',
      descricao_folha:  parsed.descricao_folha  || '',
    };
  } catch {
    return { titulo_atividade: '', guia_pedagogico: '', descricao_folha: raw.slice(0, 600) };
  }
}

function buildGuiaEConteudoPrompt(
  topic:        string,
  targetType:   TargetType,
  anoSerie:     string,
  studentCtx:   string,
  studentName:  string,
): string {
  const tipoStr = targetType === 'turma_geral'
    ? 'Turma geral (sem adaptações clínicas específicas)'
    : `Adaptada para aluno específico${studentName ? ': ' + studentName : ''}`;
  const gradeStr = anoSerie ? `\nAno/Série: ${anoSerie}` : '';
  const adaptStr = targetType === 'adaptada' && studentCtx
    ? `\n\nCONTEXTO DO ALUNO:\n${studentCtx}\n\nAdapte a atividade especificamente para este aluno. Não invente dados.`
    : '';

  return `Você é especialista em educação inclusiva. Crie material pedagógico para:
Tipo: ${tipoStr}
Tema: ${topic}${gradeStr}${adaptStr}

Retorne APENAS JSON válido, sem Markdown, sem texto antes ou depois:
{
  "titulo_atividade": "Título curto e atraente da atividade — especifico do conteudo, nunca generico",
  "guia_pedagogico": "# Guia do Professor\\n\\n## Objetivo da Aula\\n[Objetivo claro em uma frase]\\n\\n## Metodologia Adaptada\\n[Como aplicar com adaptações inclusivas]\\n\\n## Tempo Estimado\\n[X minutos]\\n\\n## Materiais Necessários\\n- Material 1\\n- Material 2\\n\\n## Dicas de Mediação\\n- Dica 1\\n- Dica 2\\n\\n## Critérios de Avaliação\\n- Critério observável 1\\n- Critério observável 2\\n\\n## Adaptações Inclusivas\\n- Adaptação 1\\n- Adaptação 2\\n\\n## Alinhamento BNCC\\n- **Componente curricular:** [componente]\\n- **Ano/Série:** [ano]\\n- **Código BNCC:** [código ou 'Sugerido — validar com o professor']\\n- **Habilidade:** [descrição da habilidade]\\n- **Objetivo de aprendizagem:** [objetivo]\\n- **Adaptação inclusiva:** [como a atividade adapta a habilidade]\\n\\n## Observações para o Professor\\n[Orientações adicionais]",
  "descricao_folha": "Folha do aluno em A4 escolar limpo. CABECALHO: Nome, Data, Turma. TITULO: [titulo grande]. TEXTO CURTO: [uma instrucao breve, se necessario]. QUESTAO 1: [comando curto]; opcoes se houver; espaco para resposta. QUESTAO 2: [comando curto]. QUESTAO 3: [comando curto]. [no maximo 2 a 3 questoes curtas — o restante do espaco da folha e ilustrativo/decorativo, nao textual; cada questao em quadro proprio; sem guia do professor, sem metodologia, sem materiais]"
}

Qualidade pedagogica obrigatoria (Checkpoint 4E — mesmo padrão da A4 Econômica):
- Considere serie/ano e tema para calibrar vocabulario e complexidade.
- Priorize clareza e intencionalidade pedagogica — mais texto nao e melhor atividade.
- Use exemplos concretos e contextualizados quando fizer sentido para o tema.
- Se houver referencia a habilidade BNCC no contexto do aluno, pode citar; caso contrario, NUNCA invente codigo BNCC (use "Sugerido — validar com o professor").
- Portugues do Brasil, formal e adequado a faixa etaria.

Regras:
- guia_pedagogico: texto markdown completo com todas as 9 seções (incluindo Alinhamento BNCC). Linguagem para o professor.
- descricao_folha: texto descritivo (max. 150 palavras) que guiara geracao da imagem A4. NO MAXIMO 2 a 3 questoes curtas — texto extenso dentro de uma imagem gerada por IA tende a sair com erros de ortografia; prefira poucas questoes bem definidas e mais espaco para ilustracao. Portugues correto.
- A folha do aluno deve ser limpa, branca, com quadros simples, bordas discretas, poucas cores e imagens pequenas apenas quando ajudam.
- Nao incluir objetivo longo, metodologia, materiais, BNCC, observacoes do professor ou explicacoes pedagogicas na descricao_folha.
- No Alinhamento BNCC do guia_pedagogico: nunca inventar codigo — usar "Sugerido — validar com o professor" quando nao houver certeza.
- Nenhum dado inventado sobre o aluno.
- Retorne apenas JSON, sem nada antes ou depois.`;
}

function buildGuiaEConteudoAdaptarPrompt(
  analysisText:     string,
  targetType:       TargetType,
  anoSerie:         string,
  studentCtx:       string,
  studentName:      string,
  extraInstructions: string,
): string {
  const tipoStr = targetType === 'turma_geral'
    ? 'Turma geral'
    : `Adaptada para aluno específico${studentName ? ': ' + studentName : ''}`;
  const gradeStr = anoSerie ? `\nAno/Série: ${anoSerie}` : '';
  const adaptStr = targetType === 'adaptada' && studentCtx
    ? `\n\nCONTEXTO DO ALUNO:\n${studentCtx}\n\nAdapte especificamente para este aluno.`
    : '';
  const extraStr = extraInstructions ? `\n\nINSTRUÇÃO EXTRA: ${extraInstructions}` : '';

  return `Você é especialista em educação inclusiva.
Tipo: ${tipoStr}${gradeStr}${adaptStr}${extraStr}

Com base na análise abaixo de uma atividade original, crie uma versão adaptada.

ANÁLISE DA ATIVIDADE ORIGINAL:
${analysisText.slice(0, 1200)}

Retorne APENAS JSON válido, sem Markdown, sem texto antes ou depois:
{
  "titulo_atividade": "Título curto da atividade adaptada — especifico do conteudo, NUNCA copie nome de arquivo",
  "guia_pedagogico": "# Guia do Professor\\n\\n## Objetivo da Aula\\n[Objetivo preservado e adaptado]\\n\\n## Metodologia Adaptada\\n[Como aplicar]\\n\\n## Tempo Estimado\\n[X minutos]\\n\\n## Materiais Necessários\\n- Material 1\\n\\n## Dicas de Mediação\\n- Dica 1\\n\\n## Critérios de Avaliação\\n- Critério 1\\n\\n## Adaptações Inclusivas\\n- Adaptação 1\\n\\n## Alinhamento BNCC\\n- **Componente curricular:** [componente]\\n- **Ano/Série:** [ano]\\n- **Código BNCC:** [código ou 'Sugerido — validar com o professor']\\n- **Habilidade:** [descrição]\\n- **Objetivo de aprendizagem:** [objetivo]\\n- **Adaptação inclusiva:** [como adapta a habilidade]\\n\\n## Observações para o Professor\\n[Orientações]",
  "descricao_folha": "Folha do aluno em A4 escolar limpo. CABECALHO: Nome, Data, Turma. TITULO: [titulo grande]. TEXTO CURTO: [uma instrucao breve, se necessario]. QUESTAO 1: [comando curto adaptado]; opcoes se houver; espaco para resposta. QUESTAO 2: [comando curto]. [no maximo 2 a 3 questoes curtas — priorize ilustracao/decoracao ao texto; cada questao em quadro proprio; sem guia do professor, sem metodologia, sem materiais]"
}

REGRA FUNDAMENTAL DE ADAPTACAO: preserve o formato e a natureza pedagogica da atividade original (identificada na analise acima). Nao transforme um caca-palavras, cruzadinha, atividade de ligar, completar ou colorir em uma lista generica de perguntas, salvo impossibilidade pedagogica explicita. Adapte dificuldade, linguagem, quantidade e suporte visual mantendo a estrutura central.

Regras: descricao_folha max. 150 palavras, NO MAXIMO 2 a 3 questoes curtas (texto extenso em imagem gerada por IA tende a sair com erros de ortografia). Preserve o objetivo pedagogico original. Folha branca, limpa, com quadros simples, poucas cores e imagens pequenas apenas quando ajudam. Nao inclua guia do professor, metodologia, materiais ou explicacoes pedagogicas na folha do aluno. No Alinhamento BNCC: nunca inventar codigo — usar "Sugerido — validar com o professor" quando nao houver certeza. Portugues correto. Apenas JSON.`;
}

function buildOpenAIActivityImagePrompt(
  topic:        string,
  targetType:   TargetType,
  anoSerie:     string,
  studentCtx:   string,
  studentName:  string,
  descricaoFolha: string,
  mode:         'visual' | 'premium',
): string {
  const tipoAtividade = targetType === 'turma_geral'
    ? 'Turma geral'
    : 'Adaptada para aluno específico';
  const publicoAlvo = targetType === 'turma_geral'
    ? `Turma do ${anoSerie || 'Ensino Fundamental'}`
    : studentName || 'Aluno com necessidades educacionais especiais';
  const adaptacaoLine = targetType === 'adaptada' && studentCtx
    ? `\nNecessidade de adaptação: ${studentCtx.split('\n').slice(0, 3).join('; ')}`
    : '';
  const maxPages = mode === 'premium' ? '2 páginas' : '1 página';

  return `${A4_WORKSHEET_STYLE_PROMPT}.

Contexto da atividade:
- Tipo: ${tipoAtividade}
- Tema: ${topic}
- Ano/série: ${anoSerie || 'Ensino Fundamental'}
- Público-alvo: ${publicoAlvo}${adaptacaoLine}

Conteúdo aprovado para a folha:
${descricaoFolha || topic}

Regras visuais obrigatórias:
- Fundo totalmente branco
- Cabeçalho topo: campos Nome / Data / Turma com linha para preenchimento manual
- Título grande e chamativo logo abaixo do cabeçalho
- NO MÁXIMO 2 a 3 questões curtas numeradas, cada uma em quadro próprio com borda fina cinza ou petróleo — priorize ilustração/decoração pedagógica ao restante do espaço em vez de mais texto
- No máximo 3 cores em toda a folha
- Imagens pequenas e educativas apenas ao lado de questões que precisam de apoio visual
- Linhas horizontais claras para resposta do aluno em cada questão
- Fonte grande, legível e de alto contraste
- Rodapé discreto com "IncluiLAB"
- Máximo ${maxPages}
- Aparência de material didático pronto para imprimir e vender

Checkpoint 4E — atenção especial a ortografia: modelos de geração de imagem
frequentemente erram a grafia de textos longos. Por isso:
- Prefira MENOS texto, bem espaçado, a mais texto compacto.
- Cada palavra do enunciado deve ser curta, comum e sem acentuação rara.
- Nunca invente texto além do fornecido em "Conteúdo aprovado para a folha" acima.

Proibido na folha do aluno:
- Objetivo pedagógico, metodologia, materiais ou guia do professor
- Blocos coloridos enormes ou degradês
- Texto sobreposto a imagens
- Texto cortado nas bordas ou reticências
- Numeração repetida
- Qualquer idioma diferente do Português do Brasil`;
}

// ─── Fallback de conteúdo para modos visual/premium ───────────────────────────
// Extrai uma seção do markdown do guia pedagógico delimitada por "## Heading".
function extractGuiaSectionText(guia: string, heading: string): string {
  if (!guia) return '';
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`##\\s*${escaped}[^\n]*\n([\\s\\S]*?)(?=\n##|$)`, 'i');
  const match = guia.match(regex);
  if (!match) return '';
  return match[1]
    .replace(/\*\*/g, '')
    .split('\n')
    .map((l: string) => l.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5)
    .join(' ')
    .trim();
}

// Tenta extrair questões estruturadas do campo descricao_folha (padrão "QUESTAO N:").
// Se não encontrar, gera fallback pedagógico genérico baseado no tema.
function parseQuestoesFromDescricao(
  descricao: string,
  topic: string,
): Array<{ number: number; kind: string; statement: string; options: string[]; answerLines: number }> {
  const questoes: Array<{ number: number; kind: string; statement: string; options: string[]; answerLines: number }> = [];

  if (descricao) {
    const re = /QUEST[AÃ]O\s*(\d+)\s*[:\-–]\s*([^;.QUEST\n]{8,160})/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(descricao)) !== null && questoes.length < 5) {
      const stmt = m[2].trim().replace(/\s+/g, ' ');
      if (stmt.length > 8) {
        questoes.push({ number: parseInt(m[1], 10), kind: 'short_answer', statement: stmt, options: [], answerLines: 3 });
      }
    }
  }

  if (questoes.length === 0) {
    const fallbacks = [
      `O que você sabe sobre "${topic}"?`,
      `Escreva com suas palavras o que aprendeu nesta atividade.`,
      `Complete: O tema desta atividade é ________________.`,
      `Dê um exemplo relacionado ao tema estudado.`,
      `Escreva uma frase usando o que você estudou.`,
    ];
    fallbacks.forEach((stmt, i) => {
      questoes.push({ number: i + 1, kind: 'short_answer', statement: stmt, options: [], answerLines: 3 });
    });
  }

  return questoes;
}

// Constrói um IncluiLabActivityContent útil e renderizável para os modos visual/premium,
// usando os dados já retornados pelo Gemini (guia + descricao_folha).
// Garante que o fallback HTML seja pedagogicamente válido quando a imagem falhar ou estiver ausente.
function buildFallbackActivityContentFromVisualPayload(
  parsed: GuiaConteudoResult,
  topic: string,
  targetType: TargetType,
  anoSerie: string,
): Record<string, unknown> {
  const objetivo = extractGuiaSectionText(parsed.guia_pedagogico, 'Objetivo da Aula')
    || extractGuiaSectionText(parsed.guia_pedagogico, 'Objetivo')
    || `Desenvolver competências relacionadas ao tema: ${topic}.`;

  const adaptacoes = extractGuiaSectionText(parsed.guia_pedagogico, 'Adaptações Inclusivas')
    || extractGuiaSectionText(parsed.guia_pedagogico, 'Dicas de Media');

  const questoes = parseQuestoesFromDescricao(parsed.descricao_folha, topic);

  const subtitleParts: string[] = [];
  if (anoSerie) subtitleParts.push(anoSerie);
  if (targetType === 'turma_geral') subtitleParts.push('Turma geral');

  const sections: unknown[] = [
    { type: 'info_box', title: 'Objetivo', content: objetivo.slice(0, 220) },
    { type: 'questions', title: 'Atividades', items: questoes },
  ];

  if (adaptacoes) {
    sections.push({ type: 'info_box', title: 'Orientação', content: adaptacoes.slice(0, 180) });
  }

  return {
    title: parsed.titulo_atividade || topic.slice(0, 60),
    subtitle: subtitleParts.join(' · '),
    subject: '',
    grade: anoSerie,
    studentFields: ['Nome', 'Turma', 'Data'],
    introText: 'Leia as orientações e responda cada atividade com atenção.',
    sections,
    visualStyle: {
      theme: 'school_clean',
      background: 'white',
      border: 'discreet',
      illustrations: 'small_colored',
      density: 'balanced',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

const LegacyA4MarkdownRenderer: React.FC<{ content: string; studentName?: string }> = ({ content, studentName }) => {
  const lines = content.split('\n');
  const titleLine = lines.find(l => l.startsWith('# '));
  const title = titleLine ? titleLine.replace(/^#+\s*/, '') : 'Atividade';

  const components = {
    h1: ({ children }: any) => (
      <div style={{
        background: `linear-gradient(135deg, ${C.petrol} 0%, #2a6880 100%)`,
        borderRadius: '12px 12px 0 0',
        padding: '24px 28px 20px',
        margin: '-32px -28px 28px',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain size={20} color="#fff" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 10, opacity: 0.75, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              IncluiLAB · Atividade Pedagógica Inclusiva
            </p>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>{children}</h1>
          </div>
        </div>
        {studentName && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.15)', borderRadius: 20,
            padding: '4px 12px', fontSize: 11, fontWeight: 600,
          }}>
            <UserIcon size={11} /> Para: {studentName}
          </div>
        )}
      </div>
    ),
    h2: ({ children }: any) => {
      const text = String(children);
      const Icon = getSectionIcon(text);
      return (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          margin: '24px 0 12px',
          paddingBottom: 8,
          borderBottom: `2px solid ${C.border}`,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: C.light,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon size={14} color={C.petrol} />
          </div>
          <h2 style={{
            margin: 0, fontSize: 14, fontWeight: 800,
            color: C.dark, letterSpacing: '-0.01em',
          }}>{children}</h2>
        </div>
      );
    },
    h3: ({ children }: any) => (
      <h3 style={{ margin: '16px 0 8px', fontSize: 13, fontWeight: 700, color: C.petrol }}>{children}</h3>
    ),
    p: ({ children }: any) => (
      <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.7, color: '#2a2a2a' }}>{children}</p>
    ),
    ul: ({ children }: any) => (
      <ul style={{ margin: '8px 0 16px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol style={{ margin: '8px 0 16px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</ol>
    ),
    li: ({ children }: any) => (
      <li style={{ fontSize: 13, lineHeight: 1.6, color: '#2a2a2a' }}>{children}</li>
    ),
    strong: ({ children }: any) => (
      <strong style={{ fontWeight: 700, color: C.dark }}>{children}</strong>
    ),
    blockquote: ({ children }: any) => (
      <blockquote style={{
        margin: '12px 0', padding: '12px 16px',
        background: '#FFF8E7', border: `1px solid #F0D080`,
        borderLeft: `4px solid ${C.gold}`, borderRadius: '0 8px 8px 0',
        fontSize: 13, color: '#5a4000',
      }}>{children}</blockquote>
    ),
    hr: () => <hr style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '20px 0' }} />,
  };

  return (
    <div style={{
      background: '#fff', borderRadius: 12,
      padding: '40px 44px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
      minHeight: 700, maxWidth: 900, margin: '0 auto',
      fontFamily: "'Segoe UI', Arial, sans-serif",
    }}>
      <div className="prose" style={{ maxWidth: '100%' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

// ─── Componente: Botão padrão ──────────────────────────────────────────────────
const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'success' | 'ghost';
  size?: 'sm' | 'md';
  icon?: React.ElementType;
}> = ({ variant = 'default', size = 'md', icon: Icon, children, style, ...rest }) => {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
    border: 'none', borderRadius: size === 'sm' ? 8 : 10, fontWeight: 600,
    transition: 'all 0.15s', outline: 'none', flexShrink: 0,
    padding: size === 'sm' ? '6px 12px' : '9px 18px',
    fontSize: size === 'sm' ? 12 : 13,
  };
  const variants: Record<string, React.CSSProperties> = {
    default: { background: C.surface, border: `1px solid ${C.border}`, color: C.dark },
    primary: { background: C.petrol, color: '#fff' },
    success: { background: C.greenBg, border: `1px solid ${C.greenBorder}`, color: C.green },
    ghost:   { background: 'transparent', color: C.sec },
  };
  return (
    <button style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {Icon && <Icon size={size === 'sm' ? 12 : 14} />}
      {children}
    </button>
  );
};

// ─── Componente: Seletor de aluno ──────────────────────────────────────────────
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

    let ctx = [`Aluno: ${student.name}`];
    if ((student as any).grade)          ctx.push(`Ano/Série: ${(student as any).grade}`);
    if (student.diagnosis?.length)        ctx.push(`Diagnóstico(s): ${student.diagnosis.join(', ')}`);
    if (student.supportLevel)             ctx.push(`Nível de suporte: ${student.supportLevel}`);
    if (student.difficulties?.length)     ctx.push(`Dificuldades: ${student.difficulties.join('; ')}`);
    let ctxText = ctx.join('\n');

    try {
      setFetching(true);
      const full = await StudentContextService.buildContext(id);
      if (StudentContextService.hasData(full)) ctxText = StudentContextService.toPromptText(full);
    } catch { /* usa básico */ } finally { setFetching(false); }

    onChange(id, ctxText, student.name);
  };

  const selected = students.find(s => s.id === selectedId);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative' }}>
        <select
          value={selectedId}
          onChange={e => handleChange(e.target.value)}
          disabled={fetching}
          style={{
            padding: '6px 32px 6px 32px', borderRadius: 20, fontSize: 13,
            border: `1.5px solid ${selectedId ? C.petrol : C.border}`,
            background: selectedId ? C.light : C.surface,
            color: selectedId ? C.petrol : C.sec,
            fontWeight: selectedId ? 600 : 400,
            outline: 'none', cursor: 'pointer', appearance: 'none',
          }}
        >
          <option value="">Nenhum aluno</option>
          {students.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}{s.diagnosis?.length ? ` · ${s.diagnosis[0]}` : ''}
            </option>
          ))}
        </select>
        <UserIcon size={13} color={selectedId ? C.petrol : C.sec} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <ChevronDown size={12} color={C.sec} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
      </div>
      {fetching && <Loader size={12} color={C.sec} style={{ animation: 'spin 1s linear infinite' }} />}
      {selected && !fetching && (
        <span style={{ fontSize: 11, color: C.green, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
          <CheckCircle size={11} /> contexto carregado
        </span>
      )}
    </div>
  );
};

// ─── Componente: Créditos discreto ────────────────────────────────────────────
const CreditsChip: React.FC<{
  available?: number;
  onNavigate?: (view: string) => void;
}> = ({ available, onNavigate }) => {
  const safeAvail = Math.max(0, Number(available ?? 0));
  return (
    <button
      onClick={() => onNavigate?.('subscription')}
      title="Gerenciar créditos"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: '4px 9px', borderRadius: 999, cursor: 'pointer',
        background: C.bg,
        border: `1px solid ${C.border}`,
        color: C.dark,
        fontWeight: 800, fontSize: 12, lineHeight: 1, outline: 'none',
        transition: 'all 0.15s', flexShrink: 0,
      }}
    >
      {available !== undefined ? safeAvail : '0'} cr
    </button>
  );
};

// ─── Componente: Sidebar Biblioteca ───────────────────────────────────────────

const LibrarySidebar: React.FC<{
  activities:  any[];
  loading:     boolean;
  selectedId?: string;
  onSelect:    (act: any) => void;
  onDelete:    (id: string) => void;
}> = ({ activities, loading, selectedId, onSelect, onDelete }) => {
  const [recentOpen, setRecentOpen] = useState(true);
  const [savedOpen,  setSavedOpen]  = useState(true);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const recent = activities.filter(a => new Date(a.created_at) >= cutoff);
  const older  = activities.filter(a => new Date(a.created_at) < cutoff);

  const ActivityItem: React.FC<{ act: any }> = ({ act }) => (
    <div
      onClick={() => onSelect(act)}
      style={{
        padding: '11px 14px', borderRadius: 8, cursor: 'pointer',
        background: selectedId === act.id ? C.light : 'transparent',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (selectedId !== act.id) (e.currentTarget as HTMLElement).style.background = '#FAFAF8'; }}
      onMouseLeave={e => { if (selectedId !== act.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: act.image_url ? '#EDE9FE' : C.light,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {act.image_url
          ? <FileImage size={15} color="#7C3AED" />
          : <FileText size={15} color={C.petrol} />
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.dark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {act.title || 'Atividade'}
        </p>
        <p style={{ margin: '3px 0 0', fontSize: 11, color: C.sec }}>
          {new Date(act.created_at).toLocaleDateString('pt-BR')}
          {act.tags?.length ? ` · ${act.tags[0]}` : ''}
        </p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(act.id); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 6, color: '#ddd', flexShrink: 0 }}
        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#ddd'}
      >
        <Trash2 size={11} />
      </button>
    </div>
  );

  const SectionHeader: React.FC<{ label: string; icon: React.ElementType; count: number; open: boolean; toggle: () => void }> = ({ label, icon: Icon, count, open, toggle }) => (
    <button onClick={toggle} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      width: '100%', background: 'none', border: 'none', cursor: 'pointer',
      padding: '10px 12px 6px', textAlign: 'left',
    }}>
      <Icon size={12} color={C.sec} />
      <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: C.sec, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </span>
      {count > 0 && (
        <span style={{ fontSize: 10, fontWeight: 700, color: C.sec, background: C.border, borderRadius: 20, padding: '1px 6px' }}>
          {count}
        </span>
      )}
      {open ? <ChevronDown size={11} color={C.sec} /> : <ChevronRight size={11} color={C.sec} />}
    </button>
  );

  return (
    <div style={{
      width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderRight: `1px solid ${C.border}`, background: C.surface,
      height: '100%', overflow: 'hidden', minHeight: 0, maxHeight: '100%',
    }}>
      {/* Header sidebar */}
      <div style={{ padding: '18px 16px 14px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookMarked size={16} color={C.petrol} />
          <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>Biblioteca</span>
          {activities.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: C.sec, background: C.bg, borderRadius: 20, padding: '2px 8px' }}>
              {activities.length}
            </span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80 }}>
            <Loader size={16} color={C.sec} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}

        {!loading && activities.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <BookMarked size={28} color={C.border} style={{ margin: '0 auto 8px' }} />
            <p style={{ margin: 0, fontSize: 12, color: C.sec }}>Nenhuma atividade salva.</p>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: C.border, lineHeight: 1.5 }}>
              Gere e salve para criar sua biblioteca.
            </p>
          </div>
        )}

        {!loading && recent.length > 0 && (
          <>
            <SectionHeader label="Recentes" icon={Clock} count={recent.length} open={recentOpen} toggle={() => setRecentOpen(v => !v)} />
            {recentOpen && (
              <div style={{ padding: '0 4px' }}>
                {recent.map(act => <ActivityItem key={act.id} act={act} />)}
              </div>
            )}
          </>
        )}

        {!loading && older.length > 0 && (
          <>
            <SectionHeader label="Salvos" icon={Star} count={older.length} open={savedOpen} toggle={() => setSavedOpen(v => !v)} />
            {savedOpen && (
              <div style={{ padding: '0 4px' }}>
                {older.map(act => <ActivityItem key={act.id} act={act} />)}
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
};

// ─── Componente: Preflight de créditos ───────────────────────────────────────
const PreflightPanel: React.FC<{
  mode: GenerationMode;
  maxCost: number;
  creditsAvailable?: number;
  topic: string;
  fileName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ mode, maxCost, creditsAvailable, topic, fileName, onConfirm, onCancel }) => {
  const cfg = getModeConfig(mode);
  const isVisual = mode === 'a4_visual' || mode === 'adaptar_visual';
  const hasEnough = creditsAvailable === undefined || creditsAvailable >= maxCost;
  const hasBase = creditsAvailable === undefined || creditsAvailable >= (
    mode === 'a4_visual' ? INCLUILAB_ACTIVITY_COSTS.A4_VISUAL_BASE :
    mode === 'adaptar_visual' ? INCLUILAB_ACTIVITY_COSTS.ADAPTAR_VISUAL_BASE : maxCost
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 420, padding: '40px 32px' }}>
      <div style={{ background: C.surface, borderRadius: 20, padding: '32px 36px', maxWidth: 520, width: '100%', boxShadow: '0 4px 32px rgba(0,0,0,0.10)', border: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FFF8E7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Coins size={22} color={C.gold} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: C.sec, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Confirmar geração</p>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.dark }}>{cfg.label}</h3>
          </div>
        </div>

        {(topic || fileName) && (
          <div style={{ background: C.bg, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: C.dark, display: 'flex', alignItems: 'center', gap: 6 }}>
            {fileName && <Paperclip size={13} color={C.sec} />}
            <span style={{ color: C.sec, fontSize: 11, fontWeight: 600 }}>{fileName ? 'Arquivo:' : 'Tema:'} </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName ?? topic}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '14px 0', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, marginBottom: 16, gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: C.sec }}>Custo {isVisual ? 'máximo estimado' : 'desta ação'}</p>
            <p style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 900, color: C.gold, lineHeight: 1 }}>
              {maxCost} <span style={{ fontSize: 14, fontWeight: 700 }}>créditos</span>
            </p>
            {isVisual && (
              <p style={{ margin: '4px 0 0', fontSize: 10, color: C.sec, lineHeight: 1.4 }}>
                Imagens que falharem não são cobradas — você paga apenas o que for gerado.
              </p>
            )}
          </div>
          {creditsAvailable !== undefined && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ margin: 0, fontSize: 11, color: C.sec }}>Seu saldo</p>
              <p style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 900, color: hasEnough ? C.green : hasBase ? C.gold : '#DC2626', lineHeight: 1 }}>
                {creditsAvailable} <span style={{ fontSize: 14, fontWeight: 700 }}>créditos</span>
              </p>
            </div>
          )}
        </div>

        {isVisual && !hasEnough && hasBase && (
          <div style={{ background: '#FFF8E7', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#7C5800', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Saldo abaixo do máximo — a atividade será gerada, mas o número de imagens IA pode ser reduzido para caber no seu saldo.</span>
          </div>
        )}
        {!hasBase && (
          <div style={{ background: '#FEF2F2', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#991B1B', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>Saldo insuficiente. Recarregue créditos para continuar.</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="default" style={{ flex: 1 }} onClick={onCancel}>Cancelar</Btn>
          <Btn
            variant="primary"
            icon={Sparkles}
            style={{ flex: 2, opacity: hasBase ? 1 : 0.5 }}
            onClick={onConfirm}
            disabled={!hasBase}
          >
            Confirmar e Gerar
          </Btn>
        </div>
      </div>
    </div>
  );
};

// ─── Componente: Preview fake (mock) ─────────────────────────────────────────
const MockActivityPreview: React.FC = () => (
  <div style={{
    position: 'relative',
    width: 430,
    maxWidth: 'min(88vw, 430px)',
    pointerEvents: 'none',
    userSelect: 'none',
  }}>
    <div style={{
      position: 'absolute',
      inset: '18px -16px -18px 18px',
      borderRadius: 18,
      background: '#EEF2F7',
      border: `1px solid ${C.border}`,
      transform: 'rotate(2deg)',
    }} />
    <div style={{
      position: 'absolute',
      inset: '8px -8px -8px 10px',
      borderRadius: 18,
      background: '#fff',
      border: `1px solid ${C.border}`,
      transform: 'rotate(0.8deg)',
      boxShadow: '0 16px 40px rgba(15,23,42,0.08)',
    }} />
    <div style={{
      position: 'relative',
      background: '#fff',
      borderRadius: 18,
      boxShadow: '0 24px 70px rgba(15,23,42,0.16)',
      border: `1px solid ${C.border}`,
      overflow: 'hidden',
      transform: 'rotate(-0.35deg)',
    }}>
      <div style={{ padding: '18px 20px 14px', background: '#F8FAFC', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <span style={{
            fontSize: 9, fontWeight: 900, color: C.petrol,
            textTransform: 'uppercase', letterSpacing: '0.12em',
          }}>
            Preview premium
          </span>
          <span style={{ fontSize: 10, fontWeight: 900, color: '#64748B' }}>IncluiLAB</span>
        </div>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.dark, lineHeight: 1.15 }}>
          Fracoes com apoio visual
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {['3o ano EF', 'TEA nivel 1', 'A4 acessivel'].map(item => (
            <span key={item} style={{
              fontSize: 10, fontWeight: 800, color: '#334155',
              background: '#fff', border: `1px solid ${C.border}`,
              borderRadius: 999, padding: '4px 8px',
            }}>
              {item}
            </span>
          ))}
        </div>
      </div>

      <div style={{ padding: 18 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 0.9fr',
          gap: 12,
          marginBottom: 12,
        }}>
          <div style={{
            minHeight: 118,
            borderRadius: 14,
            background: '#FFF7ED',
            border: '1px solid #FED7AA',
            padding: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#9A3412', marginBottom: 10 }}>
              1. Pinte metade da pizza
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <svg width="74" height="74" viewBox="0 0 74 74" aria-hidden="true">
                <circle cx="37" cy="37" r="32" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2" />
                <path d="M37 37 L37 5 A32 32 0 0 1 37 69 Z" fill="#FCD34D" stroke="#D97706" strokeWidth="1.5" />
                <line x1="37" y1="5" x2="37" y2="69" stroke="#B45309" strokeWidth="2" />
                <circle cx="26" cy="24" r="3" fill="#DC2626" />
                <circle cx="45" cy="48" r="3" fill="#DC2626" />
              </svg>
              <div style={{ flex: 1 }}>
                <div style={{ height: 8, borderRadius: 999, background: '#FDBA74', width: '88%', marginBottom: 8 }} />
                <div style={{ height: 8, borderRadius: 999, background: '#FED7AA', width: '64%', marginBottom: 14 }} />
                <div style={{ height: 1, background: '#FDBA74', marginBottom: 9 }} />
                <div style={{ height: 1, background: '#FDBA74' }} />
              </div>
            </div>
          </div>

          <div style={{
            minHeight: 118,
            borderRadius: 14,
            background: '#ECFDF5',
            border: '1px solid #BBF7D0',
            padding: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#166534', marginBottom: 10 }}>
              Rotina visual
            </div>
            {['Observe', 'Escolha', 'Responda'].map((step, idx) => (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: idx === 2 ? 0 : 9 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 7,
                  background: '#16A34A', color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900,
                }}>
                  {idx + 1}
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#14532D' }}>{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          borderRadius: 14,
          border: `1px solid ${C.border}`,
          padding: '13px 14px',
          background: '#FFFFFF',
        }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: C.dark, marginBottom: 10 }}>
            2. Marque a resposta correta
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {['1/2', '1/3', '1/4'].map((item, idx) => (
              <div key={item} style={{
                flex: 1,
                height: 38,
                borderRadius: 10,
                border: `1px solid ${idx === 0 ? C.petrol : C.border}`,
                background: idx === 0 ? '#EAF4F7' : '#F8FAFC',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: idx === 0 ? C.petrol : '#475569',
                fontSize: 14, fontWeight: 900,
              }}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', background: '#F8FAFC', borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 10, color: '#64748B', fontWeight: 750 }}>Nome: __________________</span>
        <span style={{ fontSize: 10, color: C.petrol, fontWeight: 900 }}>pronto para PDF</span>
      </div>
    </div>
  </div>
);

// ─── Componente: Estado vazio ─────────────────────────────────────────────────
const EmptyState: React.FC<{
  studentCtx:   string;
  studentName:  string;
  onSuggestion: (text: string) => void;
}> = ({ studentCtx, studentName, onSuggestion }) => {
  const SUGGESTIONS = [
    'Atividade de frações para 3º ano',
    'Leitura e interpretação sobre animais',
    'Matemática lúdica com contagem',
    'Produção de texto com apoio visual',
    'Sequência lógica para TEA',
    'Reconhecimento de letras e sílabas',
  ];
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '100%',
      padding: '28px 32px 20px', gap: 18,
      boxSizing: 'border-box',
    }}>
      {/* Mock preview */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        <MockActivityPreview />
      </div>

      {/* Texto contextual */}
      <div style={{ textAlign: 'center', maxWidth: 620 }}>
        <p style={{ margin: 0, fontSize: 13, color: C.sec, lineHeight: 1.6 }}>
          {studentCtx
            ? <>Contexto de <strong style={{ color: C.petrol }}>{studentName}</strong> carregado — atividade será personalizada para este aluno.</>
            : 'Descreva o tema no campo abaixo e receba uma atividade inclusiva pronta para imprimir.'
          }
        </p>
      </div>

      {/* Sugestões como chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 560 }}>
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            style={{
              padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
              background: '#fff', border: `1px solid ${C.border}`,
              color: '#374151', fontSize: 12, fontWeight: 500,
              transition: 'all 0.15s', outline: 'none',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.petrol; (e.currentTarget as HTMLElement).style.background = C.light; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.background = '#fff'; }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};

const VISUAL_STYLE_OPTIONS: { id: ActivityVisualStyle; label: string; emoji: string }[] = [
  { id: 'fundamental', label: 'Clean', emoji: '📄' },
  { id: 'infantil',    label: 'Colorido', emoji: '🎨' },
  { id: 'pb',          label: 'P&B', emoji: '🖨️' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// NOVA UI (estilo chat) — controlada por INCLUILAB_NEW_UI em src/config/incluilabUi.ts
// Componentes abaixo NÃO substituem os legados acima; são usados apenas quando
// o flag está ativo. Reaproveitam os mesmos handlers/estado do componente principal.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Componente novo: Estado vazio (conversa livre) ───────────────────────────
// Sprint 2B — "Criar relatório" foi removido intencionalmente desta lista.
// O Document Pipeline (que atenderia relatório) ainda não existe; a UI não deve
// oferecer uma capacidade que o motor não entrega. Reintroduzir apenas quando
// o Document Pipeline estiver implementado (ver arquitetura: Intent Router →
// Activity Pipeline → Document Pipeline → Image Pipeline).
const CAPABILITY_SUGGESTIONS: { icon: React.ElementType; label: string }[] = [
  { icon: FileText,      label: 'Criar atividade' },
  { icon: CheckCircle,   label: 'Criar avaliação' },
  { icon: Layers,        label: 'Adaptar material' },
  { icon: FileImage,     label: 'Criar imagem' },
];

const EmptyStateChat: React.FC<{
  studentCtx:   string;
  studentName:  string;
  onSuggestion: (text: string) => void;
  onCapability: (label: string) => void;
}> = ({ studentCtx, studentName, onSuggestion, onCapability }) => {
  const TOPIC_SUGGESTIONS = [
    'Atividade de frações para 3º ano',
    'Leitura e interpretação sobre animais',
    'Sequência lógica para TEA',
    'Reconhecimento de letras e sílabas',
  ];
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '100%', padding: '40px 24px', gap: 22,
      boxSizing: 'border-box',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: `linear-gradient(135deg, ${C.petrol}, #2a6880)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(31,78,95,0.25)',
      }}>
        <Sparkles size={26} color="#fff" />
      </div>

      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: C.dark }}>
          O que você quer criar hoje?
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, color: C.sec, lineHeight: 1.6 }}>
          {studentCtx
            ? <>Contexto de <strong style={{ color: C.petrol }}>{studentName}</strong> carregado — descreva o que precisa e o IncluiLAB personaliza para este aluno.</>
            : 'Descreva livremente: uma atividade, uma adaptação, um relatório ou uma imagem. Não é preciso escolher nada antes.'
          }
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 560 }}>
        {CAPABILITY_SUGGESTIONS.map(cap => (
          <button
            key={cap.label}
            onClick={() => onCapability(cap.label)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 14, cursor: 'pointer',
              background: '#fff', border: `1px solid ${C.border}`,
              color: C.dark, fontSize: 13, fontWeight: 700,
              transition: 'all 0.15s', outline: 'none',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.petrol; (e.currentTarget as HTMLElement).style.background = C.light; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.background = '#fff'; }}
          >
            <cap.icon size={15} color={C.petrol} /> {cap.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 520 }}>
        {TOPIC_SUGGESTIONS.map(s => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            style={{
              padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
              background: C.light, border: `1px solid ${C.border}`,
              color: '#475569', fontSize: 11.5, fontWeight: 500,
              transition: 'all 0.15s', outline: 'none',
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Componente novo: Composer simplificado (opções avançadas colapsadas) ─────
const ChatComposer: React.FC<{
  inputText:    string;
  genMode:      GenerationMode;
  pendingFile:  AttachedFile | null;
  isGenerating: boolean;
  visualStyle:  ActivityVisualStyle;
  targetType:   TargetType;
  anoSerie:     string;
  studentId:    string;
  studentName:  string;
  students:     Student[];
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  onInput:      (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown:    (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onModeChange: (m: GenerationMode) => void;
  onStyleChange:(s: ActivityVisualStyle) => void;
  onTargetTypeChange: (t: TargetType) => void;
  onAnoSerieChange:   (v: string) => void;
  onStudentChange:    (id: string, ctx: string, name: string) => void;
  onSend:       () => void;
  onFileClick:  () => void;
  onRemoveFile: () => void;
  textAreaRef:  React.RefObject<HTMLTextAreaElement | null>;
}> = ({
  inputText, genMode, pendingFile, isGenerating, visualStyle,
  targetType, anoSerie, studentId, studentName, students,
  advancedOpen, onToggleAdvanced,
  onInput, onKeyDown, onModeChange, onStyleChange,
  onTargetTypeChange, onAnoSerieChange, onStudentChange,
  onSend, onFileClick, onRemoveFile, textAreaRef,
}) => {
  const adaptarAtivo = isAdaptarMode(genMode);
  const canSend = !isGenerating && (adaptarAtivo ? !!pendingFile : !!inputText.trim());
  const placeholder = adaptarAtivo
    ? (pendingFile ? 'Instruções opcionais: "adaptar para TEA", "simplificar"…' : 'Clique em Anexar para selecionar o arquivo a adaptar')
    : 'Descreva o que você precisa: uma atividade, uma adaptação, um relatório, uma imagem…';
  const contextLabel = studentId && studentName ? studentName : 'Sem aluno selecionado';

  const miniSelectStyle: React.CSSProperties = {
    height: 30, padding: '0 10px', borderRadius: 9,
    border: `1px solid ${C.border}`, background: '#fff',
    color: C.dark, fontSize: 12, fontWeight: 650,
    fontFamily: 'inherit', outline: 'none', cursor: isGenerating ? 'default' : 'pointer',
  };

  return (
    <div style={{
      flexShrink: 0, position: 'sticky', bottom: 0, zIndex: 20,
      borderTop: `1px solid ${C.border}`, background: C.surface,
      padding: '10px 20px 14px',
    }}>
      {/* Painel "Mais opções" — colapsado por padrão */}
      {advancedOpen && (
        <div style={{
          marginBottom: 10, padding: 12, borderRadius: 12,
          background: C.light, border: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: C.sec, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Formato
            </span>
            <select
              value={adaptarAtivo ? '' : genMode}
              disabled={isGenerating}
              onChange={e => e.target.value && onModeChange(e.target.value as GenerationMode)}
              style={{ ...miniSelectStyle, color: C.petrol }}
            >
              <option value="" disabled>Criar…</option>
              {MODES_CRIAR.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <select
              value={adaptarAtivo ? genMode : ''}
              disabled={isGenerating}
              onChange={e => e.target.value && onModeChange(e.target.value as GenerationMode)}
              style={{ ...miniSelectStyle, color: '#8A5D00' }}
            >
              <option value="" disabled>Adaptar…</option>
              {MODES_ADAPTAR.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <select
              value={visualStyle}
              disabled={isGenerating}
              onChange={e => onStyleChange(e.target.value as ActivityVisualStyle)}
              style={miniSelectStyle}
            >
              {VISUAL_STYLE_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.emoji} {opt.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: C.sec, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Contexto do aluno (opcional)
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', borderRadius: 20, padding: '2px', border: `1.5px solid ${C.border}` }}>
              {(['turma_geral', 'adaptada'] as TargetType[]).map(t => (
                <button
                  key={t}
                  onClick={() => {
                    onTargetTypeChange(t);
                    if (t === 'turma_geral') onStudentChange('', '', '');
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 18, border: 'none', cursor: 'pointer',
                    background: targetType === t ? C.petrol : 'transparent',
                    color: targetType === t ? '#fff' : C.sec,
                    fontWeight: 600, fontSize: 11, transition: 'all 0.15s', outline: 'none',
                  }}
                >
                  {t === 'turma_geral' ? 'Turma geral' : 'Aluno específico'}
                </button>
              ))}
            </div>
            {targetType === 'adaptada'
              ? <StudentSelector students={students} selectedId={studentId} onChange={onStudentChange} />
              : (
                <input
                  type="text"
                  value={anoSerie}
                  onChange={e => onAnoSerieChange(e.target.value)}
                  placeholder="Ano/Série (ex: 3º ano EF)"
                  style={{ ...miniSelectStyle, width: 170 }}
                />
              )
            }
          </div>
        </div>
      )}

      {/* Input box */}
      <div style={{
        minHeight: 84, display: 'flex', flexDirection: 'column',
        background: '#fff', border: `1px solid ${isGenerating ? C.border : '#CBD5E1'}`,
        borderRadius: 16, overflow: 'hidden',
        boxShadow: isGenerating ? 'none' : '0 8px 22px rgba(15,23,42,0.07)',
        transition: 'all 0.2s', boxSizing: 'border-box',
      }}>
        <textarea
          ref={textAreaRef}
          value={inputText}
          onChange={onInput}
          onKeyDown={onKeyDown}
          placeholder={isGenerating ? 'Aguarde, gerando…' : placeholder}
          disabled={isGenerating}
          rows={1}
          style={{
            flex: '1 1 auto', width: '100%', height: 46, minHeight: 0, maxHeight: 46,
            border: 'none', outline: 'none', resize: 'none',
            padding: '12px 16px 0', fontSize: 13.5, lineHeight: 1.35, fontFamily: 'inherit',
            background: 'transparent', color: C.dark, boxSizing: 'border-box', overflowY: 'auto',
          }}
        />

        <div style={{ minHeight: 38, flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7, padding: '0 10px 8px 12px', boxSizing: 'border-box' }}>
          <button
            onClick={onFileClick}
            disabled={isGenerating}
            title="Anexar arquivo"
            style={{
              height: 28, background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '0 10px', cursor: isGenerating ? 'default' : 'pointer',
              color: pendingFile ? C.petrol : C.sec,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 750,
            }}
          >
            <Paperclip size={13} /> {pendingFile ? 'Trocar' : 'Anexar'}
          </button>

          <button
            onClick={onToggleAdvanced}
            title="Formato, layout e contexto do aluno"
            style={{
              height: 28, background: advancedOpen ? C.light : C.bg,
              border: `1px solid ${advancedOpen ? C.petrol : C.border}`,
              borderRadius: 8, padding: '0 10px', cursor: 'pointer',
              color: advancedOpen ? C.petrol : C.sec,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 750,
            }}
          >
            <SlidersHorizontal size={13} /> Mais opções
          </button>

          <button
            onClick={onToggleAdvanced}
            title="Definir contexto de aluno"
            style={{
              height: 28, background: studentId ? '#EAF4F7' : C.bg,
              border: `1px solid ${studentId ? C.petrol : C.border}`,
              borderRadius: 20, padding: '0 10px', cursor: 'pointer',
              color: studentId ? C.petrol : C.sec,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 650, maxWidth: 180,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            <UserIcon size={12} /> {contextLabel}
          </button>

          {pendingFile && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              minWidth: 0, maxWidth: 220, height: 26,
              background: C.light, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '0 7px', boxSizing: 'border-box',
            }}>
              {pendingFile.type.startsWith('image/') && pendingFile.previewUrl
                ? <img src={pendingFile.previewUrl} alt="" style={{ width: 17, height: 17, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                : <FileText size={13} color={C.petrol} style={{ flexShrink: 0 }} />
              }
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: C.dark }}>
                {pendingFile.name}
              </span>
              <button onClick={onRemoveFile} title="Remover anexo" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sec, padding: 1, borderRadius: 5, display: 'flex', flexShrink: 0 }}>
                <X size={12} />
              </button>
            </div>
          )}

          <div style={{ flex: 1, minWidth: 8 }} />

          <button
            onClick={onSend}
            disabled={!canSend}
            style={{
              height: 32, display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0 18px', borderRadius: 10, border: 'none',
              background: canSend ? C.petrol : C.border, color: '#fff',
              fontWeight: 800, fontSize: 14, cursor: canSend ? 'pointer' : 'default',
              transition: 'all 0.15s',
              boxShadow: canSend ? '0 5px 14px rgba(31,78,95,0.22)' : 'none',
              flexShrink: 0,
            }}
          >
            {isGenerating
              ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Gerando…</>
              : <><Sparkles size={14} /> Enviar</>
            }
          </button>
        </div>
      </div>

      <p style={{ margin: '6px 2px 0', fontSize: 10, color: C.sec }}>
        Enter para enviar · Shift+Enter nova linha
      </p>
    </div>
  );
};

// ─── Componente: Composer (entrada fixa sempre visível) ───────────────────────
const Composer: React.FC<{
  inputText:    string;
  genMode:      GenerationMode;
  pendingFile:  AttachedFile | null;
  isGenerating: boolean;
  visualStyle:  ActivityVisualStyle;
  onInput:      (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown:    (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onModeChange: (m: GenerationMode) => void;
  onStyleChange:(s: ActivityVisualStyle) => void;
  onSend:       () => void;
  onFileClick:  () => void;
  onRemoveFile: () => void;
  textAreaRef:  React.RefObject<HTMLTextAreaElement | null>;
}> = ({
  inputText, genMode, pendingFile, isGenerating, visualStyle,
  onInput, onKeyDown, onModeChange, onStyleChange, onSend, onFileClick, onRemoveFile, textAreaRef,
}) => {
  const adaptarAtivo = isAdaptarMode(genMode);
  const canSend = !isGenerating && (adaptarAtivo ? !!pendingFile : !!inputText.trim());
  const placeholder = adaptarAtivo
    ? (pendingFile ? 'Instruções opcionais: "adaptar para TEA", "simplificar"…' : 'Clique em Anexar para selecionar a imagem a adaptar')
    : genMode === 'a4_premium'
    ? 'Ex: "Folha sobre formas geométricas, colorida e lúdica para 1º ano"'
    : 'Peça uma atividade adaptada… Ex: "frações para aluno com TEA, 3º ano"';
  const currentMode = getModeConfig(genMode);

  const CompactSelect: React.FC<{
    label: string;
    accent: string;
    value: string;
    title?: string;
    minWidth?: number;
    onChange: (value: string) => void;
    children: React.ReactNode;
  }> = ({ label, accent, value, title, minWidth = 150, onChange, children }) => (
    <label
      title={title}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', gap: 7,
        height: 32, padding: '0 30px 0 10px', borderRadius: 10,
        border: `1px solid ${C.border}`, background: '#fff',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        boxSizing: 'border-box', flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 900, color: accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <select
        value={value}
        disabled={isGenerating}
        onChange={e => onChange(e.target.value)}
        style={{
          minWidth, maxWidth: 210,
          border: 'none', outline: 'none', background: 'transparent',
          color: C.dark, fontSize: 12, fontWeight: 750,
          fontFamily: 'inherit', cursor: isGenerating ? 'default' : 'pointer',
          appearance: 'none', padding: 0,
        }}
      >
        {children}
      </select>
      <ChevronDown size={13} color={C.sec} style={{ position: 'absolute', right: 10, pointerEvents: 'none' }} />
    </label>
  );

  return (
    <div style={{
      flexShrink: 0,
      position: 'sticky',
      bottom: 0,
      zIndex: 20,
      borderTop: `1px solid ${C.border}`,
      background: C.surface,
      padding: '8px 20px 12px',
    }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        <CompactSelect
          label="Criar"
          accent={C.petrol}
          value={adaptarAtivo ? '' : genMode}
          minWidth={156}
          title={!adaptarAtivo ? `${currentMode.desc} · máx. ${currentMode.maxCost} créditos` : 'Modos para criar uma atividade nova'}
          onChange={value => value && onModeChange(value as GenerationMode)}
        >
          <option value="" disabled>Escolher</option>
          {MODES_CRIAR.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </CompactSelect>

        <CompactSelect
          label="Adaptar"
          accent="#8A5D00"
          value={adaptarAtivo ? genMode : ''}
          minWidth={162}
          title={adaptarAtivo ? `${currentMode.desc} · máx. ${currentMode.maxCost} créditos` : 'Modos para adaptar uma atividade enviada'}
          onChange={value => value && onModeChange(value as GenerationMode)}
        >
          <option value="" disabled>Escolher</option>
          {MODES_ADAPTAR.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </CompactSelect>

        <CompactSelect
          label="Layout"
          accent="#2E3A59"
          value={visualStyle}
          minWidth={108}
          title="Estilo visual da folha"
          onChange={value => onStyleChange(value as ActivityVisualStyle)}
        >
          {VISUAL_STYLE_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
        </CompactSelect>
      </div>

      {/* Input box */}
      <div style={{
        height: 80,
        minHeight: 80,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        border: `1px solid ${isGenerating ? C.border : '#CBD5E1'}`,
        borderRadius: 14, overflow: 'hidden',
        boxShadow: isGenerating ? 'none' : '0 8px 22px rgba(15,23,42,0.07)',
        transition: 'all 0.2s',
        boxSizing: 'border-box',
      }}>
        <textarea
          ref={textAreaRef}
          value={inputText}
          onChange={onInput}
          onKeyDown={onKeyDown}
          placeholder={isGenerating ? 'Aguarde, gerando atividade…' : placeholder}
          disabled={isGenerating}
          rows={1}
          style={{
            flex: '1 1 auto',
            width: '100%', height: 42, minHeight: 0, maxHeight: 42,
            border: 'none', outline: 'none', resize: 'none',
            padding: '10px 14px 0',
            fontSize: 13, lineHeight: 1.35, fontFamily: 'inherit',
            background: 'transparent', color: C.dark, boxSizing: 'border-box',
            overflowY: 'auto',
          }}
        />

        <div style={{ height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '0 8px 8px 10px', boxSizing: 'border-box' }}>
          <button
            onClick={onFileClick}
            disabled={isGenerating}
            title="Anexar imagem"
            style={{
              height: 28,
              background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '0 10px', cursor: isGenerating ? 'default' : 'pointer',
              color: pendingFile ? C.petrol : C.sec,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 750,
            }}
          >
            <Paperclip size={13} /> {pendingFile ? 'Trocar' : 'Anexar'}
          </button>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
            {pendingFile ? (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                minWidth: 0, maxWidth: 300, height: 26,
                background: C.light, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '0 7px', boxSizing: 'border-box',
              }}>
                {pendingFile.type.startsWith('image/') && pendingFile.previewUrl
                  ? <img src={pendingFile.previewUrl} alt="" style={{ width: 17, height: 17, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  : <FileText size={13} color={C.petrol} style={{ flexShrink: 0 }} />
                }
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: C.dark }}>
                  {pendingFile.name}
                </span>
                <button onClick={onRemoveFile} title="Remover anexo" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sec, padding: 1, borderRadius: 5, display: 'flex', flexShrink: 0 }}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <span style={{ fontSize: 10, color: C.sec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Enter para enviar · Shift+Enter nova linha
              </span>
            )}
          </div>
          <button
            onClick={onSend}
            disabled={!canSend}
            style={{
              height: 30,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0 16px', borderRadius: 10, border: 'none',
              background: canSend ? C.petrol : C.border,
              color: '#fff', fontWeight: 800, fontSize: 14,
              cursor: canSend ? 'pointer' : 'default',
              transition: 'all 0.15s',
              boxShadow: canSend ? '0 5px 14px rgba(31,78,95,0.22)' : 'none',
              flexShrink: 0,
            }}
          >
            {isGenerating
              ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Gerando…</>
              : <><Sparkles size={14} /> Gerar</>
            }
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Componente: Resultado (workspace) ────────────────────────────────────────
const ResultView: React.FC<{
  result:       GeneratedResult;
  studentName:  string;
  visualStyle?: ActivityVisualStyle;
  onSave:       () => void;
  saving:       boolean;
  onExportJson: () => void;
}> = ({ result, studentName, visualStyle = 'fundamental', onSave, saving, onExportJson }) => {
  const hasImage    = !!result.imageUrl;
  const hasActivity = !!result.contentJson || !!result.activity;
  const hasText     = !!result.contentJson || !!result.activity || !!result.content;
  const hasGuide    = !!result.guiaText || !!(result.activity as any)?.guia_pedagogico;
  // Sprint 2B.3 (item 3): Gabarito é uma projeção própria, separada do Guia.
  // Checkpoint 4E — item "Avaliação sem Gabarito": hasGabarito agora também
  // reconhece o gabarito do pipeline legado (result.legacyAnswerKey), não só
  // o do pipeline canônico (result.activityPackage.answerKey).
  const canonicalAnswerKey = result.activityPackage?.answerKey ?? result.activityPackage?.activity.answerKey;
  const hasGabarito = !!(canonicalAnswerKey?.length && result.activity) || !!result.legacyAnswerKey?.length;
  const saved       = !!result.savedId;
  // Checkpoint 2B.1: pictograma ≠ ilustração real. Se o professor pediu ilustração
  // explicitamente (visualMode 'illustration') e o pipeline canônico só entregou
  // apoio visual (pictograma/emoji, sem imagem real gerada), avisamos com clareza —
  // nunca apresentamos o fallback como se fosse a ilustração pedida.
  const showIllustrationFallbackNotice = !!(
    result.activityPackage &&
    result.activityPackage.metadata.visualMode === 'illustration' &&
    !result.activityPackage.visualAssets.some(a => a.deliveredAs === 'illustration')
  );
  const showIllustrationFallbackNoticeInCard = showIllustrationFallbackNotice ? (
    <div role="status" style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      marginTop: 10, padding: '9px 12px', maxWidth: 460,
      borderRadius: 10, border: '1px solid #FDE68A',
      background: '#FFFBEB', color: '#92400E',
      fontSize: 12.5, lineHeight: 1.5,
    }}>
      <Lightbulb size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>
        Você pediu uma ilustração. Nesta versão, usamos apoio visual com pictogramas.
        A geração de ilustrações reais ainda não está disponível neste modo.
      </span>
    </div>
  ) : null;
  // Checkpoint 4E — item "Adaptação não preserva estrutura": aviso honesto
  // (mesmo padrão do aviso de ilustração acima) quando o material original foi
  // identificado como um tipo que o contrato JSON/renderer atual NÃO consegue
  // de fato reproduzir (caça-palavras/cruzadinha exigem grade de letras — não
  // existe question.kind para isso). Nunca fingimos suportar o que não suportamos.
  const showOriginalTypeUnsupportedNotice = !!(
    result.originalActivityType && !rendererSupportsOriginalType(result.originalActivityType)
  );
  const showOriginalTypeUnsupportedNoticeInCard = showOriginalTypeUnsupportedNotice ? (
    <div role="status" style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      marginTop: 10, padding: '9px 12px', maxWidth: 460,
      borderRadius: 10, border: '1px solid #FDE68A',
      background: '#FFFBEB', color: '#92400E',
      fontSize: 12.5, lineHeight: 1.5,
    }}>
      <Lightbulb size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>
        O material original parece ser um(a) <strong>{result.originalActivityType ? ORIGINAL_ACTIVITY_TYPE_LABELS[result.originalActivityType] : ''}</strong> —
        este formato ainda não é totalmente suportado pelo editor do IncluiLAB. Adaptamos preservando o tema e o objetivo pedagógico,
        mas no formato mais próximo disponível. Recomendamos revisão manual antes de usar em sala.
      </span>
    </div>
  ) : null;
  // Checkpoint 4E — item "Preview": rótulo curto de quantidade para o card
  // compacto (ex.: "10 questões"). Conta itens de seções type==='questions'
  // do contrato legado, ou exercises do ActivitySchema canônico.
  const questionCountFromSections = (result.contentJson?.sections || [])
    .filter(s => s.type === 'questions')
    .reduce((sum, s) => sum + (s.items?.length || 0), 0);
  const questionCount = questionCountFromSections || result.activity?.exercises?.length || 0;
  const questionCountLabel = questionCount > 0 ? `${questionCount} question${questionCount > 1 ? 'ões' : ''}` : null;
  // Refs do modal "Visualizar" (conteúdo em tamanho real, visível sob demanda).
  const folhaAlunoRef    = useRef<HTMLDivElement | null>(null);
  const guiaProfessorRef = useRef<HTMLDivElement | null>(null);
  const gabaritoRef      = useRef<HTMLDivElement | null>(null);
  // Checkpoint 4E — item "PDF/PNG não baixam" (reaberto: a correção via portal
  // da Etapa 4D não resolveu no teste real). Nova causa provável: o preview
  // compacto da 4D envolveu folhaAlunoRef num wrapper `overflow:hidden` +
  // `maxHeight` — apesar de o ref em si não mudar de tamanho, isso reintroduz
  // exatamente o tipo de instabilidade estrutural (ancestral com clipping)
  // que já era suspeito na causa original do "Unable to find element in
  // cloned iframe". Correção estrutural (não apenas outro ajuste de timing):
  // export PASSA A TER FONTE PRÓPRIA, sempre montada fora da viewport
  // (position:fixed; left:-10000px — nunca display:none, que o html2canvas
  // não consegue capturar), nunca dentro de um container recolhido/expandido
  // e nunca dependente de o usuário ter aberto o modal "Visualizar". O MESMO
  // `result` alimenta as duas cópias (preview/modal e exportação) — nenhum
  // conteúdo pedagógico é duplicado ou diverge entre elas.
  const exportFolhaRef    = useRef<HTMLDivElement | null>(null);
  const exportGuiaRef     = useRef<HTMLDivElement | null>(null);
  const exportGabaritoRef = useRef<HTMLDivElement | null>(null);
  const [exportBusy, setExportBusy] = useState<'pdf' | 'png' | 'docx' | null>(null);
  const [exportError, setExportError] = useState('');
  const [imageLoadError, setImageLoadError] = useState(false);
  useEffect(() => { setImageLoadError(false); }, [result.id]);
  // Checkpoint 4E — item "Preview continua grande": a correção da Etapa 4D
  // (container recolhido com "Ver atividade completa") não atendeu — ainda
  // mostrava a folha quase inteira reduzida. Substituída por um CARD
  // compacto (sem prévia grande nenhuma por padrão) + modal "Visualizar"
  // dedicado para ver o conteúdo completo.
  const [viewerOpen, setViewerOpen] = useState(false);
  useEffect(() => { setViewerOpen(false); }, [result.id]);

  type ResultTab = 'folha' | 'guia' | 'gabarito';
  const [activeTab, setActiveTab] = useState<ResultTab>('folha');
  const exportRootId = useMemo(
    () => `incluilab-export-${String(result.id || 'resultado').replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [result.id],
  );
  const exportStageId = (tab: ResultTab) => `${exportRootId}-${tab}`;

  const hasTabs = hasGuide || hasGabarito;

  // ── Conteúdo de cada aba, parametrizado pelo ref de destino — chamado tanto
  // pelo modal "Visualizar" (refs visíveis) quanto pelo exportador fora de
  // tela (refs de export), garantindo que os dois mostrem exatamente o mesmo
  // `result`, sem duas implementações divergentes.
  const renderFolhaStage = (targetRef: React.RefObject<HTMLDivElement | null>) => (
    <>
      {hasImage && !imageLoadError && (
        <PreviewStage innerRef={targetRef}>
          <div data-incluilab-pdf-page="true" data-incluilab-image-page="true" style={{
            width: 794, minHeight: 1123, background: '#fff',
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)', borderRadius: 12, padding: 0,
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src={result.imageUrl} alt="Atividade gerada" onError={() => setImageLoadError(true)} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          </div>
        </PreviewStage>
      )}
      {result.activityPackage && result.activity && (!hasImage || imageLoadError) && (
        <PreviewStage innerRef={targetRef}>
          <A4ActivityRenderer activity={result.activity} studentName={studentName || undefined} activeView="folha" />
        </PreviewStage>
      )}
      {!result.activityPackage && (result.contentJson || result.activity) && (!hasImage || imageLoadError) && (
        <>
          {imageLoadError && (
            <div role="alert" style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 14, padding: '10px 14px',
              borderRadius: 10, border: '1px solid #FDE68A',
              background: '#FFFBEB', color: '#92400E',
              fontSize: 13, fontWeight: 650,
            }}>
              <AlertCircle size={15} />
              <span>A imagem não pôde ser carregada. Exibindo versão editável em A4.</span>
            </div>
          )}
          <PreviewStage innerRef={targetRef}>
            <ActivityA4Premium contentJson={result.contentJson || result.activity} studentName={studentName || undefined} visualStyle={visualStyle} />
          </PreviewStage>
        </>
      )}
      {!result.contentJson && !result.activity && hasText && (!hasImage || imageLoadError) && result.content && (
        <PreviewStage innerRef={targetRef}>
          <ActivityA4Premium contentJson={normalizeIncluiLabActivity(result.content, { title: result.title })} studentName={studentName || undefined} visualStyle={visualStyle} />
        </PreviewStage>
      )}
    </>
  );

  const renderGuiaStage = (targetRef: React.RefObject<HTMLDivElement | null>) => {
    if (!hasGuide) return null;
    if (result.guiaText) {
      return (
        <PreviewStage innerRef={targetRef}>
          <div data-incluilab-pdf-page="true" style={{
            width: 794, minHeight: 1123, maxWidth: 794, boxSizing: 'border-box',
            background: '#fff', borderRadius: 12, padding: '40px 44px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.10)', fontFamily: "'Segoe UI', Arial, sans-serif",
            overflowWrap: 'break-word', wordBreak: 'break-word', overflowX: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, paddingBottom: 18, borderBottom: `2px solid ${C.border}` }}>
              <div style={{ width: 42, height: 42, borderRadius: 11, background: C.light, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <GraduationCap size={20} color={C.petrol} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 10, color: C.sec, textTransform: 'uppercase', letterSpacing: '0.08em' }}>IncluiLAB · Atividade Visual</p>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.dark }}>Guia do Professor</h2>
              </div>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.75, color: '#2a2a2a', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                h1: ({ children }: any) => <h1 style={{ fontSize: 20, fontWeight: 800, color: C.dark, margin: '24px 0 12px', borderBottom: `2px solid ${C.border}`, paddingBottom: 8, overflowWrap: 'break-word' }}>{children}</h1>,
                h2: ({ children }: any) => <h2 style={{ fontSize: 16, fontWeight: 700, color: C.petrol, margin: '22px 0 10px', display: 'flex', alignItems: 'center', gap: 8, overflowWrap: 'break-word' }}>{children}</h2>,
                h3: ({ children }: any) => <h3 style={{ fontSize: 14, fontWeight: 700, color: C.dark, margin: '16px 0 8px', overflowWrap: 'break-word' }}>{children}</h3>,
                p: ({ children }: any) => <p style={{ margin: '0 0 12px', lineHeight: 1.75, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{children}</p>,
                ul: ({ children }: any) => <ul style={{ margin: '8px 0 16px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '100%' }}>{children}</ul>,
                ol: ({ children }: any) => <ol style={{ margin: '8px 0 16px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: '100%' }}>{children}</ol>,
                li: ({ children }: any) => <li style={{ lineHeight: 1.65, color: '#2a2a2a', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{children}</li>,
                strong: ({ children }: any) => <strong style={{ fontWeight: 700, color: C.dark }}>{children}</strong>,
                hr: () => <hr style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '20px 0' }} />,
                table: ({ children }: any) => <div style={{ overflowX: 'auto', maxWidth: '100%' }}><table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', margin: '8px 0 16px' }}>{children}</table></div>,
                th: ({ children }: any) => <th style={{ border: `1px solid ${C.border}`, padding: '6px 8px', textAlign: 'left', fontSize: 12, wordBreak: 'break-word', overflowWrap: 'break-word' }}>{children}</th>,
                td: ({ children }: any) => <td style={{ border: `1px solid ${C.border}`, padding: '6px 8px', fontSize: 12, wordBreak: 'break-word', overflowWrap: 'break-word' }}>{children}</td>,
                code: ({ children }: any) => <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: C.light, padding: '1px 4px', borderRadius: 4, fontSize: 12 }}>{children}</code>,
                pre: ({ children }: any) => <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowX: 'auto', maxWidth: '100%' }}>{children}</pre>,
              }}>
                {result.guiaText}
              </ReactMarkdown>
            </div>
          </div>
        </PreviewStage>
      );
    }
    if (result.activity) {
      return <PreviewStage innerRef={targetRef}><A4ActivityRenderer activity={result.activity} studentName={studentName || undefined} activeView="guia" /></PreviewStage>;
    }
    return null;
  };

  const renderGabaritoStage = (targetRef: React.RefObject<HTMLDivElement | null>, printIdSuffix: string) => {
    if (!hasGabarito) return null;
    if (result.activity && canonicalAnswerKey) {
      return (
        <PreviewStage innerRef={targetRef}>
          <AnswerKeyRenderer activity={result.activity} answerKey={canonicalAnswerKey} printId={`incluilab-gabarito-${printIdSuffix}`} />
        </PreviewStage>
      );
    }
    if (result.legacyAnswerKey) {
      return (
        <PreviewStage innerRef={targetRef}>
          <LegacyAnswerKeyView items={result.legacyAnswerKey} title={result.title} />
        </PreviewStage>
      );
    }
    return null;
  };

  const renderActiveStage = (tab: ResultTab, refs: { folha: React.RefObject<HTMLDivElement | null>; guia: React.RefObject<HTMLDivElement | null>; gabarito: React.RefObject<HTMLDivElement | null> }, printIdSuffix: string) => {
    if (tab === 'folha') return renderFolhaStage(refs.folha);
    if (tab === 'guia') return renderGuiaStage(refs.guia);
    if (tab === 'gabarito') return renderGabaritoStage(refs.gabarito, printIdSuffix);
    return null;
  };

  const getExportElement = (tab: ResultTab): HTMLElement | null => {
    const byId = document.getElementById(exportStageId(tab));
    if (byId?.isConnected) return byId as HTMLElement;
    const ref = tab === 'guia' ? exportGuiaRef : tab === 'gabarito' ? exportGabaritoRef : exportFolhaRef;
    return ref.current;
  };

  const handleExportWord = async () => {
    if (!result.activityPackage) {
      setExportError('Word disponível apenas para atividades canônicas salvas em formato estruturado.');
      return;
    }

    setExportBusy('docx');
    setExportError('');
    try {
      const blob = await exportIncluiLabActivityToWord(result.activityPackage, {
        studentName: studentName || undefined,
      });
      downloadWordDocument(blob, buildIncluiLabWordFilename(result.activityPackage));
    } catch (err: any) {
      const message = err?.message || String(err || 'Erro desconhecido');
      setExportError(`Nao foi possivel baixar o Word. ${message}`);
    } finally {
      setExportBusy(null);
    }
  };

  const handleExport = async (format: 'pdf' | 'png', tab: ResultTab = activeTab) => {
    // Checkpoint 4E: sempre usa os refs de EXPORTAÇÃO dedicados (fora de tela,
    // sempre montados) — nunca os refs do modal/preview visível. Exportar não
    // depende mais de o modal "Visualizar" estar aberto.
    const element = getExportElement(tab);

    console.log('[IncluiLAB PDF]', {
      activeTab: tab,
      hasExportFolhaRef: !!exportFolhaRef.current,
      hasExportGuiaRef: !!exportGuiaRef.current,
      hasExportGabaritoRef: !!exportGabaritoRef.current,
      selectedRefTag: element?.tagName,
      selectedId: element?.id,
      selectedStage: element?.dataset?.exportStage,
      selectedConnected: element?.isConnected,
      elementSize: element?.getBoundingClientRect?.(),
      format,
    });

    if (!element || !element.isConnected) {
      const message = !element
        ? 'Nao foi possivel localizar o conteudo para exportar.'
        : 'Nao foi possivel baixar o arquivo. O conteudo selecionado para exportar nao esta conectado ao DOM.';
      console.error('[IncluiLAB PDF] Ref de exportacao nula no clique', {
        activeTab: tab,
        hasExportFolhaRef: !!exportFolhaRef.current,
        hasExportGuiaRef: !!exportGuiaRef.current,
        hasExportGabaritoRef: !!exportGabaritoRef.current,
        selectedId: element?.id,
        selectedStage: element?.dataset?.exportStage,
        selectedConnected: element?.isConnected,
        format,
      });
      setExportError(message);
      return;
    }

    setExportBusy(format);
    setExportError('');
    const baseName = sanitizePdfFilename(result.title || 'atividade-incluilab').replace(/\.pdf$/, '');
    try {
      // Checkpoint 4D: deixa o React aplicar o re-render do overlay (via portal)
      // e pintar o frame ANTES de disparar a captura do html2canvas.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const exportPromise = format === 'pdf'
        ? exportAsPDF(element, `${baseName}.pdf`)
        : exportAsPNG(element, `${baseName}.png`);
      await Promise.all([exportPromise, new Promise(r => setTimeout(r, 1000))]);
    } catch (err: any) {
      const message = err?.message || String(err || 'Erro desconhecido');
      console.error('[IncluiLAB PDF] Falha ao exportar arquivo', err);
      setExportError(`Nao foi possivel baixar o ${format.toUpperCase()}. ${message}`);
    } finally {
      setExportBusy(null);
    }
  };

  const TabBtn: React.FC<{ id: ResultTab; label: string; icon: React.ElementType }> = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
        background: activeTab === id ? C.petrol : 'transparent',
        color: activeTab === id ? '#fff' : C.sec,
        border: `1.5px solid ${activeTab === id ? C.petrol : C.border}`,
        fontWeight: 600, fontSize: 12, transition: 'all 0.15s', outline: 'none',
      }}
    >
      <Icon size={12} />&nbsp;{label}
    </button>
  );

  // Sprint 2B.3 (item 4, Auditoria 2B.2-C): antes, nem o wrapper externo nem o
  // interno tinham `overflow`/`maxWidth` — conteúdo mais largo que a "página" A4
  // (ex.: tabela GFM ou token longo sem quebra) vazava horizontalmente para fora
  // de toda a tela, em vez de ficar contido/scrollável dentro do preview.
  const PreviewStage: React.FC<{ children: React.ReactNode; innerRef?: React.RefObject<HTMLDivElement | null> }> = ({ children, innerRef }) => (
    <div style={{
      maxWidth: 1100,
      margin: '0 auto',
      padding: 24,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      overflowX: 'auto',
    }}>
      <div ref={innerRef} style={{ display: 'inline-block', maxWidth: '100%' }}>
        {children}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '20px 28px 32px' }}>

      {/* Checkpoint 4D — Overlay de exportação premium via createPortal(document.body).
          ANTES este overlay era um <div> irmão, dentro da MESMA árvore DOM que
          folhaAlunoRef/guiaProfessorRef/gabaritoRef (ambos filhos do <div> raiz
          deste componente). handleExport chama setExportBusy(format) e, logo em
          seguida, html2canvas clona o elemento exportado numa iframe oculta —
          qualquer inserção/remoção de nó na árvore entre esses dois momentos é
          suspeita de estar por trás do erro observado "Unable to find element in
          cloned iframe" (falha ao localizar o elemento original no clone). Um
          portal para document.body torna o overlay uma subárvore IRMÃ de todo o
          app (fora da árvore ancestral do elemento exportado), removendo essa
          fonte de instabilidade sem alterar nenhum conteúdo exportado. */}
      {exportBusy && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(246,244,239,0.88)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 22,
        }}>
          <div style={{
            width: 76, height: 76, borderRadius: 22,
            background: `linear-gradient(135deg, #1F4E5F, #2a6880)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 10px 36px rgba(31,78,95,0.38)',
            animation: 'incluilab-export-pulse 2s ease-in-out infinite',
          }}>
            <Sparkles size={34} color="#fff" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: '0 0 7px', fontSize: 19, fontWeight: 800, color: '#2E3A59', letterSpacing: '-0.3px' }}>
              Gerando seu material...
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#7B8BAF' }}>
              {exportBusy === 'docx'
                ? 'Preparando o Word para download'
                : exportBusy === 'pdf'
                  ? 'Preparando o PDF para download'
                  : 'Preparando a imagem PNG'}
            </p>
          </div>
          <style>{`
            @keyframes incluilab-export-pulse {
              0%,100%{transform:scale(1);box-shadow:0 10px 36px rgba(31,78,95,0.38)}
              50%{transform:scale(1.07);box-shadow:0 16px 48px rgba(31,78,95,0.55)}
            }
          `}</style>
        </div>,
        document.body,
      )}

      {/* Checkpoint 4E — item "Preview continua grande": CARD compacto (estilo
          anexo de chat), substitui a toolbar+prévia grande anteriores. Nenhuma
          prévia A4 é renderizada aqui — só uma miniatura pequena e ações. */}
      <div style={{
        background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
        padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)', maxWidth: 460,
      }}>
        <div style={{
          width: 88, height: 110, borderRadius: 8, background: C.bg,
          border: `1px solid ${C.border}`, flexShrink: 0, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {hasImage && !imageLoadError ? (
            <img src={result.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <FileText size={28} color={C.sec} />
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 11, color: C.sec, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Atividade pronta</p>
          <p style={{ margin: '2px 0 8px', fontSize: 14, fontWeight: 800, color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {result.title}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {questionCountLabel && (
              <span style={{ fontSize: 11, color: C.dark, background: C.light, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                {questionCountLabel}
              </span>
            )}
            {result.creditsUsed > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.gold, fontWeight: 700 }}>
                <Coins size={11} /> {result.creditsUsed} cr
              </span>
            )}
            {saved && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#16A34A', fontWeight: 700 }}>
                <CheckCircle size={11} /> Salva na Biblioteca
              </span>
            )}
            {result.outputFormat && result.outputFormat !== 'unspecified' && (
              <span style={{ fontSize: 11, color: C.dark, background: '#EEF2FF', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                Formato solicitado: {outputFormatLabel(result.outputFormat)}
              </span>
            )}
          </div>
          {result.outputFormatNotice && (
            <p style={{ margin: '0 0 8px', fontSize: 11, color: C.sec }}>{result.outputFormatNotice}</p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Btn size="sm" icon={Sparkles} onClick={() => setViewerOpen(true)}>Visualizar</Btn>
            <Btn size="sm" icon={Download} onClick={() => void handlePrimaryExport()} disabled={!!exportBusy}>
              {exportBusy ? 'Gerando...' : outputFormatButtonLabel(result.outputFormat)}
            </Btn>
            {!saved && (
              <Btn size="sm" icon={Bookmark} variant="primary" onClick={onSave} disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </Btn>
            )}
          </div>
        </div>
      </div>

      {showIllustrationFallbackNoticeInCard}
      {showOriginalTypeUnsupportedNoticeInCard}

      {/* Checkpoint 4E — item "Visualizar": modal dedicado (Dialog já usado em
          outras partes do app — StudentImportModal, ChecklistUploadModal etc.),
          em vez de expandir uma A4 gigante dentro do fluxo principal do chat. */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-[900px] w-[92vw] max-h-[88vh] overflow-hidden p-0 flex flex-col">
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <DialogTitle style={{ fontSize: 14, fontWeight: 800, color: C.dark, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {result.title}
            </DialogTitle>
            {hasTabs && (
              <div style={{ display: 'flex', gap: 5 }}>
                <TabBtn id="folha" label="Folha do Aluno" icon={FileText} />
                {hasGuide && <TabBtn id="guia" label="Guia do Professor" icon={GraduationCap} />}
                {hasGabarito && <TabBtn id="gabarito" label="Gabarito" icon={CheckCircle} />}
              </div>
            )}
            <div style={{ display: 'flex', gap: 5 }}>
              <Btn size="sm" icon={Download} onClick={() => void handlePrimaryExport()} disabled={!!exportBusy}>
                {outputFormatLabel(result.outputFormat)}
              </Btn>
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {activeTab === 'folha' && renderFolhaStage(folhaAlunoRef)}
            {activeTab === 'guia' && renderGuiaStage(guiaProfessorRef)}
            {activeTab === 'gabarito' && renderGabaritoStage(gabaritoRef, 'modal')}
          </div>
        </DialogContent>
      </Dialog>

      {exportError && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginTop: 14, padding: '10px 14px',
          borderRadius: 10, border: '1px solid #FECACA',
          background: '#FEF2F2', color: '#991B1B',
          fontSize: 13, fontWeight: 650, maxWidth: 460,
        }}>
          <AlertCircle size={15} />
          <span style={{ flex: 1 }}>{exportError}</span>
          <button onClick={() => setExportError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', padding: 2 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Checkpoint 4E — item "PDF/PNG não baixam": fonte de exportação DEDICADA,
          sempre montada fora da viewport (nunca display:none — html2canvas não
          captura elementos display:none), sempre mostrando o resultado real do
          `result`, nunca afetada pelo card compacto acima nem pelo modal. Espelha
          o `activeTab` atual (o mesmo usado no modal), sem duplicar conteúdo
          pedagógico — só reaproveita as mesmas funções renderFolhaStage/
          renderGuiaStage/renderGabaritoStage com refs próprios. */}
      <div aria-hidden="true" data-incluilab-export-source="true" style={{ position: 'fixed', top: 0, left: -10000, width: 900, pointerEvents: 'none' }}>
        <div id={exportStageId('folha')} data-export-stage="folha" style={{ width: 900 }}>
          {renderFolhaStage(exportFolhaRef)}
        </div>
        {hasGuide && (
          <div id={exportStageId('guia')} data-export-stage="guia" style={{ width: 900 }}>
            {renderGuiaStage(exportGuiaRef)}
          </div>
        )}
        {hasGabarito && (
          <div id={exportStageId('gabarito')} data-export-stage="gabarito" style={{ width: 900 }}>
            {renderGabaritoStage(exportGabaritoRef, 'export')}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Estado de geração ────────────────────────────────────────────────────────
const GeneratingState: React.FC<{ mode: GenerationMode; topic: string }> = ({ mode, topic }) => (
  <div style={{
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    minHeight: 400, padding: 40,
  }}>
    <div style={{
      width: 64, height: 64, borderRadius: 18,
      background: `linear-gradient(135deg, ${C.petrol}, #2a6880)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      marginBottom: 24,
      boxShadow: `0 8px 24px rgba(31,78,95,0.3)`,
      animation: 'pulse 2s ease-in-out infinite',
    }}>
      <Sparkles size={28} color="#fff" />
    </div>
    <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: C.dark }}>
      {mode === 'a4_visual' ? 'Criando atividade com imagens…' :
       mode === 'a4_premium' ? 'Gerando worksheet premium…' :
       mode === 'avaliacao' ? 'Criando avaliação com gabarito…' :
       mode === 'adaptar_economico' ? 'Adaptando atividade…' :
       mode === 'adaptar_visual' ? 'Adaptando com imagens…' :
       mode === 'adaptar_premium' ? 'Adaptando worksheet premium…' :
       'Criando atividade…'}
    </h2>
    <p style={{ margin: '0 0 4px', fontSize: 14, color: C.sec }}>
      {topic ? `Sobre: "${topic.length > 60 ? topic.slice(0, 60) + '…' : topic}"` : 'Processando…'}
    </p>
    <p style={{ margin: 0, fontSize: 12, color: C.border }}>
      Isso pode levar alguns segundos
    </p>
    <style>{`
      @keyframes pulse { 0%,100%{transform:scale(1);box-shadow:0 8px 24px rgba(31,78,95,0.3)} 50%{transform:scale(1.04);box-shadow:0 12px 32px rgba(31,78,95,0.45)} }
      @keyframes spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    `}</style>
  </div>
);

const OutputFormatPrompt: React.FC<{
  onChoose: (format: Exclude<IncluiLabOutputFormat, 'unspecified'>) => void;
}> = ({ onChoose }) => (
  <div style={{
    maxWidth: 460,
    margin: '18px auto 0',
    padding: '14px 16px',
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    background: C.surface,
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
  }}>
    <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: C.dark }}>
      Em qual formato você quer receber a atividade?
    </p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Btn size="sm" icon={FileText} onClick={() => onChoose('docx')}>Word</Btn>
      <Btn size="sm" icon={FileText} onClick={() => onChoose('pdf')}>PDF</Btn>
      <Btn size="sm" icon={FileImage} onClick={() => onChoose('png')}>Imagem</Btn>
    </div>
  </div>
);

// ─── Props ────────────────────────────────────────────────────────────────────
interface IncluiLabViewProps {
  user:                   User;
  students:               Student[];
  defaultTab?:            string;
  sidebarOpen?:           boolean;
  onWorkflowNodesChange?: (nodeIds: string[]) => void;
  creditsAvailable?:      number;
  onNavigate?:            (view: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export const IncluiLabView: React.FC<IncluiLabViewProps> = ({
  user, students, defaultTab, sidebarOpen = true, onWorkflowNodesChange, creditsAvailable, onNavigate,
}) => {
  const [showWorkflow, setShowWorkflow] = useState(defaultTab === 'workflow');
  const isLibraryMode = defaultTab === 'library';

  // ── Estado do studio ──────────────────────────────────────────────────────
  const [labState,    setLabState]    = useState<LabState>('idle');
  const [result,      setResult]      = useState<GeneratedResult | null>(null);
  const [currentTopic, setCurrentTopic] = useState('');
  const [errorMsg,    setErrorMsg]    = useState('');

  // ── Input ─────────────────────────────────────────────────────────────────
  const [inputText,    setInputText]    = useState('');
  const [pendingFile,  setPendingFile]  = useState<AttachedFile | null>(null);
  const [genMode,      setGenMode]      = useState<GenerationMode>('a4_economica');
  const [visualStyle,  setVisualStyle]  = useState<ActivityVisualStyle>('fundamental');
  const [pendingFormatRequest, setPendingFormatRequest] = useState<PendingFormatRequest | null>(null);

  // ── Nova UI (chat): painel "Mais opções" colapsado por padrão ───────────────
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ── Tipo de público ───────────────────────────────────────────────────────
  const [targetType, setTargetType] = useState<TargetType>('turma_geral');
  const [anoSerie,   setAnoSerie]   = useState('');

  // ── Aluno ─────────────────────────────────────────────────────────────────
  const [studentId,   setStudentId]   = useState('');
  const [studentCtx,  setStudentCtx]  = useState('');
  const [studentName, setStudentName] = useState('');

  // ── Biblioteca ────────────────────────────────────────────────────────────
  const [library,        setLibrary]        = useState<any[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySelId,   setLibrarySelId]   = useState<string | null>(null);
  const [savingResult,   setSavingResult]   = useState(false);

  const textAreaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // creditsAvailable é a fonte canônica do saldo real (ex: 774)
  const creditsAvailableSafe = Math.max(0, Number(creditsAvailable ?? 0));

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

  // ── Aluno ─────────────────────────────────────────────────────────────────
  const handleStudentChange = useCallback((id: string, ctx: string, name: string) => {
    setStudentId(id);
    setStudentCtx(ctx);
    setStudentName(name);
  }, []);

  // ── Arquivo ───────────────────────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    const previewUrl = file.type.startsWith('image/') ? base64 : undefined;
    setPendingFile({ name: file.name, type: file.type, base64, previewUrl });
    e.target.value = '';
  };

  const handleModeChange = (mode: GenerationMode) => {
    setGenMode(mode);
    if (isAdaptarMode(mode) && !pendingFile) {
      setTimeout(() => fileInputRef.current?.click(), 100);
    }
  };

  // ── Nova UI (chat): sugestões de capacidade — atalho, nunca obrigatório ─────
  // Ajusta o formato mais próximo já suportado e foca o campo de texto.
  // Sprint 2B: "Criar relatório" foi removido de CAPABILITY_SUGGESTIONS (Document
  // Pipeline ainda não existe — ver comentário acima da constante). O campo livre
  // continua aceitando qualquer pedido em texto normalmente, sem esse atalho.
  const handleCapabilityClick = (label: string) => {
    switch (label) {
      case 'Adaptar material':
        handleModeChange('adaptar_economico');
        break;
      case 'Criar avaliação':
        setGenMode('avaliacao');
        break;
      case 'Criar imagem':
        setGenMode('a4_visual');
        break;
      case 'Criar atividade':
      default:
        setGenMode('a4_economica');
        break;
    }
    setTimeout(() => textAreaRef.current?.focus(), 50);
  };

  // ── Input handlers ────────────────────────────────────────────────────────
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (pendingFormatRequest) setPendingFormatRequest(null);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Enviar ────────────────────────────────────────────────────────────────
  const handleSend = () => {
    const text = inputText.trim();
    if (labState === 'generating') return;

    if (isAdaptarMode(genMode)) {
      if (!pendingFile) { setErrorMsg('Selecione uma imagem para adaptar.'); return; }
      if (!pendingFile.type.startsWith('image/')) { setErrorMsg('Aceita apenas PNG, JPG ou WEBP.'); return; }
    } else {
      if (!text) return;
    }

    setErrorMsg('');
    const topic = text || (pendingFile?.name ?? '');
    setCurrentTopic(topic);
    const lowerTopic = topic.toLowerCase();
    const effectiveMode: GenerationMode =
      genMode === 'a4_economica' && AVALIACAO_KEYWORDS.some(k => lowerTopic.includes(k))
        ? 'avaliacao'
        : genMode;
    if (effectiveMode !== genMode) setGenMode(effectiveMode);
    const canonicalTextMode =
      (effectiveMode === 'a4_economica' && isIncluiLabCanonicalModeEnabled('a4_economica')) ||
      (effectiveMode === 'avaliacao' && isIncluiLabCanonicalModeEnabled('avaliacao')) ||
      (effectiveMode === 'adaptar_economico' && isIncluiLabCanonicalModeEnabled('adaptar_economico'));
    if (canonicalTextMode) {
      const previewIntent = extractCanonicalIntent(topic, {
        hasAttachment: isAdaptarMode(effectiveMode),
        studentContext: studentCtx || undefined,
        requestTypeHint: effectiveMode === 'avaliacao' ? 'avaliacao' : effectiveMode === 'adaptar_economico' ? 'adaptacao' : 'atividade',
      });
      if (previewIntent.requestedVisualStyle === 'preto_e_branco') setVisualStyle('pb');
      if (previewIntent.outputFormat === 'unspecified') {
        setPendingFormatRequest({ mode: effectiveMode, topic, inputText: inputText.trim(), file: pendingFile });
        setLabState('idle');
        return;
      }
    }
    const requiredCredits = getModeConfig(effectiveMode).maxCost;
    if (creditsAvailable !== undefined && creditsAvailable < requiredCredits) {
      setErrorMsg(CREDIT_INSUFFICIENT_MSG);
      return;
    }
    void runGeneration(effectiveMode, topic);
  };

  // ── Geração ───────────────────────────────────────────────────────────────
  const runGeneration = async (
    mode: GenerationMode,
    topic: string,
    outputFormatHint?: IncluiLabOutputFormat,
    extraTextOverride?: string,
    fileOverride?: AttachedFile | null,
  ) => {
    setLabState('generating');
    const extras = extraTextOverride ?? inputText.trim();
    const fileForGeneration = fileOverride ?? pendingFile;
    switch (mode) {
      // Sprint canônico: rollout segmentado por modo. Visual/Premium seguem legados
      // até o pipeline visual trocar "Imagen desenha folha inteira" por renderer estruturado.
      case 'a4_economica':      await (isIncluiLabCanonicalModeEnabled('a4_economica') ? generateA4EconomicaCanonical(topic, outputFormatHint) : generateA4Economica(topic)); break;
      case 'avaliacao':         await (isIncluiLabCanonicalModeEnabled('avaliacao') ? generateAvaliacaoCanonical(topic, outputFormatHint) : generateA4Economica(`Avaliação: ${topic}`)); break;
      case 'a4_visual':         await generateA4Visual(topic); break;
      case 'a4_premium':        await generateA4Premium(topic); break;
      case 'adaptar_economico': if (fileForGeneration) await (isIncluiLabCanonicalModeEnabled('adaptar_economico') ? generateAdaptarEconomicoCanonical(fileForGeneration, extras, outputFormatHint) : generateAdaptarEconomico(fileForGeneration, extras)); break;
      case 'adaptar_visual':    if (fileForGeneration) await generateAdaptarVisual(fileForGeneration, extras); break;
      case 'adaptar_premium':   if (fileForGeneration) await generateAdaptarPremium(fileForGeneration, extras); break;
    }
  };

  const handlePrimaryExport = async () => {
    if (result.outputFormat === 'docx') return handleExportWord();
    if (result.outputFormat === 'png') return handleExport('png', 'folha');
    return handleExport('pdf', 'folha');
  };

  const handleChooseOutputFormat = (format: Exclude<IncluiLabOutputFormat, 'unspecified'>) => {
    const pending = pendingFormatRequest;
    if (!pending) return;
    setErrorMsg('');
    setPendingFormatRequest(null);
    setInputText(pending.inputText);
    setPendingFile(pending.file);
    setCurrentTopic(pending.topic);
    void runGeneration(pending.mode, pending.topic, format, pending.inputText, pending.file);
  };

  // ── 1. A4 Econômica (3 cr) — JSON + pictogramas/emoji, sem imagem IA ─────
  async function generateA4Economica(topic: string) {
    const cost = INCLUILAB_ACTIVITY_COSTS.A4_ECONOMICA;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= cost : await AIService.checkCredits(user, cost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    try {
      const raw = await AIService.generateIncluiLabActivitySchema(buildPremiumActivityPrompt(topic, studentCtx), user);
      const cleaned = cleanJsonString(raw);
      // Checkpoint 4D — CORREÇÃO: A4 Econômica é atividade geral, nunca adaptação.
      // O contrato de buildPremiumActivityPrompt não pede guia_pedagogico (e proíbe
      // explicitamente "guia do professor na folha"), então parsedForGuia.guia_pedagogico
      // é sempre undefined aqui. ANTES, extractGuiaText(undefined, topic) caía no
      // fallback buildFallbackGuide(topic) — que NUNCA retorna vazio — e fabricava um
      // "Guia do Professor" para 100% das gerações de A4 Econômica, violando a regra
      // canônica (atividade geral não tem Guia). Correção: não extrair/fabricar guia
      // algum neste modo. guiaText fica undefined -> hasGuide=false -> aba não aparece.
      const contentJson = normalizeIncluiLabActivity(cleaned, { title: topic, prompt: topic, grade: anoSerie });
      // Checkpoint 4E — item "Avaliação sem Gabarito": quando o tema pede avaliação/
      // prova/teste, buildPremiumActivityPrompt já exige um campo "gabarito" no JSON
      // (ver topicRequestsAvaliacao). Extraímos aqui, best-effort — se o parse falhar
      // ou o campo vier ausente/mal formado, simplesmente não há gabarito (sem
      // fabricar nada, ao contrário do bug antigo do Guia).
      let legacyAnswerKey: IncluiLabAnswerKeyItem[] | undefined;
      try {
        const parsedForGabarito = JSON.parse(cleaned);
        if (Array.isArray(parsedForGabarito?.gabarito)) {
          legacyAnswerKey = parsedForGabarito.gabarito
            .filter((g: any) => g && typeof g.numero === 'number' && typeof g.resposta === 'string' && g.resposta.trim())
            .map((g: any) => ({ numero: g.numero, resposta: g.resposta.trim(), explicacao: typeof g.explicacao === 'string' ? g.explicacao.trim() : undefined }));
          if (!legacyAnswerKey.length) legacyAnswerKey = undefined;
        }
      } catch { /* sem gabarito válido — não fabricamos um */ }
      await safeDeductCredits(user, 'INCLUILAB_A4_ECONOMICA', cost);
      const nextResult: GeneratedResult = {
        id: uid(),
        title: contentJson.title,
        prompt: topic,
        contentJson,
        content: activityToJson(contentJson),
        creditsUsed: cost,
        mode: 'a4_economica',
        legacyAnswerKey,
      };
      setResult(nextResult);
      setLabState('result'); setInputText(''); setPendingFile(null);
      // Checkpoint 4D — autosave: reaproveita o mesmo persistResult do botão
      // "Salvar" manual e do pipeline canônico. Nenhuma Biblioteca nova, nenhum
      // schema novo — só passa a chamar o que já existia para os outros modos.
      await autoSavePersistedResult(nextResult);
    } catch (err: any) { setErrorMsg(activitySchemaErrorMessage(err)); setLabState('idle'); }
  }

  // ── 1b. A4 Econômica — PIPELINE CANÔNICO (Sprint 2B) ──────────────────────
  // Só roda quando INCLUILAB_CANONICAL_PIPELINE === true. Mesmo custo em créditos
  // do modo legado (INCLUILAB_ACTIVITY_COSTS.A4_ECONOMICA — nenhum preço novo).
  async function generateA4EconomicaCanonical(topic: string, outputFormatHint?: IncluiLabOutputFormat) {
    const cost = INCLUILAB_ACTIVITY_COSTS.A4_ECONOMICA;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= cost : await AIService.checkCredits(user, cost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    try {
      const request = extractCanonicalIntent(topic, {
        hasAttachment: false,
        studentContext: studentCtx || undefined,
        requestTypeHint: 'atividade',
        outputFormatHint,
      });
      if (request.requestedVisualStyle === 'preto_e_branco') setVisualStyle('pb');
      const pkg = await runCanonicalActivityPipeline({
        request,
        user,
        cost,
        actionKey: 'incluilab_canonical_a4_economica',
      });
      // Sprint 2B.3 (item 2): guiaText só existe quando o pacote tem teacherGuide
      // (ou seja, requestType === 'adaptacao'). Para atividade/avaliação geral fica undefined.
      const guiaText = pkg.teacherGuide ? buildTeacherGuideMarkdown(pkg) : undefined;
      const contentJson = normalizeIncluiLabActivity(pkg.activity, { title: pkg.activity.header.title, prompt: topic, grade: anoSerie });
      const nextResult: GeneratedResult = {
        id: uid(),
        title: pkg.activity.header.title,
        prompt: topic,
        contentJson,
        activity: pkg.activity,
        content: activityToJson(pkg.activity),
        guiaText,
        creditsUsed: cost,
        mode: 'a4_economica',
        activityPackage: pkg,
        outputFormat: pkg.exportSettings.outputFormat,
        outputFormatNotice: pkg.exportSettings.normalizedOutputFormatNotice,
      };
      setResult(nextResult);
      setLabState('result'); setInputText(''); setPendingFile(null);
      // Sprint 2B.3 (item 5): autosave — créditos já foram commitados pelo pipeline
      // (ver comentário acima de runCanonicalActivityPipeline); persistimos logo em
      // seguida. Se falhar, o professor vê erro visível — não fica só no console.
      await autoSavePersistedResult(nextResult);
    } catch (err: any) { setErrorMsg(activitySchemaErrorMessage(err)); setLabState('idle'); }
  }

  async function generateAvaliacaoCanonical(topic: string, outputFormatHint?: IncluiLabOutputFormat) {
    const cost = INCLUILAB_ACTIVITY_COSTS.A4_ECONOMICA;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= cost : await AIService.checkCredits(user, cost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    try {
      const request = extractCanonicalIntent(topic, {
        hasAttachment: false,
        studentContext: studentCtx || undefined,
        requestTypeHint: 'avaliacao',
        outputFormatHint,
      });
      if (request.requestedVisualStyle === 'preto_e_branco') setVisualStyle('pb');
      const pkg = await runCanonicalActivityPipeline({
        request,
        user,
        cost,
        actionKey: 'incluilab_canonical_avaliacao',
      });
      const contentJson = normalizeIncluiLabActivity(pkg.activity, { title: pkg.activity.header.title, prompt: topic, grade: anoSerie });
      const nextResult: GeneratedResult = {
        id: uid(),
        title: pkg.activity.header.title,
        prompt: topic,
        contentJson,
        activity: pkg.activity,
        content: activityToJson(pkg.activity),
        creditsUsed: cost,
        mode: 'avaliacao',
        activityPackage: pkg,
        outputFormat: pkg.exportSettings.outputFormat,
        outputFormatNotice: pkg.exportSettings.normalizedOutputFormatNotice,
      };
      setResult(nextResult);
      setLabState('result'); setInputText(''); setPendingFile(null);
      await autoSavePersistedResult(nextResult);
    } catch (err: any) { setErrorMsg(activitySchemaErrorMessage(err)); setLabState('idle'); }
  }

  // ── 2. A4 Visual (15 cr) — Guia Pedagógico (texto) + Folha do Aluno (imagem OpenAI) ─
  async function generateA4Visual(topic: string) {
    const cost = INCLUILAB_ACTIVITY_COSTS.A4_VISUAL_MAX;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= cost : await AIService.checkCredits(user, cost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    const tenantId = (user as any).tenant_id;
    const userId = (user as any).id ?? null;
    const operationId = CreditTransactionService.createOperationId('incluilab_a4_visual');
    let reservationId: string | undefined;
    try {
      // Passo 1: Gera guia pedagógico + descrição do conteúdo via Gemini
      const reserve = await CreditTransactionService.atomicReserveCredits({
        tenantId,
        amount: cost,
        description: 'IncluiLAB A4 Visual',
        userId,
        operationId,
        metadata: { mode: 'a4_visual', topic, targetType, anoSerie },
        source: 'incluilab.generateA4Visual',
      });
      reservationId = reserve.reservation_id;

      const raw = await AIService.generateIncluiLabActivitySchema(
        buildGuiaEConteudoPrompt(topic, targetType, anoSerie, studentCtx, studentName), user,
      );
      const parsed = safeParseGuiaJson(raw);

      // Passo 2: Gera imagem A4 via ai-gateway Supabase (Vertex AI Imagen)
      const { result: imageUrlVisual } = await callAIGateway({
        task: 'image',
        prompt: buildOpenAIActivityImagePrompt(topic, targetType, anoSerie, studentCtx, studentName, parsed.descricao_folha, 'visual'),
        creditsRequired: 0,
        requestType: 'incluilab_activity_image',
      });

      // Só debita após ambos os passos com sucesso
      await CreditTransactionService.atomicCommitReservedCredits({
        tenantId,
        reservationId: reservationId!,
        description: 'IncluiLAB A4 Visual',
        userId,
        operationId: `${operationId}:commit`,
        metadata: { mode: 'a4_visual', topic, targetType, anoSerie },
        source: 'incluilab.generateA4Visual',
      });
      window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: user.id } }));
      const contentJson = normalizeIncluiLabActivity(
        buildFallbackActivityContentFromVisualPayload(parsed, topic, targetType, anoSerie),
        { title: topic },
      );
      const nextResult: GeneratedResult = {
        id: uid(),
        title: contentJson.title,
        prompt: topic,
        contentJson,
        content: activityToJson(contentJson),
        imageUrl: imageUrlVisual,
        guiaText: parsed.guia_pedagogico,
        creditsUsed: cost,
        mode: 'a4_visual',
      };
      setResult(nextResult);
      setLabState('result'); setInputText(''); setPendingFile(null);
      // Checkpoint 4D — autosave (item 13/14): A4 Visual nunca chamava persistência
      // automática; o professor dependia só do botão "Salvar" manual.
      await autoSavePersistedResult(nextResult);
    } catch (err: any) {
      if (reservationId) {
        try {
          await CreditTransactionService.atomicReleaseReservedCredits({
            tenantId,
            reservationId,
            description: 'Falha em IncluiLAB A4 Visual',
            userId,
            operationId: `${operationId}:release`,
            metadata: {
              mode: 'a4_visual',
              topic,
              failure_kind: 'multimodal_generation_failed',
              error_message: err instanceof Error ? err.message : String(err),
            },
            source: 'incluilab.generateA4Visual',
          });
          window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: user.id } }));
        } catch (releaseErr) {
          console.error('[IncluiLAB] release A4 visual falhou:', releaseErr);
        }
      }
      setErrorMsg(friendlyAIError(err)); setLabState('idle');
    }
  }

  // ── 3. A4 Premium (50 cr) — Guia Pedagógico (texto) + Folha A4 premium (OpenAI) ─
  async function generateA4Premium(topic: string) {
    const cost = INCLUILAB_ACTIVITY_COSTS.A4_PREMIUM;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= cost : await AIService.checkCredits(user, cost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    const tenantId = (user as any).tenant_id;
    const userId = (user as any).id ?? null;
    const operationId = CreditTransactionService.createOperationId('incluilab_a4_premium');
    let reservationId: string | undefined;
    try {
      // Passo 1: Gera guia pedagógico + descrição do conteúdo via Gemini
      const reserve = await CreditTransactionService.atomicReserveCredits({
        tenantId,
        amount: cost,
        description: 'IncluiLAB A4 Premium',
        userId,
        operationId,
        metadata: { mode: 'a4_premium', topic, targetType, anoSerie },
        source: 'incluilab.generateA4Premium',
      });
      reservationId = reserve.reservation_id;

      const raw = await AIService.generateIncluiLabActivitySchema(
        buildGuiaEConteudoPrompt(topic, targetType, anoSerie, studentCtx, studentName), user,
      );
      const parsed = safeParseGuiaJson(raw);

      // Passo 2: Gera imagem A4 premium via ai-gateway Supabase (Vertex AI Imagen)
      const { result: imageUrlPremium } = await callAIGateway({
        task: 'image',
        prompt: buildOpenAIActivityImagePrompt(topic, targetType, anoSerie, studentCtx, studentName, parsed.descricao_folha, 'premium'),
        creditsRequired: 0,
        requestType: 'incluilab_activity_image',
      });

      await CreditTransactionService.atomicCommitReservedCredits({
        tenantId,
        reservationId: reservationId!,
        description: 'IncluiLAB A4 Premium',
        userId,
        operationId: `${operationId}:commit`,
        metadata: { mode: 'a4_premium', topic, targetType, anoSerie },
        source: 'incluilab.generateA4Premium',
      });
      window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: user.id } }));
      const contentJson = normalizeIncluiLabActivity(
        buildFallbackActivityContentFromVisualPayload(parsed, topic, targetType, anoSerie),
        { title: topic },
      );
      const nextResult: GeneratedResult = {
        id: uid(),
        title: contentJson.title,
        prompt: topic,
        contentJson,
        content: activityToJson(contentJson),
        imageUrl: imageUrlPremium,
        guiaText: parsed.guia_pedagogico,
        creditsUsed: cost,
        mode: 'a4_premium',
      };
      setResult(nextResult);
      setLabState('result'); setInputText(''); setPendingFile(null);
      // Checkpoint 4D — autosave (item 13/14): mesma correção da A4 Visual.
      await autoSavePersistedResult(nextResult);
    } catch (err: any) {
      if (reservationId) {
        try {
          await CreditTransactionService.atomicReleaseReservedCredits({
            tenantId,
            reservationId,
            description: 'Falha em IncluiLAB A4 Premium',
            userId,
            operationId: `${operationId}:release`,
            metadata: {
              mode: 'a4_premium',
              topic,
              failure_kind: 'multimodal_generation_failed',
              error_message: err instanceof Error ? err.message : String(err),
            },
            source: 'incluilab.generateA4Premium',
          });
          window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: user.id } }));
        } catch (releaseErr) {
          console.error('[IncluiLAB] release A4 premium falhou:', releaseErr);
        }
      }
      setErrorMsg(friendlyAIError(err)); setLabState('idle');
    }
  }

  // ── 4. Adaptar — Econômico (5 cr) — analisa + JSON, sem imagem IA ────────
  async function generateAdaptarEconomico(file: AttachedFile, extraInstructions: string) {
    const cost = INCLUILAB_ACTIVITY_COSTS.ADAPTAR_ECONOMICO;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= cost : await AIService.checkCredits(user, cost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    try {
      const analysisText = await AIService.generateFromPromptWithImage(buildAdaptImagePrompt(studentCtx, extraInstructions), file.base64, user);
      // Checkpoint 4E — item "Adaptação não preserva o material original": detecta
      // o tipo estrutural (best-effort, a partir da análise em texto do Gemini
      // Vision) e passa para o prompt, que agora exige preservar essa estrutura.
      const originalActivityType = detectOriginalActivityType(analysisText);
      const raw = await AIService.generateIncluiLabActivitySchema(
        buildPremiumAdaptActivityPrompt(analysisText, studentCtx, extraInstructions, originalActivityType), user,
      );
      const cleanedAdapt = cleanJsonString(raw);
      let parsedAdaptForGuia: any = {};
      try { parsedAdaptForGuia = JSON.parse(cleanedAdapt); } catch {}
      const guiaTextAdapt = extractGuiaText(parsedAdaptForGuia, extraInstructions || file.name);
      // Checkpoint 4E — item "Título vindo do filename": ANTES o fallback de
      // título era literalmente `Atividade Adaptada: ${file.name}` — se o
      // modelo não retornasse um "title" utilizável, o nome cru do arquivo
      // (com extensão, underscores etc.) virava o título pedagógico. Agora o
      // fallback tenta extrair um título da própria análise de conteúdo antes
      // de recorrer ao nome do arquivo (sanitizado, só como último recurso).
      const fallbackTitle = deriveAdaptedFallbackTitle(analysisText, file.name);
      const contentJson = normalizeIncluiLabActivity(cleanedAdapt, { title: fallbackTitle, prompt: extraInstructions, grade: anoSerie });
      await safeDeductCredits(user, 'INCLUILAB_ADAPTAR_ECONOMICO', cost);
      const nextResult: GeneratedResult = {
        id: uid(),
        title: contentJson.title,
        prompt: extraInstructions,
        contentJson,
        content: activityToJson(contentJson),
        analysisText,
        guiaText: guiaTextAdapt,
        creditsUsed: cost,
        mode: 'adaptar_economico',
        originalActivityType,
      };
      setResult(nextResult);
      setLabState('result'); setInputText(''); setPendingFile(null);
      // Checkpoint 4D — autosave (item 13/14). Guia mantido aqui: Adaptar É
      // adaptação de fato (requestType implícito 'adaptacao'), então o Guia do
      // Professor é esperado e correto neste modo — não é o bug do item A.
      await autoSavePersistedResult(nextResult);
    } catch (err: any) { setErrorMsg(activitySchemaErrorMessage(err)); setLabState('idle'); }
  }

  // ── 4b. Adaptar — Econômico — PIPELINE CANÔNICO (Sprint 2B) ───────────────
  // Só roda quando INCLUILAB_CANONICAL_PIPELINE === true. Mesmo custo em créditos
  // do modo legado (INCLUILAB_ACTIVITY_COSTS.ADAPTAR_ECONOMICO — nenhum preço novo).
  async function generateAdaptarEconomicoCanonical(file: AttachedFile, extraInstructions: string, outputFormatHint?: IncluiLabOutputFormat) {
    const cost = INCLUILAB_ACTIVITY_COSTS.ADAPTAR_ECONOMICO;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= cost : await AIService.checkCredits(user, cost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    try {
      // A análise de imagem não é reservada separadamente: é uma etapa auxiliar de
      // baixo custo que já roda sem cobrança dedicada no fluxo legado equivalente.
      const analysisText = await AIService.generateFromPromptWithImage(buildAdaptImagePrompt(studentCtx, extraInstructions), file.base64, user);
      const originalActivityType = detectOriginalActivityType(analysisText);
      const semanticTopic = extraInstructions.trim() || deriveAdaptedFallbackTitle(analysisText, file.name);
      const request = extractCanonicalIntent(semanticTopic, {
        hasAttachment: true,
        studentContext: studentCtx || undefined,
        requestTypeHint: 'adaptacao',
        originalActivityType,
        outputFormatHint,
      });
      if (request.requestedVisualStyle === 'preto_e_branco') setVisualStyle('pb');
      const pkg = await runCanonicalActivityPipeline({
        request,
        user,
        cost,
        actionKey: 'incluilab_canonical_adaptar_economico',
        analysisText,
      });
      // Sprint 2B.3 (item 2): guiaText só existe quando o pacote tem teacherGuide.
      // Aqui requestType é sempre 'adaptacao' (requestTypeHint acima), então na
      // prática sempre existirá — mantemos a checagem por consistência/segurança.
      const guiaTextAdapt = pkg.teacherGuide ? buildTeacherGuideMarkdown(pkg) : undefined;
      const fallbackTitle = deriveAdaptedFallbackTitle(analysisText, file.name);
      const contentJson = normalizeIncluiLabActivity(pkg.activity, { title: pkg.activity.header.title || fallbackTitle, prompt: extraInstructions, grade: anoSerie });
      const nextResult: GeneratedResult = {
        id: uid(),
        title: contentJson.title,
        prompt: extraInstructions,
        contentJson,
        activity: pkg.activity,
        content: activityToJson(pkg.activity),
        analysisText,
        guiaText: guiaTextAdapt,
        creditsUsed: cost,
        mode: 'adaptar_economico',
        activityPackage: pkg,
        originalActivityType,
        outputFormat: pkg.exportSettings.outputFormat,
        outputFormatNotice: pkg.exportSettings.normalizedOutputFormatNotice,
      };
      setResult(nextResult);
      setLabState('result'); setInputText(''); setPendingFile(null);
      // Sprint 2B.3 (item 5): autosave após commit — ver comentário no gerador acima.
      await autoSavePersistedResult(nextResult);
    } catch (err: any) { setErrorMsg(activitySchemaErrorMessage(err)); setLabState('idle'); }
  }

  // ── 5. Adaptar — Visual (20 cr) — analisa + Guia (texto) + Folha A4 (OpenAI) ─
  async function generateAdaptarVisual(file: AttachedFile, extraInstructions: string) {
    const cost = INCLUILAB_ACTIVITY_COSTS.ADAPTAR_VISUAL_MAX;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= cost : await AIService.checkCredits(user, cost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    const tenantId = (user as any).tenant_id;
    const userId = (user as any).id ?? null;
    const operationId = CreditTransactionService.createOperationId('incluilab_adaptar_visual');
    let reservationId: string | undefined;
    try {
      // Passo 1: Análise da atividade original via Gemini (visão)
      const reserve = await CreditTransactionService.atomicReserveCredits({
        tenantId,
        amount: cost,
        description: 'IncluiLAB Adaptar Visual',
        userId,
        operationId,
        metadata: { mode: 'adaptar_visual', fileName: file.name, targetType, anoSerie },
        source: 'incluilab.generateAdaptarVisual',
      });
      reservationId = reserve.reservation_id;

      const analysisText = await AIService.generateFromPromptWithImage(
        buildAdaptImagePrompt(studentCtx, extraInstructions), file.base64, user,
      );

      // Passo 2: Gera guia pedagógico + descrição do conteúdo adaptado via Gemini
      const rawJson = await AIService.generateIncluiLabActivitySchema(
        buildGuiaEConteudoAdaptarPrompt(analysisText, targetType, anoSerie, studentCtx, studentName, extraInstructions), user,
      );
      const parsed = safeParseGuiaJson(rawJson);

      // Passo 3: Gera imagem A4 via ai-gateway Supabase (Vertex AI Imagen)
      const { result: imageUrlAdaptVisual } = await callAIGateway({
        task: 'image',
        prompt: buildOpenAIActivityImagePrompt(
          parsed.titulo_atividade || file.name, targetType, anoSerie, studentCtx, studentName, parsed.descricao_folha, 'visual',
        ),
        creditsRequired: 0,
        requestType: 'incluilab_activity_image',
      });

      await CreditTransactionService.atomicCommitReservedCredits({
        tenantId,
        reservationId: reservationId!,
        description: 'IncluiLAB Adaptar Visual',
        userId,
        operationId: `${operationId}:commit`,
        metadata: { mode: 'adaptar_visual', fileName: file.name, targetType, anoSerie },
        source: 'incluilab.generateAdaptarVisual',
      });
      window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: user.id } }));
      const contentJson = normalizeIncluiLabActivity(
        buildFallbackActivityContentFromVisualPayload(
          { ...parsed, titulo_atividade: parsed.titulo_atividade || `Atividade Adaptada: ${file.name}`, descricao_folha: parsed.descricao_folha || analysisText },
          file.name, targetType, anoSerie,
        ),
        { title: file.name },
      );
      const nextResult: GeneratedResult = {
        id: uid(),
        title: contentJson.title,
        prompt: extraInstructions,
        contentJson,
        content: activityToJson(contentJson),
        imageUrl: imageUrlAdaptVisual,
        guiaText: parsed.guia_pedagogico,
        analysisText,
        creditsUsed: cost,
        mode: 'adaptar_visual',
      };
      setResult(nextResult);
      setLabState('result'); setInputText(''); setPendingFile(null);
      // Checkpoint 4D — autosave (item 13/14).
      await autoSavePersistedResult(nextResult);
    } catch (err: any) {
      if (reservationId) {
        try {
          await CreditTransactionService.atomicReleaseReservedCredits({
            tenantId,
            reservationId,
            description: 'Falha em IncluiLAB Adaptar Visual',
            userId,
            operationId: `${operationId}:release`,
            metadata: {
              mode: 'adaptar_visual',
              fileName: file.name,
              failure_kind: 'multimodal_generation_failed',
              error_message: err instanceof Error ? err.message : String(err),
            },
            source: 'incluilab.generateAdaptarVisual',
          });
          window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: user.id } }));
        } catch (releaseErr) {
          console.error('[IncluiLAB] release adaptar visual falhou:', releaseErr);
        }
      }
      setErrorMsg(friendlyAIError(err)); setLabState('idle');
    }
  }

  // ── 6. Adaptar — Premium (50 cr) — analisa + Guia (texto) + Folha A4 premium (OpenAI) ─
  async function generateAdaptarPremium(file: AttachedFile, extraInstructions: string) {
    const cost = INCLUILAB_ACTIVITY_COSTS.ADAPTAR_PREMIUM;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= cost : await AIService.checkCredits(user, cost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    const tenantId = (user as any).tenant_id;
    const userId = (user as any).id ?? null;
    const operationId = CreditTransactionService.createOperationId('incluilab_adaptar_premium');
    let reservationId: string | undefined;
    try {
      // Passo 1: Análise da atividade original
      const reserve = await CreditTransactionService.atomicReserveCredits({
        tenantId,
        amount: cost,
        description: 'IncluiLAB Adaptar Premium',
        userId,
        operationId,
        metadata: { mode: 'adaptar_premium', fileName: file.name, targetType, anoSerie },
        source: 'incluilab.generateAdaptarPremium',
      });
      reservationId = reserve.reservation_id;

      const analysisText = await AIService.generateFromPromptWithImage(
        buildAdaptImagePrompt(studentCtx, extraInstructions), file.base64, user,
      );

      // Passo 2: Gera guia + descrição do conteúdo
      const rawJson = await AIService.generateIncluiLabActivitySchema(
        buildGuiaEConteudoAdaptarPrompt(analysisText, targetType, anoSerie, studentCtx, studentName, extraInstructions), user,
      );
      const parsed = safeParseGuiaJson(rawJson);

      // Passo 3: Gera imagem A4 premium via ai-gateway Supabase (Vertex AI Imagen)
      const { result: imageUrlAdaptPremium } = await callAIGateway({
        task: 'image',
        prompt: buildOpenAIActivityImagePrompt(
          parsed.titulo_atividade || file.name, targetType, anoSerie, studentCtx, studentName, parsed.descricao_folha, 'premium',
        ),
        creditsRequired: 0,
        requestType: 'incluilab_activity_image',
      });

      await CreditTransactionService.atomicCommitReservedCredits({
        tenantId,
        reservationId: reservationId!,
        description: 'IncluiLAB Adaptar Premium',
        userId,
        operationId: `${operationId}:commit`,
        metadata: { mode: 'adaptar_premium', fileName: file.name, targetType, anoSerie },
        source: 'incluilab.generateAdaptarPremium',
      });
      window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: user.id } }));
      const contentJson = normalizeIncluiLabActivity(
        buildFallbackActivityContentFromVisualPayload(
          { ...parsed, titulo_atividade: parsed.titulo_atividade || `Atividade Adaptada Premium: ${file.name}`, descricao_folha: parsed.descricao_folha || analysisText },
          file.name, targetType, anoSerie,
        ),
        { title: file.name },
      );
      const nextResult: GeneratedResult = {
        id: uid(),
        title: contentJson.title,
        prompt: extraInstructions,
        contentJson,
        content: activityToJson(contentJson),
        imageUrl: imageUrlAdaptPremium,
        guiaText: parsed.guia_pedagogico,
        analysisText,
        creditsUsed: cost,
        mode: 'adaptar_premium',
      };
      setResult(nextResult);
      setLabState('result'); setInputText(''); setPendingFile(null);
      // Checkpoint 4D — autosave (item 13/14).
      await autoSavePersistedResult(nextResult);
    } catch (err: any) {
      if (reservationId) {
        try {
          await CreditTransactionService.atomicReleaseReservedCredits({
            tenantId,
            reservationId,
            description: 'Falha em IncluiLAB Adaptar Premium',
            userId,
            operationId: `${operationId}:release`,
            metadata: {
              mode: 'adaptar_premium',
              fileName: file.name,
              failure_kind: 'multimodal_generation_failed',
              error_message: err instanceof Error ? err.message : String(err),
            },
            source: 'incluilab.generateAdaptarPremium',
          });
          window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: user.id } }));
        } catch (releaseErr) {
          console.error('[IncluiLAB] release adaptar premium falhou:', releaseErr);
        }
      }
      setErrorMsg(friendlyAIError(err)); setLabState('idle');
    }
  }

  // ── Persistência (compartilhada entre "Salvar" manual e autosave canônico) ─
  // Sprint 2B.3 (item 5, Auditoria 2B.2-E): tenantId é resolvido ESTRITAMENTE a
  // partir de user.tenant_id. O padrão antigo `(user as any).tenant_id ?? user.id`
  // usava o próprio user.id como tenant_id quando tenant_id estava ausente — isso
  // quase certamente violaria a RLS de INSERT (`tenant_id = my_tenant_id()`) e
  // falhava de forma silenciosa. Aqui, se tenant_id não existir, erro explícito
  // em vez de um fallback incorreto. (Os modos legados não foram tocados.)
  const persistResult = async (target: GeneratedResult): Promise<{ id: string | null; errorMsg?: string }> => {
    const tenantId = (user as any).tenant_id;
    if (!tenantId) {
      return {
        id: null,
        errorMsg: 'Não foi possível salvar na Biblioteca: tenant não identificado para este usuário. Contate o suporte.',
      };
    }
    try {
      const id = await GeneratedActivityService.save({
        tenantId,
        userId:      user.id,
        studentId:   studentId || undefined,
        title:       target.title,
        prompt:      target.prompt || inputText || currentTopic,
        content:     target.content || (target.contentJson ? activityToJson(target.contentJson) : `[Imagem gerada — ${new Date().toLocaleString('pt-BR')}]`),
        // Sprint 2B: resultados do pipeline canônico persistem o ActivitySchema 2.0 completo
        // (com requestType/answerKey/deliveredAs) achatado na raiz do jsonb, mais os campos
        // extras do ActivityPackage (metadata/exportSettings) — tudo em content_json, sem
        // migration (jsonb livre). Continua legível pelo normalizeIncluiLabActivity legado
        // porque header+exercises seguem na raiz do objeto.
        contentJson: target.activityPackage
          ? buildCanonicalActivityStorageContent(target.activityPackage)
          : (target.contentJson || (target.activity ? normalizeIncluiLabActivity(target.activity) : {})),
        imageUrl:    target.imageUrl,
        // guiaText tem prioridade; analysisText como fallback para modos texto
        guidance:    target.guiaText || target.analysisText,
        isAdapted:   target.mode.startsWith('adaptar_'),
        creditsUsed: target.creditsUsed,
        costCredits: target.creditsUsed,
        mode:        target.mode,
        style:       target.contentJson?.visualStyle?.theme,
        tags:        studentName ? [studentName] : [],
      });
      if (!id) {
        return { id: null, errorMsg: 'Não foi possível salvar a atividade na Biblioteca. Tente novamente pelo botão "Salvar".' };
      }
      return { id };
    } catch (e: any) {
      return {
        id: null,
        errorMsg: `Não foi possível salvar a atividade na Biblioteca. ${e?.message || ''}`.trim(),
      };
    }
  };

  const applyPersistOutcome = async (target: GeneratedResult, outcome: { id: string | null; errorMsg?: string }) => {
    if (outcome.id) {
      setResult(prev => (prev && prev.id === target.id) ? { ...prev, savedId: outcome.id! } : prev);
      await loadLibrary();
    } else if (outcome.errorMsg) {
      // Sprint 2B.3 (item 5): erro visível ao professor — nunca só console.error.
      setErrorMsg(outcome.errorMsg);
    }
  };

  // ── Salvar resultado (clique manual no botão "Salvar") ────────────────────
  const handleSave = async () => {
    if (!result) return;
    setSavingResult(true);
    const outcome = await persistResult(result);
    await applyPersistOutcome(result, outcome);
    setSavingResult(false);
  };

  // ── Autosave da Biblioteca (Sprint 2B.3, item 5) ───────────────────────────
  // Chamado pelos geradores canônicos logo após o commit de créditos (ver
  // comentário em canonicalActivityPipeline.ts). Mesmo caminho de persistência
  // do botão "Salvar" manual — se falhar, o professor vê o banner de erro.
  const autoSavePersistedResult = async (target: GeneratedResult) => {
    const outcome = await persistResult(target);
    await applyPersistOutcome(target, outcome);
  };

  // ── Deletar da biblioteca ─────────────────────────────────────────────────
  const handleDeleteLib = async (id: string) => {
    if (!window.confirm('Remover esta atividade da biblioteca?')) return;
    await GeneratedActivityService.delete(id);
    setLibrary(prev => prev.filter(a => a.id !== id));
    if (librarySelId === id) setLibrarySelId(null);
  };

  // ── Selecionar da biblioteca ──────────────────────────────────────────────
  const handleLibSelect = async (act: any) => {
    setLibrarySelId(act.id);
    const fullAct = await GeneratedActivityService.getById(act.id);
    const row = fullAct || act;
    const rawStoredContentJson = getStoredContentJson(row);
    const storedActivity = parseStoredActivityFromPayload(rawStoredContentJson, row.content);
    const legacyActivity = !storedActivity && row.content && !row.image_url
      ? createLegacyActivity(row.title || 'Atividade', row.content)
      : null;
    const activity = storedActivity || legacyActivity || undefined;
    const contentJson = normalizeIncluiLabActivity(activity?.schemaVersion === '2.0' ? activity : rawStoredContentJson, {
      title: row.title || 'Atividade',
      prompt: row.prompt || row.content || '',
      subject: row.discipline || '',
    });
    // Sprint 2B.3 (item 6): reconstrói o ActivityPackage quando o item salvo é
    // canônico (schemaVersion '2.0'). Sem isso, reabrir um item da Biblioteca
    // perdia o roteamento para o A4ActivityRenderer, o gabarito e o aviso de
    // ilustração — degradava silenciosamente para a renderização legada.
    const activityPackage = buildActivityPackageFromStoredRow(activity, rawStoredContentJson);
    // Se a atividade tem imagem e não tem JSON parseável → guidance é o guia pedagógico (Visual/Premium)
    const storedGuidance = typeof row.guidance === 'string' && row.guidance.trim()
      ? row.guidance
      : undefined;
    const guidanceLooksLikeGuide = !!storedGuidance && /guia|objetivo|metodologia|materiais|mediacao|mediação|avaliacao|avaliação|adaptac/i.test(storedGuidance);
    const isImageMode = !!row.image_url && !storedActivity;
    setResult({
      id:          row.id,
      title:       contentJson.title || activity?.header.title || row.title || 'Atividade',
      prompt:      row.prompt || undefined,
      contentJson,
      activity,
      activityPackage,
      content:     row.content,
      imageUrl:    row.image_url,
      // Para itens canônicos com teacherGuide (adaptação), reconstrói o Markdown a
      // partir do ActivityPackage — nunca inclui gabarito (separado, ver item 3).
      guiaText:    activityPackage?.teacherGuide
        ? buildTeacherGuideMarkdown(activityPackage)
        : (storedGuidance && (isImageMode || guidanceLooksLikeGuide) ? storedGuidance : undefined),
      analysisText: !activityPackage && storedGuidance && !guidanceLooksLikeGuide && !isImageMode ? storedGuidance : undefined,
      creditsUsed: row.cost_credits ?? row.credits_used ?? 0,
      mode:        row.mode || (row.is_adapted ? 'adaptar_economico' : 'a4_economica'),
      savedId:     row.id,
      outputFormat: activityPackage?.exportSettings.outputFormat,
      outputFormatNotice: activityPackage?.exportSettings.normalizedOutputFormatNotice,
    });
    setLabState('result');
  };

  // ── Regenerar ────────────────────────────────────────────────────────────
  const handleRegenerate = () => {
    setLabState('idle');
    setResult(null);
    setLibrarySelId(null);
    setPendingFormatRequest(null);
    setTimeout(() => textAreaRef.current?.focus(), 100);
  };

  // ── Título para export ────────────────────────────────────────────────────
  const exportTitle = result?.title ?? 'Atividade IncluiLAB';

  // ── AtivaIA canvas ────────────────────────────────────────────────────────
  if (showWorkflow) {
    return (
      <div style={{ height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
          background: C.surface, borderBottom: `1px solid ${C.border}`,
        }}>
          <button onClick={() => setShowWorkflow(false)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
            background: C.surface, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.dark,
          }}>
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
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <AtivaIACanvas user={user} students={students as any} sidebarOpen={sidebarOpen} onWorkflowNodesChange={onWorkflowNodesChange} />
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  if (isLibraryMode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', maxHeight: '100%', minHeight: 0, overflow: 'hidden', background: C.bg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: C.petrol, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookMarked size={18} color="#fff" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 850, color: C.dark }}>Biblioteca IncluiLAB</p>
            <p style={{ margin: 0, fontSize: 11, color: C.sec }}>Atividades salvas para revisar, baixar ou reutilizar</p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Btn icon={RefreshCw} onClick={loadLibrary}>Atualizar</Btn>
            <Btn variant="primary" onClick={() => onNavigate?.('incluilab')}>Nova atividade</Btn>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', overflow: 'hidden' }}>
          <LibrarySidebar
            activities={library}
            loading={libraryLoading}
            selectedId={librarySelId ?? undefined}
            onSelect={handleLibSelect}
            onDelete={handleDeleteLib}
          />
          <div style={{ minWidth: 0, overflowY: 'auto', background: C.bg }}>
            {result ? (
              <ResultView
                result={result}
                studentName={studentName}
                visualStyle={visualStyle}
                onSave={handleSave}
                saving={savingResult}
                onExportJson={() => exportActivityJson(result.contentJson || result.activity || result.content || {}, `${exportTitle}.json`)}
              />
            ) : (
              <div style={{ minHeight: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, color: C.sec, textAlign: 'center' }}>
                <div>
                  <BookMarked size={42} color={C.border} style={{ margin: '0 auto 12px' }} />
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.dark }}>Selecione uma atividade salva</p>
                  <p style={{ margin: '6px 0 0', fontSize: 13 }}>O preview A4 aparece aqui, centralizado e pronto para baixar em PDF.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────
  // A interface clássica ("Studio", com seletores sempre visíveis) é preservada
  // abaixo, intacta, e continua ativa quando INCLUILAB_NEW_UI = false.
  // Ver src/config/incluilabUi.ts para reverter.
  if (!INCLUILAB_NEW_UI) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', maxHeight: '100%', minHeight: 0, overflow: 'hidden', background: C.bg }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '10px 20px',
        background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${C.petrol}, #2a6880)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain size={18} color="#fff" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.dark, lineHeight: 1 }}>IncluiLAB</p>
            <p style={{ margin: 0, fontSize: 10, color: C.sec, lineHeight: 1.3 }}>Laboratório de Adaptações</p>
          </div>
        </div>

        <div style={{ width: 1, height: 24, background: C.border, flexShrink: 0 }} />

        {/* Toggle: Turma geral / Para aluno */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.bg, borderRadius: 22, padding: '3px', border: `1.5px solid ${C.border}`, flexShrink: 0 }}>
          {(['turma_geral', 'adaptada'] as TargetType[]).map(t => (
            <button
              key={t}
              onClick={() => {
                setTargetType(t);
                if (t === 'turma_geral') { setStudentId(''); setStudentCtx(''); setStudentName(''); }
              }}
              style={{
                padding: '4px 12px', borderRadius: 18, border: 'none', cursor: 'pointer',
                background: targetType === t ? C.petrol : 'transparent',
                color: targetType === t ? '#fff' : C.sec,
                fontWeight: 600, fontSize: 11, transition: 'all 0.15s', outline: 'none',
              }}
            >
              {t === 'turma_geral' ? 'Turma geral' : 'Para aluno'}
            </button>
          ))}
        </div>

        {/* Seletor de aluno ou campo de Ano/Série */}
        <div style={{ flex: 1, minWidth: 180 }}>
          {targetType === 'adaptada'
            ? <StudentSelector students={students} selectedId={studentId} onChange={handleStudentChange} />
            : (
              <input
                type="text"
                value={anoSerie}
                onChange={e => setAnoSerie(e.target.value)}
                placeholder="Ano/Série (ex: 3º ano EF)"
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 13,
                  border: `1.5px solid ${anoSerie ? C.petrol : C.border}`,
                  background: anoSerie ? C.light : C.surface,
                  color: C.dark, outline: 'none', width: '100%', boxSizing: 'border-box',
                }}
              />
            )
          }
        </div>

        <CreditBalanceBadge
          balance={creditsAvailableSafe}
          compact
          onClick={() => onNavigate?.('subscription')}
        />

        <Btn size="sm" icon={BookMarked} onClick={() => onNavigate?.('incluilab_library')}>
          Biblioteca
        </Btn>

        {/* Nova atividade — aparece quando há resultado */}
        {labState !== 'idle' && (
          <button onClick={handleRegenerate} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: C.petrol, border: 'none', cursor: 'pointer',
            color: '#fff', flexShrink: 0,
            boxShadow: `0 2px 8px rgba(31,78,95,0.25)`,
          }}>
            + Nova atividade
          </button>
        )}

        {showAtivaAI && (
          <button onClick={() => setShowWorkflow(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: C.bg, border: `1.5px solid ${C.border}`, cursor: 'pointer',
            color: C.dark, flexShrink: 0,
          }}>
            <Zap size={13} color={C.petrol} /> AtivaIA
          </button>
        )}
      </div>

      {/* ── Body: sidebar + workspace ─────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

        {/* Workspace + Composer */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Banner de erro */}
          {errorMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 20px', background: '#FEF2F2', borderBottom: '1px solid #FECACA',
              flexShrink: 0,
            }}>
              <AlertCircle size={14} color="#DC2626" />
              <span style={{ flex: 1, fontSize: 13, color: '#991B1B' }}>{errorMsg}</span>
              <button onClick={() => setErrorMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', padding: 2 }}>
                <X size={14} />
              </button>
            </div>
          )}

          {/* Workspace scrollável */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: C.bg }}>
            {labState === 'idle' && (
              pendingFormatRequest ? (
                <OutputFormatPrompt onChoose={handleChooseOutputFormat} />
              ) : (
                <EmptyState
                  studentCtx={studentCtx}
                  studentName={studentName}
                  onSuggestion={(text) => {
                    setInputText(text);
                    setTimeout(() => textAreaRef.current?.focus(), 50);
                  }}
                />
              )
            )}
            {labState === 'generating' && (
              <GeneratingState mode={genMode} topic={currentTopic} />
            )}
            {labState === 'result' && result && (
              <ResultView
                result={result}
                studentName={studentName}
                visualStyle={visualStyle}
                onSave={handleSave}
                saving={savingResult}
                onExportJson={() => exportActivityJson(result.contentJson || result.activity || result.content || {}, `${exportTitle}.json`)}
              />
            )}
          </div>

          {/* Composer — sempre fixo no rodapé */}
          <Composer
            inputText={inputText}
            genMode={genMode}
            pendingFile={pendingFile}
            isGenerating={labState === 'generating'}
            visualStyle={visualStyle}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onModeChange={handleModeChange}
            onStyleChange={setVisualStyle}
            onSend={handleSend}
            onFileClick={() => fileInputRef.current?.click()}
            onRemoveFile={() => setPendingFile(null)}
            textAreaRef={textAreaRef}
          />
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={isAdaptarMode(genMode) ? '.png,.jpg,.jpeg,.webp' : '.pdf,.png,.jpg,.jpeg,.webp,.docx,.doc'}
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
  } // fim do bloco legado (INCLUILAB_NEW_UI === false)

  // ── Nova UI (estilo chat) ────────────────────────────────────────────────
  // Contexto do aluno é opcional; formato/layout ficam em "Mais opções".
  const chatContextSummary = studentId && studentName
    ? studentName
    : 'Sem aluno selecionado';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', maxHeight: '100%', minHeight: 0, overflow: 'hidden', background: C.bg }}>

      {/* ── Header enxuto ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '10px 20px',
        background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${C.petrol}, #2a6880)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain size={18} color="#fff" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.dark, lineHeight: 1 }}>IncluiLAB</p>
            <p style={{ margin: 0, fontSize: 10, color: C.sec, lineHeight: 1.3 }}>
              {studentId ? `Contexto: ${chatContextSummary}` : 'Peça o que precisar'}
            </p>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <CreditBalanceBadge
          balance={creditsAvailableSafe}
          compact
          onClick={() => onNavigate?.('subscription')}
        />

        <Btn size="sm" icon={BookMarked} onClick={() => onNavigate?.('incluilab_library')}>
          Biblioteca
        </Btn>

        <button onClick={handleRegenerate} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700,
          background: C.petrol, border: 'none', cursor: 'pointer',
          color: '#fff', flexShrink: 0,
          boxShadow: `0 2px 8px rgba(31,78,95,0.25)`,
        }}>
          <PlusCircle size={14} /> Nova criação
        </button>
      </div>

      {/* ── Corpo: workspace + composer ─────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Banner de erro */}
          {errorMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 20px', background: '#FEF2F2', borderBottom: '1px solid #FECACA',
              flexShrink: 0,
            }}>
              <AlertCircle size={14} color="#DC2626" />
              <span style={{ flex: 1, fontSize: 13, color: '#991B1B' }}>{errorMsg}</span>
              <button onClick={() => setErrorMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', padding: 2 }}>
                <X size={14} />
              </button>
            </div>
          )}

          {/* Workspace scrollável */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: C.bg }}>
            {labState === 'idle' && (
              pendingFormatRequest ? (
                <OutputFormatPrompt onChoose={handleChooseOutputFormat} />
              ) : (
                <EmptyStateChat
                  studentCtx={studentCtx}
                  studentName={studentName}
                  onSuggestion={(text) => {
                    setInputText(text);
                    setTimeout(() => textAreaRef.current?.focus(), 50);
                  }}
                  onCapability={handleCapabilityClick}
                />
              )
            )}
            {labState === 'generating' && (
              <GeneratingState mode={genMode} topic={currentTopic} />
            )}
            {labState === 'result' && result && (
              <ResultView
                result={result}
                studentName={studentName}
                visualStyle={visualStyle}
                onSave={handleSave}
                saving={savingResult}
                onExportJson={() => exportActivityJson(result.contentJson || result.activity || result.content || {}, `${exportTitle}.json`)}
              />
            )}
          </div>

          {/* Composer simplificado — opções avançadas colapsadas */}
          <ChatComposer
            inputText={inputText}
            genMode={genMode}
            pendingFile={pendingFile}
            isGenerating={labState === 'generating'}
            visualStyle={visualStyle}
            targetType={targetType}
            anoSerie={anoSerie}
            studentId={studentId}
            studentName={studentName}
            students={students}
            advancedOpen={advancedOpen}
            onToggleAdvanced={() => setAdvancedOpen(v => !v)}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onModeChange={handleModeChange}
            onStyleChange={setVisualStyle}
            onTargetTypeChange={setTargetType}
            onAnoSerieChange={setAnoSerie}
            onStudentChange={handleStudentChange}
            onSend={handleSend}
            onFileClick={() => fileInputRef.current?.click()}
            onRemoveFile={() => setPendingFile(null)}
            textAreaRef={textAreaRef}
          />
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={isAdaptarMode(genMode) ? '.png,.jpg,.jpeg,.webp' : '.pdf,.png,.jpg,.jpeg,.webp,.docx,.doc'}
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
};

export default IncluiLabView;
