// IncluiLabView.tsx — Laboratório de Atividades Inclusivas
// v2.0 — Imagen 4.0 via serverless (api/generate-image.ts)
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FlaskConical, Zap, Upload, Wand2, FileText, CheckCircle,
  Download, ChevronRight, Brain,
  Camera, Printer, Layers,
  Lightbulb, Loader,
  ArrowLeft, Sparkles, Coins, AlertTriangle,
} from 'lucide-react';
import { User, Student } from '../types';
import { AIService, getModelsForContext, getModelConfig, modelGeneratesImage, friendlyAIError } from '../services/aiService';
import { AI_CREDIT_COSTS, INCLUILAB_MODEL_COSTS, CREDIT_INSUFFICIENT_MSG } from '../config/aiCosts';
import { WorkflowCanvas as AtivaIACanvas } from '../components/ativaIA/WorkflowCanvas';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface AdaptedActivity {
  original: string;
  adapted: string;
  adaptationType: string;
}

interface RedesignedActivity {
  original: string;
  redesigned: string;
  suggestions: string[];
}

type Tab             = 'workflow' | 'scanner' | 'redesign';
type ActivityModelId = 'texto_apenas' | 'nano_banana_pro' | 'chatgpt_imagem';

const ACTIVITY_MODELS = getModelsForContext('incluilab');

const ADAPTATION_TYPES = [
  { id: 'autismo', label: 'Autismo (TEA)' },
  { id: 'tdah', label: 'TDAH' },
  { id: 'dislexia', label: 'Dislexia' },
  { id: 'di', label: 'Deficiência Intelectual' },
  { id: 'geral', label: 'Simplificação Geral' },
];

/** Custo fixo de OCR (extração de conteúdo da imagem/PDF). */
const OCR_COST = AI_CREDIT_COSTS.OCR;           // 1 crédito
/** Custo fixo de adaptação/redesenho de texto (Gemini). */
const TEXT_COST = INCLUILAB_MODEL_COSTS.TEXT;   // 3 créditos
/** Custo de geração de imagem para um dado modelo (apenas para modelos text_image). */
function imageCostFor(modelId: ActivityModelId): number {
  const cfg = getModelConfig(modelId);
  return cfg.output_type === 'text_image' ? cfg.credit_cost : 0;
}
/** Custo total para a aba Scanner: OCR + texto + imagem opcional. */
function scannerTotalCost(modelId: ActivityModelId): number {
  return OCR_COST + TEXT_COST + imageCostFor(modelId);
}
/** Custo total para a aba NeuroDesign: texto + imagem opcional (sem OCR). */
function redesignTotalCost(modelId: ActivityModelId): number {
  return TEXT_COST + imageCostFor(modelId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Detecta se uma string é JSON de geração de imagem {"type":"image_generation","base64DataUrl":"..."}.
 * Retorna o URL da imagem se encontrado, null caso contrário.
 */
function extractImageFromJson(content: string): string | null {
  if (!content || !content.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(content.trim());
    if (parsed?.type === 'image_generation' && parsed.base64DataUrl) {
      return parsed.base64DataUrl as string;
    }
    const url = parsed?.imageUrl || parsed?.image_url || parsed?.url;
    if (typeof url === 'string' && (url.startsWith('data:image') || url.startsWith('http'))) {
      return url;
    }
  } catch { /* não é JSON */ }
  return null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function exportAsDoc(content: string, filename: string) {
  const htmlContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'/><title>${filename}</title></head><body><pre style="font-family:Arial,sans-serif;font-size:12pt;line-height:1.6">${content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></body></html>`;
  const blob = new Blob([htmlContent], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function printContent(content: string, title: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.6;padding:40px;max-width:800px;margin:0 auto}pre{white-space:pre-wrap;word-wrap:break-word}@media print{body{padding:20px}}</style></head><body><pre>${content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre><script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
  win.document.close();
}


// ─── Seletor de Modelo de Atividade (3 opções) ───────────────────────────────
const MC = { petrol: '#1F4E5F', dark: '#2E3A59', gold: '#C69214', goldLight: '#FDF6E3', surface: '#FFFFFF', border: '#E7E2D8', textSec: '#667085' };

const ModelSelector: React.FC<{
  model: ActivityModelId;
  onChange: (m: ActivityModelId) => void;
  /** Custo base adicional ao modelo (ex.: OCR). Incluído no badge de cada opção. */
  baseCost?: number;
}> = ({ model, onChange, baseCost = 0 }) => {
  const selectedCfg = getModelConfig(model);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ACTIVITY_MODELS.length}, 1fr)`, gap: 8 }}>
        {ACTIVITY_MODELS.map(m => {
          const isSel = model === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onChange(m.id as ActivityModelId)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                padding: '10px 12px', borderRadius: 12, cursor: 'pointer', outline: 'none',
                border: `2px solid ${isSel ? MC.petrol : MC.border}`,
                background: isSel ? MC.petrol : MC.surface,
                boxShadow: isSel ? '0 2px 8px rgba(31,78,95,0.18)' : '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.15s', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: isSel ? '#fff' : MC.dark, lineHeight: 1.2 }}>
                {m.name}
              </span>
              <span style={{ fontSize: 10, fontWeight: 500, color: isSel ? 'rgba(255,255,255,0.75)' : MC.textSec }}>
                {m.output_type === 'text_image' ? 'texto + imagem' : 'somente texto'}
              </span>
              <span style={{ fontSize: 10, color: isSel ? 'rgba(255,255,255,0.65)' : MC.textSec, lineHeight: 1.3, marginTop: 2 }}>
                {m.description}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 6,
                padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: isSel ? 'rgba(255,255,255,0.18)' : MC.goldLight,
                color: isSel ? '#fff' : MC.gold,
                border: `1px solid ${isSel ? 'rgba(255,255,255,0.25)' : MC.border}`,
              }}>
                <Coins size={9} />
                {m.output_type === 'text_image' ? TEXT_COST + m.credit_cost + baseCost : m.credit_cost + baseCost} cr
              </span>
            </button>
          );
        })}
      </div>
      {selectedCfg.warning && (
        <p style={{ fontSize: 10, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '6px 10px', margin: 0, lineHeight: 1.4 }}>
          ⚠️ {selectedCfg.warning}
        </p>
      )}
    </div>
  );
};

// ─── Helper: debita créditos e dispara refresh global ────────────────────────
async function safeDeductCredits(user: User, action: string, cost: number): Promise<void> {
  const { AIService: AI } = await import('../services/aiService');
  await (AI as any).deductCredits(user, action, cost);
  // Notifica App.tsx para atualizar tenantSummary sem re-login
  window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId: user.id } }));
}

/**
 * Faz download de uma imagem cross-origin convertendo para blob local primeiro.
 * O atributo `download` de <a> não funciona para URLs de outras origens.
 */
async function downloadImageAsFile(url: string, filename: string): Promise<void> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Falha ao baixar imagem.');
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Fallback: abre em nova aba
    window.open(url, '_blank');
  }
}

/**
 * Faz upload de uma imagem para o Supabase Storage.
 * Aceita URL temporária (DALL-E) ou data URI base64 (Gemini inline).
 * Retorna a URL pública permanente, ou null se falhar.
 */
async function persistImageToStorage(urlOrBase64: string, tenantId: string): Promise<string | null> {
  try {
    const { supabase } = await import('../lib/supabaseClient');
    let blob: Blob;
    if (urlOrBase64.startsWith('data:')) {
      // Base64 inline (Gemini)
      const [header, data] = urlOrBase64.split(',');
      const mimeMatch = header.match(/data:([^;]+)/);
      const mimeType = mimeMatch?.[1] ?? 'image/png';
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      blob = new Blob([bytes], { type: mimeType });
    } else {
      // URL temporária (DALL-E)
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
    const { data: urlData } = supabase.storage.from('imagens_atividades').getPublicUrl(path);
    return urlData?.publicUrl ?? null;
  } catch {
    return null;
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────
interface IncluiLabViewProps {
  user: User;
  students: Student[];
  defaultTab?: Tab;
  sidebarOpen?: boolean;
  onWorkflowNodesChange?: (nodeIds: string[]) => void;
  /** Saldo de créditos já calculado pelo App (ledger-based) — evita split-brain */
  creditsAvailable?: number;
}

export const IncluiLabView: React.FC<IncluiLabViewProps> = ({ user, students, defaultTab, sidebarOpen = true, onWorkflowNodesChange, creditsAvailable }) => {
  const [activeTab, setActiveTab] = useState<Tab | null>(defaultTab ?? null);

  useEffect(() => {
    if (defaultTab) setActiveTab(defaultTab);
  }, [defaultTab]);

  const modules = [
    { id: 'workflow' as Tab, icon: Zap,      label: 'AtivaIA',    subtitle: 'Canvas de Atividades', desc: 'Crie fluxos visuais de geração de atividades — envie imagem, escreva o prompt e a IA gera imagens pedagógicas.', iconBg: 'bg-brand-600' },
    { id: 'scanner'  as Tab, icon: Upload,   label: 'EduLensIA',  subtitle: 'Scanner Pedagógico',   desc: 'Envie foto ou PDF de qualquer atividade e adapte instantaneamente para TEA, TDAH, Dislexia ou DI.', iconBg: 'bg-orange-500' },
    { id: 'redesign' as Tab, icon: Sparkles, label: 'NeuroDesign', subtitle: 'Redesenho Inclusivo', desc: 'Cole qualquer texto e transforme com layout pedagógico acessível, pictogramas e organização visual.',  iconBg: 'bg-amber-500'  },
  ];

  // ── HUB ──
  if (!activeTab) {
    return (
      <div className="min-h-screen p-4 md:p-8" style={{ background: 'linear-gradient(160deg,#fff7ed 0%,#ffffff 50%,#ffedd5 100%)' }}>
        <style>{`
          @keyframes lab-fade-up { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
          .lab-card { animation: lab-fade-up .5s ease both; }
          .lab-card:nth-child(1){animation-delay:.05s}
          .lab-card:nth-child(2){animation-delay:.15s}
          .lab-card:nth-child(3){animation-delay:.25s}
          .lab-card:hover{transform:translateY(-4px);box-shadow:0 12px 40px rgba(234,88,12,0.14)}
        `}</style>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12" style={{ animation: 'lab-fade-up .4s ease both' }}>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-brand-600 shadow-xl shadow-orange-200 mb-5">
              <FlaskConical className="text-white" size={30} />
            </div>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-2">IncluiLAB</h1>
            <p className="text-base text-gray-500 max-w-md mx-auto">Laboratório de Atividades Inclusivas com Inteligência Artificial</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {modules.map(m => {
              const Icon = m.icon;
              return (
                <button key={m.id} onClick={() => setActiveTab(m.id)}
                  className="lab-card text-left rounded-3xl border border-orange-100 p-7 transition-all duration-300 cursor-pointer group"
                  style={{ background: 'rgba(255,255,255,.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 4px 24px rgba(234,88,12,.07)' }}>
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl ${m.iconBg} mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="text-white" size={22} />
                  </div>
                  <div className="mb-1 text-[10px] font-bold text-brand-500 uppercase tracking-widest">{m.subtitle}</div>
                  <h2 className="text-xl font-extrabold text-gray-900 mb-3">{m.label}</h2>
                  <p className="text-sm text-gray-500 leading-relaxed mb-5">{m.desc}</p>
                  <div className="flex items-center gap-1.5 text-brand-600 text-xs font-bold group-hover:gap-3 transition-all duration-300">
                    Acessar <ChevronRight size={14} />
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-10 text-center">
            <span className="inline-flex items-center gap-2 text-xs text-gray-400 bg-white/60 backdrop-blur px-4 py-2 rounded-full border border-orange-100">
              <Brain size={12} className="text-brand-500" /> Gemini (provider padrão) · OpenAI como fallback opcional
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-page ──
  const current = modules.find(m => m.id === activeTab)!;
  const CurrentIcon = current.icon;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sub-page header */}
      <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          {!defaultTab && (
            <button onClick={() => setActiveTab(null)}
              className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-brand-600 transition px-3 py-2 rounded-xl hover:bg-orange-50">
              <ArrowLeft size={16} /> IncluiLAB
            </button>
          )}
          <div className={`${current.iconBg} p-2.5 rounded-2xl shadow-md shrink-0`}>
            <CurrentIcon className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 leading-tight">{current.label}</h1>
            <p className="text-xs text-brand-500 font-semibold">{current.subtitle}</p>
          </div>
          {!defaultTab && (
            <div className="ml-auto hidden sm:flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              {modules.map(m => {
                const Icon = m.icon;
                return (
                  <button key={m.id} onClick={() => setActiveTab(m.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === m.id ? 'bg-brand-600 text-white shadow' : 'text-gray-500 hover:text-brand-600'}`}>
                    <Icon size={13} /> {m.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 md:p-6">
        {activeTab === 'workflow' && <AtivaIACanvas user={user} students={students as any} sidebarOpen={sidebarOpen} onWorkflowNodesChange={onWorkflowNodesChange} />}
        {activeTab === 'scanner'  && <ScannerTab user={user} creditsAvailable={creditsAvailable} />}
        {activeTab === 'redesign' && <RedesignTab user={user} creditsAvailable={creditsAvailable} />}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// EDULEISIA — Scanner Pedagógico
// ═══════════════════════════════════════════════════════════════════════════════
const ScannerTab: React.FC<{ user: User; creditsAvailable?: number }> = ({ user, creditsAvailable }) => {
  const [file, setFile]                   = useState<File | null>(null);
  const [preview, setPreview]             = useState<string | null>(null);
  const [adaptationType, setAdaptationType] = useState('autismo');
  const [model, setModel]                 = useState<ActivityModelId>('texto_apenas');
  const [loading, setLoading]             = useState(false);
  const [result, setResult]               = useState<AdaptedActivity | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [imageError, setImageError]               = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraRef    = useRef<HTMLInputElement>(null);

  const imgCost    = imageCostFor(model);
  const totalCredits = scannerTotalCost(model);

  const handleFileChange = async (f: File) => {
    setFile(f); setResult(null);
    if (f.type.startsWith('image/')) setPreview(await fileToBase64(f));
    else setPreview(null);
  };

  const handleAdapt = async () => {
    if (!file) { alert('Envie um arquivo primeiro.'); return; }

    const hasCredits = creditsAvailable !== undefined
      ? creditsAvailable >= totalCredits
      : await AIService.checkCredits(user, totalCredits);
    if (!hasCredits) {
      alert(CREDIT_INSUFFICIENT_MSG);
      return;
    }

    setLoading(true); setResult(null); setGeneratedImageUrl(null); setImageError(null);
    try {
      const base64 = await fileToBase64(file);
      const adaptLabel = ADAPTATION_TYPES.find(a => a.id === adaptationType)?.label || adaptationType;
      const prompt = `Você é um especialista em educação inclusiva. Analise o conteúdo desta atividade educacional (extraia o texto se for imagem) e crie uma versão adaptada para alunos com ${adaptLabel}.

Regras:
- Simplifique a linguagem sem perder o objetivo pedagógico
- Divida instruções longas em passos numerados curtos
- Para TEA: estruture claramente, evite ambiguidade, use linguagem literal
- Para TDAH: instruções curtas, destaque o essencial
- Para Dislexia: frases curtas, vocabulário simples
- Para DI: linguagem simples, contexto concreto

Retorne SOMENTE um JSON válido:
{"original":"texto extraído","adapted":"versão adaptada completa","adaptationType":"${adaptLabel}"}`;

      const raw = await AIService.generateFromPromptWithImage(prompt, base64, user);
      let parsed: AdaptedActivity;
      try {
        const m = raw.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : { original: '', adapted: raw, adaptationType: adaptLabel };
      } catch { parsed = { original: '', adapted: raw, adaptationType: adaptLabel }; }
      setResult(parsed);

      // Débita OCR + texto imediatamente — entrega já ocorreu
      try {
        await safeDeductCredits(user, `EDULEISIA_OCR_ADAPTAR:${model}`, OCR_COST + TEXT_COST);
      } catch (e: any) {
        console.error('[EduLensIA] falha ao debitar OCR+texto:', e?.message);
      }

      // Geração de imagem: débito somente após sucesso comprovado
      let finalImageUrl: string | null = null;
      if (modelGeneratesImage(model)) {
        try {
          const imgPrompt = `Ilustração educativa inclusiva para atividade sobre "${adaptLabel}", estilo pedagógico infantil, traço limpo, alto contraste, fundo branco, sem texto.`;
          // skipDeduction=true: não checa/debita internamente; controlamos aqui
          const tempUrl = await AIService.generateImageFromPrompt(imgPrompt, user, imgCost, true);
          const persistedUrl = await persistImageToStorage(tempUrl, (user as any).tenant_id ?? user.id);
          finalImageUrl = persistedUrl ?? tempUrl;
          setGeneratedImageUrl(finalImageUrl);
          // Débita somente após URL confirmada
          await safeDeductCredits(user, `EDULEISIA_IMAGEM:${model}`, imgCost);
        } catch (imgErr: any) {
          setImageError(friendlyAIError(imgErr));
        }
      }

      // Persiste com créditos reais consumidos
      const creditsUsed = OCR_COST + TEXT_COST + (finalImageUrl ? imgCost : 0);
      try {
        const { GeneratedActivityService } = await import('../services/persistenceService');
        await GeneratedActivityService.save({
          tenantId:    (user as any).tenant_id ?? '',
          userId:      user.id,
          title:       `EduLensIA — ${adaptLabel} (${new Date().toLocaleDateString('pt-BR')})`,
          content:     parsed.adapted,
          imageUrl:    finalImageUrl ?? undefined,
          isAdapted:   true,
          creditsUsed,
          tags:        ['eduleisia', model, adaptationType],
        });
      } catch (saveErr: any) {
        console.warn('[EduLensIA] falha ao salvar atividade no banco:', saveErr?.message);
      }
    } catch (e: any) {
      alert(friendlyAIError(e));
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
            <Camera size={18} className="text-brand-600" /> Scanner Pedagógico
          </h2>
        </div>
        <ModelSelector model={model} onChange={setModel} baseCost={OCR_COST} />

        <div onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-orange-200 rounded-2xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-orange-50 transition mb-4">
          {preview ? (
            <img src={preview} alt="preview" className="max-h-40 mx-auto rounded-lg object-contain" />
          ) : (
            <>
              <Upload size={32} className="text-brand-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-600">Arraste ou clique para enviar</p>
              <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG aceitos</p>
              {file && <p className="text-xs text-brand-600 font-bold mt-2">{file.name}</p>}
            </>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
          onChange={e => e.target.files?.[0] && handleFileChange(e.target.files[0])} />

        <div className="flex gap-2 mb-5">
          <button onClick={() => cameraRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            <Camera size={15} /> Usar câmera
          </button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => e.target.files?.[0] && handleFileChange(e.target.files[0])} />
          {file && <span className="flex items-center gap-1 text-xs text-brand-600 font-bold"><CheckCircle size={13} /> {file.name}</span>}
        </div>

        <div className="mb-5">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Tipo de Adaptação</label>
          <div className="flex flex-wrap gap-2">
            {ADAPTATION_TYPES.map(a => (
              <button key={a.id} onClick={() => setAdaptationType(a.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition ${adaptationType === a.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preflight de créditos */}
        <div className="mb-4 mt-3 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 text-xs space-y-1">
          <div className="flex items-center gap-2 mb-1.5">
            <Coins size={13} className="text-brand-500 shrink-0" />
            <span className="font-bold text-gray-700">Custo previsto</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>OCR + Extração de conteúdo</span>
            <strong className="text-brand-700">{OCR_COST} crédito</strong>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Adaptação pedagógica (texto)</span>
            <strong className="text-brand-700">{TEXT_COST} créditos</strong>
          </div>
          {modelGeneratesImage(model) && (
            <div className="flex justify-between text-gray-600">
              <span>Geração de imagem ({getModelConfig(model).name})</span>
              <strong className="text-brand-700">{imgCost} créditos</strong>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-800 border-t border-orange-200 pt-1.5 mt-0.5">
            <span>Total</span>
            <strong className="text-brand-700">{totalCredits} créditos</strong>
          </div>
          {modelGeneratesImage(model) && (
            <p className="text-[10px] text-gray-400 pt-0.5">Imagem cobrada somente se geração tiver sucesso.</p>
          )}
        </div>

        <button onClick={handleAdapt} disabled={loading || !file}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-orange-200 disabled:opacity-60">
          {loading ? <><Loader size={16} className="animate-spin" /> Adaptando…</> : <><Brain size={16} /> Adaptar Atividade com IA</>}
        </button>
      </div>

      {imageError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Imagem não foi gerada</p>
            <p className="text-xs text-amber-700 mt-1">{imageError}</p>
            <p className="text-xs text-amber-500 mt-1">Créditos de geração de imagem não foram cobrados.</p>
          </div>
        </div>
      )}

      {result && (() => {
        // Detecta se a IA retornou JSON de imagem em vez de texto
        const inlineImgFromAdapted = extractImageFromJson(result.adapted);
        const displayImageUrl = inlineImgFromAdapted || generatedImageUrl;
        const showTextResult  = !inlineImgFromAdapted;
        return (
        <div className="space-y-4">
          {showTextResult && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={15} className="text-gray-500" />
                <span className="text-xs font-bold text-gray-500 uppercase">Original</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{result.original || '(texto extraído da imagem)'}</p>
            </div>
            <div className="bg-orange-50 rounded-2xl border border-orange-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={15} className="text-brand-600" />
                <span className="text-xs font-bold text-brand-700 uppercase">Adaptada — {result.adaptationType}</span>
                <div className="ml-auto flex gap-1">
                  <button onClick={() => exportAsDoc(result.adapted, 'atividade_adaptada.doc')}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-white border border-orange-200 text-brand-600 font-bold hover:bg-orange-100">
                    <Download size={10} /> DOCX
                  </button>
                  <button onClick={() => printContent(result.adapted, 'Atividade Adaptada')}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-white border border-orange-200 text-brand-600 font-bold hover:bg-orange-100">
                    <Printer size={10} /> PDF
                  </button>
                </div>
              </div>
              <div className="folha-a4-compact">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.adapted}</ReactMarkdown>
              </div>
            </div>
          </div>
          )}
          {displayImageUrl && (
            <div className="bg-white rounded-2xl border border-brand-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={15} className="text-brand-600" />
                <span className="text-xs font-bold text-brand-700 uppercase">Imagem Pedagógica Gerada</span>
                <button
                  onClick={() => downloadImageAsFile(displayImageUrl, 'imagem_atividade.png')}
                  className="ml-auto flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-brand-50 border border-brand-200 text-brand-600 font-bold hover:bg-brand-100">
                  <Download size={10} /> Baixar
                </button>
              </div>
              <img
                src={displayImageUrl}
                alt="Imagem gerada para atividade"
                className="max-h-64 mx-auto rounded-xl object-contain border border-gray-100"
                style={{ display: 'block', maxWidth: '100%' }}
              />
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// NEURODESIGN — Redesenho Inclusivo
// ═══════════════════════════════════════════════════════════════════════════════
const RedesignTab: React.FC<{ user: User; creditsAvailable?: number }> = ({ user, creditsAvailable }) => {
  const [inputText, setInputText]         = useState('');
  const [model, setModel]                 = useState<ActivityModelId>('texto_apenas');
  const [loading, setLoading]             = useState(false);
  const [result, setResult]               = useState<RedesignedActivity | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [imageError, setImageError]               = useState<string | null>(null);

  const imgCost      = imageCostFor(model);
  const totalCredits = redesignTotalCost(model);

  const handleRedesign = async () => {
    if (!inputText.trim()) { alert('Cole o conteúdo da atividade que deseja redesenhar.'); return; }

    const hasCredits = creditsAvailable !== undefined
      ? creditsAvailable >= totalCredits
      : await AIService.checkCredits(user, totalCredits);
    if (!hasCredits) {
      alert(CREDIT_INSUFFICIENT_MSG);
      return;
    }

    setLoading(true); setResult(null); setGeneratedImageUrl(null); setImageError(null);
    try {
      const prompt = `Você é um designer instrucional especialista em educação inclusiva.
Receba esta atividade e faça um REDESENHO PEDAGÓGICO INCLUSIVO completo.

ATIVIDADE ORIGINAL:
${inputText}

Aplique:
1. Reorganize o layout (títulos, seções numeradas)
2. Insira apoio visual em texto (📌 Imagem sugerida: ...)
3. Sugira ícones/pictogramas (🔢, 🔤, etc)
4. Melhore a organização para TEA e dislexia
5. Separe instruções em passos numerados
6. Use **negrito** para palavras-chave
7. Adicione "Espaço para resposta:" depois de cada pergunta

Retorne SOMENTE um JSON válido:
{"original":"texto original","redesigned":"atividade redesenhada completa","suggestions":["Sugestão 1","Sugestão 2","Sugestão 3"]}`;

      const raw = await AIService.generateFromPrompt(prompt, user);
      let parsed: RedesignedActivity;
      try {
        const m = raw.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : { original: inputText, redesigned: raw, suggestions: [] };
      } catch { parsed = { original: inputText, redesigned: raw, suggestions: [] }; }
      setResult(parsed);

      // Débita texto imediatamente — entrega já ocorreu
      try {
        await safeDeductCredits(user, `NEURODESIGN_REDESIGN:${model}`, TEXT_COST);
      } catch (e: any) {
        console.error('[NeuroDesign] falha ao debitar texto:', e?.message);
      }

      // Geração de imagem: débito somente após sucesso comprovado
      let finalImageUrl: string | null = null;
      if (modelGeneratesImage(model)) {
        try {
          const imgPrompt = `Ilustração educativa inclusiva para atividade pedagógica redesenhada, estilo visual acessível, traço limpo, alto contraste, fundo branco, sem texto.`;
          // skipDeduction=true: controlamos o débito aqui
          const tempUrl = await AIService.generateImageFromPrompt(imgPrompt, user, imgCost, true);
          const persistedUrl = await persistImageToStorage(tempUrl, (user as any).tenant_id ?? user.id);
          finalImageUrl = persistedUrl ?? tempUrl;
          setGeneratedImageUrl(finalImageUrl);
          // Débita somente após URL confirmada
          await safeDeductCredits(user, `NEURODESIGN_IMAGEM:${model}`, imgCost);
        } catch (imgErr: any) {
          setImageError(friendlyAIError(imgErr));
        }
      }

      // Persiste com créditos reais consumidos
      const creditsUsed = TEXT_COST + (finalImageUrl ? imgCost : 0);
      try {
        const { GeneratedActivityService } = await import('../services/persistenceService');
        await GeneratedActivityService.save({
          tenantId:    (user as any).tenant_id ?? '',
          userId:      user.id,
          title:       `NeuroDesign — Redesenho (${new Date().toLocaleDateString('pt-BR')})`,
          content:     parsed.redesigned,
          imageUrl:    finalImageUrl ?? undefined,
          isAdapted:   true,
          creditsUsed,
          tags:        ['neurodesign', model],
        });
      } catch (saveErr: any) {
        console.warn('[NeuroDesign] falha ao salvar atividade no banco:', saveErr?.message);
      }
    } catch (e: any) {
      alert(friendlyAIError(e));
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
            <Layers size={18} className="text-brand-600" /> Redesenho Inclusivo
          </h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">Cole qualquer atividade existente e a IA vai redesenhá-la com layout pedagógico acessível.</p>
        <ModelSelector model={model} onChange={setModel} baseCost={0} />

        <textarea value={inputText} onChange={e => setInputText(e.target.value)}
          placeholder="Cole aqui o texto da atividade que deseja redesenhar…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
          rows={8} />

        {/* Preflight de créditos */}
        <div className="mt-3 mb-4 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 text-xs space-y-1">
          <div className="flex items-center gap-2 mb-1.5">
            <Coins size={13} className="text-brand-500 shrink-0" />
            <span className="font-bold text-gray-700">Custo previsto</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Redesenho pedagógico (texto)</span>
            <strong className="text-brand-700">{TEXT_COST} créditos</strong>
          </div>
          {modelGeneratesImage(model) && (
            <div className="flex justify-between text-gray-600">
              <span>Geração de imagem ({getModelConfig(model).name})</span>
              <strong className="text-brand-700">{imgCost} créditos</strong>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-800 border-t border-orange-200 pt-1.5 mt-0.5">
            <span>Total</span>
            <strong className="text-brand-700">{totalCredits} créditos</strong>
          </div>
          {modelGeneratesImage(model) && (
            <p className="text-[10px] text-gray-400 pt-0.5">Imagem cobrada somente se geração tiver sucesso.</p>
          )}
        </div>

        <button onClick={handleRedesign} disabled={loading}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-orange-200 disabled:opacity-60">
          {loading ? <><Loader size={16} className="animate-spin" /> Redesenhando…</> : <><Wand2 size={16} /> Redesenhar Atividade com IA</>}
        </button>
      </div>

      {imageError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Imagem não foi gerada</p>
            <p className="text-xs text-amber-700 mt-1">{imageError}</p>
            <p className="text-xs text-amber-500 mt-1">Créditos de geração de imagem não foram cobrados.</p>
          </div>
        </div>
      )}

      {result && (() => {
        const inlineImgFromRedesigned = extractImageFromJson(result.redesigned);
        const displayImageUrl = inlineImgFromRedesigned || generatedImageUrl;
        const showTextResult  = !inlineImgFromRedesigned;
        return (
        <div className="space-y-4">
          {showTextResult && (result.suggestions ?? []).length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={15} className="text-amber-600" />
                <span className="text-xs font-bold text-amber-700 uppercase">Sugestões de Melhoria</span>
              </div>
              <ul className="space-y-1.5">
                {(result.suggestions ?? []).map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                    <span className="bg-amber-200 text-amber-800 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {showTextResult && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={15} className="text-gray-500" />
                <span className="text-xs font-bold text-gray-500 uppercase">Original</span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{result.original}</p>
            </div>
            <div className="bg-orange-50 rounded-2xl border border-orange-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Wand2 size={15} className="text-brand-600" />
                  <span className="text-xs font-bold text-brand-700 uppercase">Redesenhada</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => exportAsDoc(result.redesigned, 'atividade_redesenhada.doc')}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-white border border-orange-200 text-brand-600 font-bold hover:bg-orange-100">
                    <Download size={10} /> DOCX
                  </button>
                  <button onClick={() => window.print()}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-white border border-orange-200 text-brand-600 font-bold hover:bg-orange-100">
                    <Printer size={10} /> PDF
                  </button>
                </div>
              </div>
              <div className="folha-a4-compact">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.redesigned}</ReactMarkdown>
              </div>
            </div>
          </div>
          )}
          {displayImageUrl && (
            <div className="bg-white rounded-2xl border border-brand-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={15} className="text-brand-600" />
                <span className="text-xs font-bold text-brand-700 uppercase">Imagem Pedagógica Gerada</span>
                <button
                  onClick={() => downloadImageAsFile(displayImageUrl, 'imagem_redesenhada.png')}
                  className="ml-auto flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-brand-50 border border-brand-200 text-brand-600 font-bold hover:bg-brand-100">
                  <Download size={10} /> Baixar
                </button>
              </div>
              <img
                src={displayImageUrl}
                alt="Imagem gerada para atividade redesenhada"
                className="max-h-64 mx-auto rounded-xl object-contain border border-gray-100"
                style={{ display: 'block', maxWidth: '100%' }}
              />
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
};
