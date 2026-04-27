// IncluiLabView.tsx — IncluiLAB v5.0 Studio
// Layout: Studio centralizado estilo Claude/Gemini — sem bolhas de chat

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Brain, Zap, Sparkles, Loader, Download,
  Printer, BookOpen, Coins, X, CheckCircle,
  FileText, Bookmark,
  Trash2, BookMarked, FileImage, Type, Paperclip,
  RefreshCw, User as UserIcon, ChevronDown, ChevronRight,
  Clock, Star, Layers, Target, Package, ListOrdered,
  Lightbulb, GraduationCap, AlertCircle,
} from 'lucide-react';
import { User, Student, ActivitySchema, ActivityVisualAsset } from '../types';
import { AIService, friendlyAIError } from '../services/aiService';
import { INCLUILAB_ACTIVITY_COSTS, CREDIT_INSUFFICIENT_MSG } from '../config/aiCosts';
import { StudentContextService } from '../services/studentContextService';
import { GeneratedActivityService } from '../services/persistenceService';
import { WorkflowCanvas as AtivaIACanvas } from '../components/ativaIA/WorkflowCanvas';
import { A4ActivityRenderer } from '../components/incluilab/A4ActivityRenderer';
import {
  isActivitySchemaValidationError,
  validateActivitySchema,
} from '../utils/validateActivitySchema';

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
  green:   '#16A34A',
  greenBg: '#DCFCE7',
  greenBorder: '#BBF7D0',
};

// ─── Modos de geração ─────────────────────────────────────────────────────────
type GenerationMode =
  | 'a4_economica'
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
  { id: 'a4_economica', label: 'A4 Econômica',     desc: 'Texto + pictogramas internos',             maxCost: INCLUILAB_ACTIVITY_COSTS.A4_ECONOMICA,  icon: FileText,  requiresFile: false },
  { id: 'a4_visual',    label: 'A4 Visual',         desc: 'Até 4 imagens IA inclusas',               maxCost: INCLUILAB_ACTIVITY_COSTS.A4_VISUAL_MAX, icon: Sparkles,  requiresFile: false },
  { id: 'a4_premium',   label: 'Premium Ilustrada', desc: 'Worksheet visual completo estilo Canva',  maxCost: INCLUILAB_ACTIVITY_COSTS.A4_PREMIUM,    icon: FileImage, requiresFile: false },
];

const MODES_ADAPTAR: ModeConfig[] = [
  { id: 'adaptar_economico', label: 'Adaptar — Texto',    desc: 'Analisa + reconstrói como A4 estruturado',      maxCost: INCLUILAB_ACTIVITY_COSTS.ADAPTAR_ECONOMICO,  icon: Layers,    requiresFile: true },
  { id: 'adaptar_visual',    label: 'Adaptar — Visual',   desc: 'Analisa + reconstrói com imagens IA (máx. 4)', maxCost: INCLUILAB_ACTIVITY_COSTS.ADAPTAR_VISUAL_MAX, icon: Layers,    requiresFile: true },
  { id: 'adaptar_premium',   label: 'Adaptar — Premium',  desc: 'Recria como worksheet visual completo',         maxCost: INCLUILAB_ACTIVITY_COSTS.ADAPTAR_PREMIUM,   icon: FileImage, requiresFile: true },
];

const ALL_MODES: ModeConfig[] = [...MODES_CRIAR, ...MODES_ADAPTAR];

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
  activity?:    ActivitySchema;
  content?:     string;
  imageUrl?:    string;
  analysisText?: string;
  creditsUsed:  number;
  mode:         GenerationMode;
  savedId?:     string;
}

type LabState = 'idle' | 'preflight' | 'generating' | 'result';

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

function activityToJson(activity: ActivitySchema): string {
  return JSON.stringify(activity, null, 2);
}

function exportActivityJson(activity: ActivitySchema, filename: string) {
  const blob = new Blob([activityToJson(activity)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function printActivity() {
  window.print();
}

function downloadImage(dataUrl: string, filename = 'atividade.png') {
  const a = document.createElement('a');
  a.href = dataUrl; a.download = filename; a.click();
}

async function safeDeductCredits(user: User, action: string, cost: number) {
  await (AIService as any).deductCredits(user, action, cost);
  window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: user.id } }));
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

function parseStoredActivity(content?: string | null): ActivitySchema | null {
  if (!content?.trim()) return null;
  try {
    return validateActivitySchema(content);
  } catch {
    return null;
  }
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

// ─── Prompts ──────────────────────────────────────────────────────────────────

const IMAGE_STYLE_PROMPT = 'ilustracao educativa infantil premium, fundo branco, cores suaves, traco limpo, sem texto na imagem, adequada para impressao A4';

function buildImageActivityPrompt(topic: string, studentCtx: string): string {
  const studentHint = studentCtx
    ? `Aluno: ${studentCtx.split('\n').find(l => l.startsWith('Aluno:')) || studentCtx.split('\n')[0] || 'necessidades especiais'}.`
    : 'inclusiva e acessivel para todos.';
  return `Folha de atividade pedagogica visual, formato A4 retrato, pronta para imprimir. ` +
    `Tema: "${topic}". ${studentHint} ` +
    `Layout: titulo grande e colorido no topo, instrucoes simples em etapas numeradas, ` +
    `ilustracoes educativas coloridas e alegres, espacos em branco para o aluno escrever ou desenhar, ` +
    `borda decorativa suave. Fundo branco. Texto legivel, fonte grande. Estilo ludico e educativo infantil. ` +
    `Sem texto excessivo. Cores vivas mas suaves.`;
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
    "adaptacoes_inclusivas": ["Adaptacao 1", "Adaptacao 2"]
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
    "objetivo_simplificado": "O que voce vai aprender hoje em uma frase simples",
    "instrucoes_simplificadas": ["Instrucao curta 1", "Instrucao curta 2", "Instrucao curta 3"],
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
- TAMANHO: maximo 4 exercicios. Atividade simples: 2-3 exercicios. Atividade padrao: 4 exercicios.
- Cada exercicio deve conter 1 ideia central. Enunciado com no maximo 2 frases curtas.
- Se o conteudo ficar extenso: resumir e remover redundancia. NUNCA truncar com "...".
- Objetivo: atividade enxuta que caiba em 1 a 2 paginas A4 impressas.
- VISUAL: se o enunciado citar "observe", "conte os objetos" ou "veja ao lado", inclua fallback_emoji obrigatorio naquele exercicio.
- Nao repita "Materiais necessarios" em mais de 1 bloco.
- Linguagem direta, frases curtas — e para o aluno, nao para o professor.
- Guia do professor deve ser separado e detalhado.
- Inclua pelo menos 2 elementos em conteudo_visual.
- Nao retorne texto livre fora do JSON.`;
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
    "objetivo_simplificado": "O que voce vai aprender hoje",
    "instrucoes_simplificadas": ["Instrucao 1", "Instrucao 2", "Instrucao 3"],
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
- TAMANHO: maximo 4 exercicios. 1 ideia por exercicio. Enunciado com no maximo 2 frases.
- Se conteudo ficar extenso: resumir, remover redundancia. Nunca truncar com "...".
- VISUAL: se o enunciado citar "observe", "conte os objetos" ou "veja ao lado", inclua fallback_emoji obrigatorio.
- Nao repita "Materiais necessarios" em mais de 1 bloco.
- Objetivo: atividade enxuta em 1 a 2 paginas A4.
- Nao retorne texto livre.`;
}

function buildAdaptPremiumImagePrompt(analysis: string, studentCtx: string): string {
  const target = studentCtx
    ? `adaptado para o aluno: ${studentCtx.split('\n').slice(0, 3).join('; ')}`
    : 'inclusivo e acessivel para todos';
  return `Folha de atividade pedagogica visual, formato A4 retrato, pronta para imprimir. ` +
    `Versao inclusiva e adaptada de atividade original: ${analysis.slice(0, 400)}. ` +
    `${target}. ` +
    `Layout: titulo grande e colorido no topo, instrucoes simples em etapas numeradas, ` +
    `ilustracoes educativas coloridas e alegres, espacos em branco para o aluno escrever ou desenhar, ` +
    `borda decorativa suave. Fundo branco. Texto legivel, fonte grande. Estilo ludico e educativo infantil. ` +
    `Sem texto excessivo. Cores vivas mas suaves.`;
}

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
      overflow: 'hidden', minHeight: 0,
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

      <div style={{ flex: 1, overflowY: 'auto' }}>
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

// ─── Componente: Estado vazio ─────────────────────────────────────────────────
const EmptyState: React.FC<{
  studentCtx:   string;
  studentName:  string;
  onSuggestion: (text: string) => void;
}> = ({ studentCtx, studentName, onSuggestion }) => {
  const SUGGESTIONS = [
    { label: 'Atividade de frações', detail: 'com material concreto para Anos Iniciais' },
    { label: 'Leitura e interpretação', detail: 'sobre animais para aluno com TEA' },
    { label: 'Matemática lúdica', detail: 'contagem com objetos do dia a dia' },
    { label: 'Produção de texto', detail: 'com apoio visual e figuras sequenciais' },
  ];
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: 420, padding: '48px 40px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 36, maxWidth: 620 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 22,
          background: `linear-gradient(135deg, ${C.petrol}, #2a6880)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
          boxShadow: `0 10px 32px rgba(31,78,95,0.28)`,
        }}>
          <Sparkles size={34} color="#fff" />
        </div>
        <h2 style={{ margin: '0 0 10px', fontSize: 26, fontWeight: 800, color: C.dark, lineHeight: 1.2 }}>
          O que você quer criar hoje?
        </h2>
        <p style={{ margin: 0, fontSize: 15, color: C.sec, lineHeight: 1.6 }}>
          {studentCtx
            ? <>Contexto de <strong style={{ color: C.petrol }}>{studentName}</strong> carregado. Atividades serão personalizadas.</>
            : 'Descreva o tema no campo abaixo e gere a atividade inclusiva pronta para imprimir.'
          }
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%', maxWidth: 680 }}>
        {SUGGESTIONS.map(s => (
          <button
            key={s.label}
            onClick={() => onSuggestion(`${s.label} ${s.detail}`)}
            style={{
              padding: '16px 20px', borderRadius: 14, cursor: 'pointer',
              background: C.surface, border: `1.5px solid ${C.border}`,
              textAlign: 'left', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.petrol; (e.currentTarget as HTMLElement).style.background = C.light; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.background = C.surface; }}
          >
            <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 700, color: C.dark }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 11, color: C.sec }}>{s.detail}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Componente: Composer (entrada fixa sempre visível) ───────────────────────
const Composer: React.FC<{
  inputText:    string;
  genMode:      GenerationMode;
  pendingFile:  AttachedFile | null;
  isGenerating: boolean;
  onInput:      (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown:    (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onModeChange: (m: GenerationMode) => void;
  onSend:       () => void;
  onFileClick:  () => void;
  onRemoveFile: () => void;
  textAreaRef:  React.RefObject<HTMLTextAreaElement | null>;
}> = ({
  inputText, genMode, pendingFile, isGenerating,
  onInput, onKeyDown, onModeChange, onSend, onFileClick, onRemoveFile, textAreaRef,
}) => {
  const adaptarAtivo = isAdaptarMode(genMode);
  const canSend = !isGenerating && (adaptarAtivo ? !!pendingFile : !!inputText.trim());
  const placeholder = adaptarAtivo
    ? (pendingFile ? 'Instruções opcionais: "adaptar para TEA", "simplificar"…' : 'Clique em Anexar para selecionar a imagem a adaptar')
    : genMode === 'a4_premium'
    ? 'Ex: "Folha sobre formas geométricas, colorida e lúdica para 1º ano"'
    : 'Peça uma atividade adaptada… Ex: "frações para aluno com TEA, 3º ano"';

  return (
    <div style={{
      flexShrink: 0,
      borderTop: `1px solid ${C.border}`,
      background: C.surface,
      padding: '10px 20px 16px',
    }}>
      {/* Seletor de modo — dois grupos: Criar / Adaptar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: C.sec, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Criar:</span>
        {MODES_CRIAR.map(m => {
          const active = genMode === m.id;
          const Icon = m.icon;
          return (
            <button key={m.id} onClick={() => onModeChange(m.id)} disabled={isGenerating}
              title={`${m.desc} · máx. ${m.maxCost} créditos`}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
                background: active ? C.petrol : 'transparent',
                color: active ? '#fff' : C.sec,
                border: `1.5px solid ${active ? C.petrol : C.border}`,
                fontWeight: 600, fontSize: 11, transition: 'all 0.15s', outline: 'none',
              }}>
              <Icon size={11} />
              {m.label}
              <span style={{ fontSize: 9, fontWeight: 700, background: active ? 'rgba(255,255,255,0.25)' : C.bg, color: active ? 'rgba(255,255,255,0.9)' : C.sec, borderRadius: 20, padding: '1px 5px', marginLeft: 1 }}>{m.maxCost}cr</span>
            </button>
          );
        })}
        <div style={{ width: 1, height: 20, background: C.border, flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: C.sec, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Adaptar:</span>
        {MODES_ADAPTAR.map(m => {
          const active = genMode === m.id;
          const Icon = m.icon;
          return (
            <button key={m.id} onClick={() => onModeChange(m.id)} disabled={isGenerating}
              title={`${m.desc} · máx. ${m.maxCost} créditos`}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
                background: active ? C.petrol : 'transparent',
                color: active ? '#fff' : C.sec,
                border: `1.5px solid ${active ? C.petrol : C.border}`,
                fontWeight: 600, fontSize: 11, transition: 'all 0.15s', outline: 'none',
              }}>
              <Icon size={11} />
              {m.label}
              <span style={{ fontSize: 9, fontWeight: 700, background: active ? 'rgba(255,255,255,0.25)' : C.bg, color: active ? 'rgba(255,255,255,0.9)' : C.sec, borderRadius: 20, padding: '1px 5px', marginLeft: 1 }}>{m.maxCost}cr</span>
            </button>
          );
        })}
      </div>

      {/* Input box */}
      <div style={{
        background: C.bg,
        border: `2px solid ${isGenerating ? C.border : C.petrol}`,
        borderRadius: 16, overflow: 'hidden',
        boxShadow: isGenerating ? 'none' : `0 4px 20px rgba(31,78,95,0.12)`,
        transition: 'all 0.2s',
      }}>
        {pendingFile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 14px', borderBottom: `1px solid ${C.border}`,
            background: C.light,
          }}>
            {pendingFile.type.startsWith('image/') && pendingFile.previewUrl
              ? <img src={pendingFile.previewUrl} alt="" style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: 5 }} />
              : <FileText size={16} color={C.petrol} />
            }
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pendingFile.name}
            </span>
            <button onClick={onRemoveFile} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sec, padding: 2, borderRadius: 5 }}>
              <X size={13} />
            </button>
          </div>
        )}

        <textarea
          ref={textAreaRef}
          value={inputText}
          onChange={onInput}
          onKeyDown={onKeyDown}
          placeholder={isGenerating ? 'Aguarde, gerando atividade…' : placeholder}
          disabled={isGenerating}
          rows={2}
          style={{
            width: '100%', border: 'none', outline: 'none', resize: 'none',
            padding: '14px 16px 8px',
            fontSize: 14, lineHeight: 1.6, fontFamily: 'inherit',
            background: 'transparent', color: C.dark, boxSizing: 'border-box',
            minHeight: 68,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px 10px' }}>
          <button
            onClick={onFileClick}
            disabled={isGenerating}
            title="Anexar imagem"
            style={{
              background: 'none', border: `1.5px solid ${C.border}`,
              borderRadius: 8, padding: '6px 12px', cursor: isGenerating ? 'default' : 'pointer',
              color: pendingFile ? C.petrol : C.sec,
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontWeight: 600,
            }}
          >
            <Paperclip size={13} /> Anexar
          </button>
          <span style={{ flex: 1, fontSize: 10, color: C.sec, textAlign: 'center' }}>
            Enter para enviar · Shift+Enter nova linha
          </span>
          <button
            onClick={onSend}
            disabled={!canSend}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 24px', borderRadius: 12, border: 'none',
              background: canSend ? C.petrol : C.border,
              color: '#fff', fontWeight: 800, fontSize: 14,
              cursor: canSend ? 'pointer' : 'default',
              transition: 'all 0.15s',
              boxShadow: canSend ? `0 4px 14px rgba(31,78,95,0.28)` : 'none',
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
  onSave:       () => void;
  saving:       boolean;
  onExportJson: () => void;
  onPrint:      () => void;
  onDownloadImg:() => void;
}> = ({ result, studentName, onSave, saving, onExportJson, onPrint, onDownloadImg }) => {
  const hasImage    = !!result.imageUrl;
  const hasActivity = !!result.activity;
  const hasText     = !!result.activity || !!result.content;
  const hasAnalysis = !!result.analysisText;
  const hasGuide    = !!result.activity?.guia_pedagogico;
  const saved       = !!result.savedId;

  type ResultTab = 'folha' | 'guia' | 'analise';
  const [activeTab, setActiveTab] = useState<ResultTab>('folha');

  const hasTabs = hasGuide || hasAnalysis;

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

  return (
    <div style={{ padding: '20px 28px 32px' }}>
      {/* Toolbar sticky */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: C.surface, borderRadius: 12,
        border: `1px solid ${C.border}`,
        padding: '10px 16px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
      }}>
        {/* Título + créditos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: C.light, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {hasImage ? <FileImage size={12} color={C.petrol} /> : <FileText size={12} color={C.petrol} />}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
            {result.title}
          </span>
          {result.creditsUsed > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.gold, fontWeight: 700, flexShrink: 0 }}>
              <Coins size={11} /> {result.creditsUsed} cr
            </span>
          )}
        </div>

        {/* Tabs */}
        {hasTabs && (
          <div style={{ display: 'flex', gap: 5, flex: 1, justifyContent: 'center' }}>
            <TabBtn id="folha" label="Folha do Aluno" icon={FileText} />
            {hasGuide && <TabBtn id="guia" label="Guia do Professor" icon={GraduationCap} />}
            {hasAnalysis && <TabBtn id="analise" label="Análise" icon={Brain} />}
          </div>
        )}

        {/* Ações */}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0, marginLeft: hasTabs ? 0 : 'auto' }}>
          {hasActivity && activeTab === 'folha' && (
            <>
              <Btn size="sm" icon={Download} onClick={onExportJson}>JSON</Btn>
              <Btn size="sm" icon={Printer} onClick={onPrint}>Imprimir Folha</Btn>
            </>
          )}
          {hasActivity && activeTab === 'guia' && (
            <Btn size="sm" icon={Printer} onClick={onPrint}>Imprimir Guia</Btn>
          )}
          {hasImage && activeTab === 'folha' && <Btn size="sm" icon={Download} onClick={onDownloadImg}>PNG</Btn>}
          <Btn size="sm" icon={saved ? CheckCircle : Bookmark} variant={saved ? 'success' : 'primary'} onClick={onSave} disabled={saving || saved}>
            {saving ? 'Salvando…' : saved ? 'Salvo!' : 'Salvar'}
          </Btn>
        </div>
      </div>

      {/* Conteúdo: folha do aluno */}
      {activeTab === 'folha' && (
        <>
          {hasImage && (
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              <img src={result.imageUrl} alt="Atividade gerada" style={{ width: '100%', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }} />
            </div>
          )}
          {result.activity && !hasImage && (
            <A4ActivityRenderer activity={result.activity} studentName={studentName || undefined} activeView="folha" />
          )}
          {!result.activity && hasText && !hasImage && result.content && (
            <LegacyA4MarkdownRenderer content={result.content} studentName={studentName || undefined} />
          )}
        </>
      )}

      {/* Conteúdo: guia do professor */}
      {activeTab === 'guia' && hasGuide && result.activity && (
        <A4ActivityRenderer activity={result.activity} studentName={studentName || undefined} activeView="guia" />
      )}

      {/* Conteúdo: análise da adaptação */}
      {activeTab === 'analise' && hasAnalysis && (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ background: C.surface, borderRadius: 14, padding: '32px 36px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.light, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Brain size={20} color={C.petrol} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 11, color: C.sec, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Etapa interna · IA</p>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.dark }}>Análise da Adaptação</h3>
              </div>
            </div>
            <div style={{ padding: '16px 20px', borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.8, color: '#374151', whiteSpace: 'pre-wrap' }}>
              {result.analysisText}
            </div>
            <p style={{ margin: '16px 0 0', fontSize: 11, color: C.sec }}>Esta análise foi usada internamente para gerar a atividade. Não é destinada ao aluno.</p>
          </div>
        </div>
      )}
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
  const [showWorkflow, setShowWorkflow] = useState(defaultTab === 'workflow');

  // ── Estado do studio ──────────────────────────────────────────────────────
  const [labState,    setLabState]    = useState<LabState>('idle');
  const [result,      setResult]      = useState<GeneratedResult | null>(null);
  const [currentTopic, setCurrentTopic] = useState('');
  const [errorMsg,    setErrorMsg]    = useState('');

  // ── Input ─────────────────────────────────────────────────────────────────
  const [inputText,   setInputText]   = useState('');
  const [pendingFile, setPendingFile] = useState<AttachedFile | null>(null);
  const [genMode,     setGenMode]     = useState<GenerationMode>('a4_economica');

  // ── Aluno ─────────────────────────────────────────────────────────────────
  const [studentId,   setStudentId]   = useState('');
  const [studentCtx,  setStudentCtx]  = useState('');
  const [studentName, setStudentName] = useState('');

  // ── Biblioteca ────────────────────────────────────────────────────────────
  const [library,        setLibrary]        = useState<any[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySelId,   setLibrarySelId]   = useState<string | null>(null);
  const [savingResult,   setSavingResult]   = useState(false);

  // ── Preflight ─────────────────────────────────────────────────────────────
  const [preflightData, setPreflightData] = useState<{
    mode: GenerationMode; maxCost: number; topic: string; fileName?: string;
  } | null>(null);

  const textAreaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ── Input handlers ────────────────────────────────────────────────────────
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Enviar → mostra preflight de créditos ─────────────────────────────────
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
    setPreflightData({ mode: genMode, maxCost: getModeConfig(genMode).maxCost, topic, fileName: pendingFile?.name });
    setLabState('preflight');
  };

  // ── Confirmar geração após preflight ──────────────────────────────────────
  const handleConfirmGenerate = async () => {
    if (!preflightData) return;
    const { mode, topic } = preflightData;
    setLabState('generating');
    setPreflightData(null);
    const extras = inputText.trim();
    switch (mode) {
      case 'a4_economica':      await generateA4Economica(topic); break;
      case 'a4_visual':         await generateA4Visual(topic); break;
      case 'a4_premium':        await generateA4Premium(topic); break;
      case 'adaptar_economico': if (pendingFile) await generateAdaptarEconomico(pendingFile, extras); break;
      case 'adaptar_visual':    if (pendingFile) await generateAdaptarVisual(pendingFile, extras); break;
      case 'adaptar_premium':   if (pendingFile) await generateAdaptarPremium(pendingFile, extras); break;
    }
  };

  // ── 1. A4 Econômica (3 cr) — JSON + pictogramas/emoji, sem imagem IA ─────
  async function generateA4Economica(topic: string) {
    const cost = INCLUILAB_ACTIVITY_COSTS.A4_ECONOMICA;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= cost : await AIService.checkCredits(user, cost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    try {
      const raw = await AIService.generateIncluiLabActivitySchema(buildActivitySchemaPrompt(topic, studentCtx), user);
      const activity = validateActivitySchema(raw);
      await safeDeductCredits(user, 'INCLUILAB_A4_ECONOMICA', cost);
      setResult({ id: uid(), title: activity.header.title, activity, content: activityToJson(activity), creditsUsed: cost, mode: 'a4_economica' });
      setLabState('result'); setInputText(''); setPendingFile(null);
    } catch (err: any) { setErrorMsg(activitySchemaErrorMessage(err)); setLabState('idle'); }
  }

  // ── 2. A4 Visual (até 15 cr) — JSON + até 4 imagens IA ──────────────────
  async function generateA4Visual(topic: string) {
    const baseCost = INCLUILAB_ACTIVITY_COSTS.A4_VISUAL_BASE;
    const maxCost  = INCLUILAB_ACTIVITY_COSTS.A4_VISUAL_MAX;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= baseCost : await AIService.checkCredits(user, baseCost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    try {
      const raw = await AIService.generateIncluiLabActivitySchema(buildActivitySchemaPrompt(topic, studentCtx), user);
      const activity = validateActivitySchema(raw);
      await safeDeductCredits(user, 'INCLUILAB_A4_VISUAL_BASE', baseCost);
      let totalCost: number = baseCost;
      // Tenta gerar até 4 imagens IA; falhas usam emoji fallback sem cobrança
      const canAffordImages = creditsAvailable === undefined || (creditsAvailable - baseCost) >= INCLUILAB_ACTIVITY_COSTS.A4_VISUAL_PER_IMAGE;
      if (canAffordImages) {
        const { updatedAssets, imagesGenerated } = await generateSmallImagesForAssets(
          activity.visualAssets, user, INCLUILAB_ACTIVITY_COSTS.A4_VISUAL_PER_IMAGE, 4,
        );
        activity.visualAssets = updatedAssets;
        totalCost = Math.min(baseCost + imagesGenerated * INCLUILAB_ACTIVITY_COSTS.A4_VISUAL_PER_IMAGE, maxCost);
      }
      setResult({ id: uid(), title: activity.header.title, activity, content: activityToJson(activity), creditsUsed: totalCost, mode: 'a4_visual' });
      setLabState('result'); setInputText(''); setPendingFile(null);
    } catch (err: any) { setErrorMsg(activitySchemaErrorMessage(err)); setLabState('idle'); }
  }

  // ── 3. A4 Premium Ilustrada (50 cr) — imagem estilo Canva, fallback texto ─
  async function generateA4Premium(topic: string) {
    const cost = INCLUILAB_ACTIVITY_COSTS.A4_PREMIUM;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= cost : await AIService.checkCredits(user, cost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    try {
      const { ImageGenerationService } = await import('../services/imageGenerationService');
      const tenantId = (user as any).tenant_id ?? user.id;
      try {
        const imgResult = await ImageGenerationService.generate(buildImageActivityPrompt(topic, studentCtx), { tenantId, userId: user.id });
        await safeDeductCredits(user, 'INCLUILAB_A4_PREMIUM', cost);
        setResult({ id: uid(), title: `Atividade Premium: ${topic}`, imageUrl: imgResult.base64DataUrl, creditsUsed: cost, mode: 'a4_premium' });
      } catch {
        // Fallback se imagem falhar — cobra apenas texto
        const textCost = INCLUILAB_ACTIVITY_COSTS.A4_ECONOMICA;
        const raw = await AIService.generateIncluiLabActivitySchema(buildActivitySchemaPrompt(topic, studentCtx), user);
        const activity = validateActivitySchema(raw);
        await safeDeductCredits(user, 'INCLUILAB_A4_ECONOMICA', textCost);
        setResult({ id: uid(), title: activity.header.title, activity, content: activityToJson(activity), creditsUsed: textCost, mode: 'a4_economica' });
      }
      setLabState('result'); setInputText(''); setPendingFile(null);
    } catch (err: any) { setErrorMsg(activitySchemaErrorMessage(err)); setLabState('idle'); }
  }

  // ── 4. Adaptar — Econômico (5 cr) — analisa + JSON, sem imagem IA ────────
  async function generateAdaptarEconomico(file: AttachedFile, extraInstructions: string) {
    const cost = INCLUILAB_ACTIVITY_COSTS.ADAPTAR_ECONOMICO;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= cost : await AIService.checkCredits(user, cost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    try {
      const analysisText = await AIService.generateFromPromptWithImage(buildAdaptImagePrompt(studentCtx, extraInstructions), file.base64, user);
      const raw = await AIService.generateIncluiLabActivitySchema(buildAdaptActivitySchemaPrompt(analysisText, studentCtx, extraInstructions), user);
      const activity = validateActivitySchema(raw);
      await safeDeductCredits(user, 'INCLUILAB_ADAPTAR_ECONOMICO', cost);
      setResult({ id: uid(), title: activity.header.title, activity, content: activityToJson(activity), analysisText, creditsUsed: cost, mode: 'adaptar_economico' });
      setLabState('result'); setInputText(''); setPendingFile(null);
    } catch (err: any) { setErrorMsg(activitySchemaErrorMessage(err)); setLabState('idle'); }
  }

  // ── 5. Adaptar — Visual (até 20 cr) — analisa + JSON + até 4 imagens IA ──
  async function generateAdaptarVisual(file: AttachedFile, extraInstructions: string) {
    const baseCost = INCLUILAB_ACTIVITY_COSTS.ADAPTAR_VISUAL_BASE;
    const maxCost  = INCLUILAB_ACTIVITY_COSTS.ADAPTAR_VISUAL_MAX;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= baseCost : await AIService.checkCredits(user, baseCost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    try {
      const analysisText = await AIService.generateFromPromptWithImage(buildAdaptImagePrompt(studentCtx, extraInstructions), file.base64, user);
      const raw = await AIService.generateIncluiLabActivitySchema(buildAdaptActivitySchemaPrompt(analysisText, studentCtx, extraInstructions), user);
      const activity = validateActivitySchema(raw);
      await safeDeductCredits(user, 'INCLUILAB_ADAPTAR_VISUAL_BASE', baseCost);
      let totalCost: number = baseCost;
      const canAffordImages = creditsAvailable === undefined || (creditsAvailable - baseCost) >= INCLUILAB_ACTIVITY_COSTS.ADAPTAR_VISUAL_PER_IMAGE;
      if (canAffordImages) {
        const { updatedAssets, imagesGenerated } = await generateSmallImagesForAssets(
          activity.visualAssets, user, INCLUILAB_ACTIVITY_COSTS.ADAPTAR_VISUAL_PER_IMAGE, 4,
        );
        activity.visualAssets = updatedAssets;
        totalCost = Math.min(baseCost + imagesGenerated * INCLUILAB_ACTIVITY_COSTS.ADAPTAR_VISUAL_PER_IMAGE, maxCost);
      }
      setResult({ id: uid(), title: activity.header.title, activity, content: activityToJson(activity), analysisText, creditsUsed: totalCost, mode: 'adaptar_visual' });
      setLabState('result'); setInputText(''); setPendingFile(null);
    } catch (err: any) { setErrorMsg(activitySchemaErrorMessage(err)); setLabState('idle'); }
  }

  // ── 6. Adaptar — Premium (50 cr) — analisa + worksheet visual completo ────
  async function generateAdaptarPremium(file: AttachedFile, extraInstructions: string) {
    const cost = INCLUILAB_ACTIVITY_COSTS.ADAPTAR_PREMIUM;
    const hasCredits = creditsAvailable !== undefined ? creditsAvailable >= cost : await AIService.checkCredits(user, cost);
    if (!hasCredits) { setErrorMsg(CREDIT_INSUFFICIENT_MSG); setLabState('idle'); return; }
    try {
      const analysisText = await AIService.generateFromPromptWithImage(buildAdaptImagePrompt(studentCtx, extraInstructions), file.base64, user);
      const { ImageGenerationService } = await import('../services/imageGenerationService');
      const tenantId = (user as any).tenant_id ?? user.id;
      try {
        const imgResult = await ImageGenerationService.generate(buildAdaptPremiumImagePrompt(analysisText, studentCtx), { tenantId, userId: user.id });
        await safeDeductCredits(user, 'INCLUILAB_ADAPTAR_PREMIUM', cost);
        setResult({ id: uid(), title: `Atividade Adaptada Premium: ${file.name}`, imageUrl: imgResult.base64DataUrl, analysisText, creditsUsed: cost, mode: 'adaptar_premium' });
      } catch {
        // Fallback se imagem premium falhar — cobra apenas custo econômico
        const textCost = INCLUILAB_ACTIVITY_COSTS.ADAPTAR_ECONOMICO;
        const raw = await AIService.generateIncluiLabActivitySchema(buildAdaptActivitySchemaPrompt(analysisText, studentCtx, extraInstructions), user);
        const activity = validateActivitySchema(raw);
        await safeDeductCredits(user, 'INCLUILAB_ADAPTAR_ECONOMICO', textCost);
        setResult({ id: uid(), title: activity.header.title, activity, content: activityToJson(activity), analysisText, creditsUsed: textCost, mode: 'adaptar_economico' });
      }
      setLabState('result'); setInputText(''); setPendingFile(null);
    } catch (err: any) { setErrorMsg(activitySchemaErrorMessage(err)); setLabState('idle'); }
  }

  // ── Salvar resultado ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!result) return;
    setSavingResult(true);
    try {
      const id = await GeneratedActivityService.save({
        tenantId:    (user as any).tenant_id ?? user.id,
        userId:      user.id,
        studentId:   studentId || undefined,
        title:       result.title,
        content:     result.content || `[Imagem gerada — ${new Date().toLocaleString('pt-BR')}]`,
        imageUrl:    result.imageUrl,
        guidance:    result.analysisText,
        isAdapted:   result.mode.startsWith('adaptar_'),
        creditsUsed: result.creditsUsed,
        tags:        studentName ? [studentName] : [],
      });
      if (id) {
        setResult(prev => prev ? { ...prev, savedId: id } : prev);
        await loadLibrary();
      }
    } catch (e: any) {
      console.error('[IncluiLAB] Erro ao salvar:', e?.message);
    } finally {
      setSavingResult(false);
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
    const storedActivity = parseStoredActivity(act.content);
    const legacyActivity = !storedActivity && act.content && !act.image_url
      ? createLegacyActivity(act.title || 'Atividade', act.content)
      : null;
    const activity = storedActivity || legacyActivity || undefined;
    setLibrarySelId(act.id);
    setResult({
      id:          act.id,
      title:       activity?.header.title || act.title || 'Atividade',
      activity,
      content:     act.content,
      imageUrl:    act.image_url,
      analysisText: act.guidance || undefined,
      creditsUsed: act.credits_used ?? 0,
      mode:        act.is_adapted ? 'adaptar_economico' : 'a4_economica',
      savedId:     act.id,
    });
    setLabState('result');
  };

  // ── Regenerar / cancelar preflight ───────────────────────────────────────
  const handleRegenerate = () => {
    setLabState('idle');
    setResult(null);
    setLibrarySelId(null);
    setPreflightData(null);
    setTimeout(() => textAreaRef.current?.focus(), 100);
  };

  // ── Título para export ────────────────────────────────────────────────────
  const exportTitle = result?.title ?? 'Atividade IncluiLAB';

  // ── AtivaIA canvas ────────────────────────────────────────────────────────
  if (showWorkflow) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <AtivaIACanvas user={user} students={students as any} sidebarOpen={sidebarOpen} onWorkflowNodesChange={onWorkflowNodesChange} />
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg }}>

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

        <div style={{ flex: 1, minWidth: 180 }}>
          <StudentSelector students={students} selectedId={studentId} onChange={handleStudentChange} />
        </div>

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

        <button onClick={() => setShowWorkflow(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
          background: C.bg, border: `1.5px solid ${C.border}`, cursor: 'pointer',
          color: C.dark, flexShrink: 0,
        }}>
          <Zap size={13} color={C.petrol} /> AtivaIA
        </button>
      </div>

      {/* ── Body: sidebar + workspace ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Sidebar biblioteca */}
        <LibrarySidebar
          activities={library}
          loading={libraryLoading}
          selectedId={librarySelId ?? undefined}
          onSelect={handleLibSelect}
          onDelete={handleDeleteLib}
        />

        {/* Workspace + Composer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

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
          <div style={{ flex: 1, overflowY: 'auto', background: C.bg }}>
            {labState === 'idle' && (
              <EmptyState
                studentCtx={studentCtx}
                studentName={studentName}
                onSuggestion={(text) => {
                  setInputText(text);
                  setTimeout(() => textAreaRef.current?.focus(), 50);
                }}
              />
            )}
            {labState === 'preflight' && preflightData && (
              <PreflightPanel
                mode={preflightData.mode}
                maxCost={preflightData.maxCost}
                creditsAvailable={creditsAvailable}
                topic={preflightData.topic}
                fileName={preflightData.fileName}
                onConfirm={handleConfirmGenerate}
                onCancel={handleRegenerate}
              />
            )}
            {labState === 'generating' && (
              <GeneratingState mode={genMode} topic={currentTopic} />
            )}
            {labState === 'result' && result && (
              <ResultView
                result={result}
                studentName={studentName}
                onSave={handleSave}
                saving={savingResult}
                onExportJson={() => result.activity && exportActivityJson(result.activity, `${exportTitle}.json`)}
                onPrint={printActivity}
                onDownloadImg={() => downloadImage(result.imageUrl ?? '', `${exportTitle}.png`)}
              />
            )}
          </div>

          {/* Composer — sempre fixo no rodapé */}
          <Composer
            inputText={inputText}
            genMode={genMode}
            pendingFile={pendingFile}
            isGenerating={labState === 'generating'}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onModeChange={handleModeChange}
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
