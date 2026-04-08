/**
 * SchoolTemplatesView.tsx
 * Aba "Meus Modelos" — Modelos Personalizados da Escola
 *
 * Fluxo:
 *  1. Usuário arrasta ou seleciona um .docx
 *  2. Dá um nome amigável (opcional)
 *  3. Clica em "Preparar Documento"
 *  4. IA classifica + injeta tags → .docx preparado salvo no Storage
 *  5. Modelo aparece na lista, com badge do tipo de doc e tags identificadas
 *  6. Botão "Baixar Preparado" gera URL assinada
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload, FileText, Sparkles, Download, Trash2,
  CheckCircle, AlertCircle, Clock, RefreshCw,
  ChevronDown, ChevronUp, Tag, Info, BookOpen,
  ClipboardList, GraduationCap, FileSearch, HelpCircle,
} from 'lucide-react';
import {
  prepareTemplate,
  listTemplates,
  deleteTemplate,
  getDownloadUrl,
  DOC_TYPE_LABELS,
  type SchoolTemplate,
  type TemplateDocType,
} from '../services/templateService';
import { PlanTier, type User, type TenantSummary } from '../types';

// ─── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  petrol:  '#1F4E5F',
  dark:    '#2E3A59',
  gold:    '#C69214',
  bg:      '#F6F4EF',
  surface: '#FFFFFF',
  border:  '#E7E2D8',
  muted:   '#8B96A7',
  success: '#16A34A',
  error:   '#DC2626',
  warning: '#D97706',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function docTypeIcon(type?: TemplateDocType) {
  switch (type) {
    case 'PEI':           return <BookOpen size={14} />;
    case 'PAEE':          return <ClipboardList size={14} />;
    case 'PDI':           return <GraduationCap size={14} />;
    case 'estudo_de_caso':return <FileSearch size={14} />;
    default:              return <HelpCircle size={14} />;
  }
}

function docTypeBadgeColor(type?: TemplateDocType): string {
  switch (type) {
    case 'PEI':           return '#1d4ed8';
    case 'PAEE':          return '#7c3aed';
    case 'PDI':           return '#0f766e';
    case 'estudo_de_caso':return '#b45309';
    default:              return C.muted;
  }
}

function statusIcon(status: SchoolTemplate['status']) {
  switch (status) {
    case 'ready':      return <CheckCircle size={15} color={C.success} />;
    case 'error':      return <AlertCircle size={15} color={C.error} />;
    case 'processing': return <RefreshCw   size={15} color={C.gold} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />;
    default:           return <Clock       size={15} color={C.muted} />;
  }
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtConfidence(v?: number) {
  if (v === undefined || v === null) return '';
  return `${Math.round(v * 100)}% de confiança`;
}

// ─── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  user: User;
  tenantSummary: TenantSummary | null;
}

// ─── Componente principal ──────────────────────────────────────────────────────
export const SchoolTemplatesView: React.FC<Props> = ({ user, tenantSummary }) => {
  // Estado da lista
  const [templates, setTemplates] = useState<SchoolTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filterType, setFilterType] = useState<TemplateDocType | 'all'>('all');

  // Estado do upload
  const [dragOver, setDragOver]     = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [friendlyName, setFriendlyName] = useState('');
  const [preparing, setPreparing]   = useState(false);
  const [progress, setProgress]     = useState({ step: '', pct: 0 });
  const [uploadError, setUploadError] = useState('');

  // Expandidos
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Plano: PRO ou superior exigido ──────────────────────────────────────────
  // Usa planTier do tenantSummary (código canônico) ou user.plan como fallback
  const planLabel = tenantSummary?.planTier ?? user.plan ?? PlanTier.FREE;
  const isPlanOk = [
    PlanTier.PRO, PlanTier.PREMIUM,
    'PRO', 'MASTER', 'PREMIUM', 'INSTITUTIONAL',
  ].includes(planLabel as string);

  // ── Carrega lista ────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listTemplates(filterType === 'all' ? undefined : filterType);
      setTemplates(list);
    } catch (err: any) {
      console.error('[SchoolTemplates] listTemplates error:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => { reload(); }, [reload]);

  // ── Drag & Drop ──────────────────────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    acceptFile(file);
  }, []);

  const acceptFile = (file: File) => {
    if (!file.name.match(/\.docx?$/i)) {
      setUploadError('Apenas arquivos .docx são aceitos.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('Arquivo muito grande. Máximo: 20 MB.');
      return;
    }
    setUploadError('');
    setSelectedFile(file);
    if (!friendlyName) {
      setFriendlyName(file.name.replace(/\.docx?$/i, '').replace(/[_-]/g, ' '));
    }
  };

  // ── "Preparar Documento" ────────────────────────────────────────────────────
  const handlePrepare = async () => {
    if (!selectedFile) return;
    setPreparing(true);
    setUploadError('');
    try {
      const name = friendlyName.trim() || selectedFile.name.replace(/\.docx?$/i, '');
      await prepareTemplate(selectedFile, name, (step, pct) => {
        setProgress({ step, pct });
      });
      setSelectedFile(null);
      setFriendlyName('');
      setProgress({ step: '', pct: 0 });
      await reload();
    } catch (err: any) {
      setUploadError(err?.message ?? 'Erro desconhecido ao preparar o documento.');
    } finally {
      setPreparing(false);
    }
  };

  // ── Download ─────────────────────────────────────────────────────────────────
  const handleDownload = async (tmpl: SchoolTemplate) => {
    try {
      const url = await getDownloadUrl(tmpl);
      const a = document.createElement('a');
      a.href = url;
      a.download = tmpl.originalFilename.replace('.docx', '_preparado.docx');
      a.click();
    } catch (err: any) {
      alert(err?.message ?? 'Erro ao gerar link de download.');
    }
  };

  // ── Excluir ──────────────────────────────────────────────────────────────────
  const handleDelete = async (tmpl: SchoolTemplate) => {
    if (!confirm(`Excluir o modelo "${tmpl.name}"?`)) return;
    try {
      await deleteTemplate(tmpl.id);
      setTemplates(prev => prev.filter(t => t.id !== tmpl.id));
    } catch (err: any) {
      alert(err?.message ?? 'Erro ao excluir modelo.');
    }
  };

  // ── Tags encontradas ─────────────────────────────────────────────────────────
  const foundTags = (tmpl: SchoolTemplate) =>
    tmpl.tagsInjected?.filter(t => t.found) ?? [];

  // ─── Render ───────────────────────────────────────────────────────────────────

  // Guard: plano insuficiente
  if (!isPlanOk) {
    return (
      <div style={{
        minHeight: '100vh', background: C.bg, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 32,
      }}>
        <div style={{
          background: C.surface, borderRadius: 16, padding: '48px 40px',
          maxWidth: 480, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ color: C.dark, fontWeight: 700, fontSize: 22, marginBottom: 12 }}>
            Recurso PRO
          </h2>
          <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6 }}>
            Modelos Personalizados da Escola está disponível a partir do plano{' '}
            <strong style={{ color: C.petrol }}>Profissional</strong>.
            Faça upgrade para usar seus próprios templates de Word.
          </p>
          <div style={{
            marginTop: 24, padding: '12px 20px', background: '#FEF9EE',
            borderRadius: 8, border: `1px solid ${C.gold}30`,
          }}>
            <span style={{ color: C.gold, fontWeight: 600, fontSize: 14 }}>
              Plano atual: {tenantSummary?.planDisplayName ?? String(planLabel)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 32px' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `${C.petrol}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileText size={22} color={C.petrol} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.dark, margin: 0 }}>
              Meus Modelos
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              Suba os modelos .docx da sua escola. A IA prepara e injeta as variáveis automaticamente.
            </p>
          </div>
        </div>
      </div>

      {/* ── Card de Upload ── */}
      <div style={{
        background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
        padding: 28, marginBottom: 28,
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 20 }}>
          Novo Modelo
        </h2>

        {/* Zona de drop */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !selectedFile && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? C.petrol : selectedFile ? C.success : C.border}`,
            borderRadius: 12,
            padding: '32px 24px',
            textAlign: 'center',
            cursor: selectedFile ? 'default' : 'pointer',
            background: dragOver ? `${C.petrol}08` : selectedFile ? `${C.success}06` : '#FAFAF8',
            transition: 'all 0.2s',
            marginBottom: 20,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.doc"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) acceptFile(f); }}
          />

          {selectedFile ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <FileText size={40} color={C.success} />
              <p style={{ fontWeight: 600, color: C.dark, margin: 0, fontSize: 15 }}>
                {selectedFile.name}
              </p>
              <p style={{ color: C.muted, margin: 0, fontSize: 13 }}>
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
              <button
                onClick={e => { e.stopPropagation(); setSelectedFile(null); setFriendlyName(''); setUploadError(''); }}
                style={{
                  marginTop: 4, padding: '4px 14px', borderRadius: 6,
                  border: `1px solid ${C.border}`, background: 'white',
                  color: C.muted, fontSize: 12, cursor: 'pointer',
                }}
              >
                Remover
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Upload size={40} color={C.muted} />
              <p style={{ fontWeight: 600, color: C.dark, margin: 0, fontSize: 15 }}>
                Arraste seu arquivo .docx aqui
              </p>
              <p style={{ color: C.muted, margin: 0, fontSize: 13 }}>
                ou <span style={{ color: C.petrol, textDecoration: 'underline' }}>clique para selecionar</span>
              </p>
              <p style={{ color: C.muted, margin: 0, fontSize: 11 }}>
                Máximo 20 MB · Apenas arquivos Word (.docx)
              </p>
            </div>
          )}
        </div>

        {/* Nome amigável */}
        {selectedFile && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 6 }}>
              Nome do modelo (opcional)
            </label>
            <input
              type="text"
              value={friendlyName}
              onChange={e => setFriendlyName(e.target.value)}
              placeholder="Ex: PEI Municipal 2025 — Modelo da Secretaria"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: `1px solid ${C.border}`, fontSize: 14, color: C.dark,
                background: '#FAFAF8', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Erro */}
        {uploadError && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '10px 14px', background: '#FEF2F2', borderRadius: 8,
            border: `1px solid ${C.error}30`, marginBottom: 16,
          }}>
            <AlertCircle size={16} color={C.error} style={{ marginTop: 1, flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 13, color: C.error }}>{uploadError}</p>
          </div>
        )}

        {/* Progresso */}
        {preparing && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: C.dark, fontWeight: 500 }}>{progress.step}</span>
              <span style={{ fontSize: 13, color: C.muted }}>{progress.pct}%</span>
            </div>
            <div style={{
              height: 6, borderRadius: 99, background: C.border, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 99,
                background: `linear-gradient(90deg, ${C.petrol}, ${C.gold})`,
                width: `${progress.pct}%`,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        {/* Botão principal */}
        {/* Custo de creditos */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 10, padding: '6px 12px',
          background: '#fefce8', border: '1px solid #fde68a',
          borderRadius: 8, fontSize: 12, color: '#92650a', fontWeight: 600,
        }}>
          <span>🪙</span>
          <span>Esta operação consome <strong>3 créditos IA</strong> — análise + injeção de tags com Gemini</span>
        </div>
        <button
          onClick={handlePrepare}
          disabled={!selectedFile || preparing}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '14px 28px', borderRadius: 10,
            background: (!selectedFile || preparing)
              ? C.border
              : `linear-gradient(135deg, ${C.petrol}, ${C.dark})`,
            color: (!selectedFile || preparing) ? C.muted : 'white',
            border: 'none', fontSize: 15, fontWeight: 700,
            cursor: (!selectedFile || preparing) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            width: '100%',
          }}
        >
          {preparing ? (
            <>
              <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
              Preparando…
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Preparar Documento
            </>
          )}
        </button>

        {/* Dica */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14,
          padding: '10px 14px', background: `${C.petrol}08`, borderRadius: 8,
        }}>
          <Info size={14} color={C.petrol} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 12, color: C.petrol, lineHeight: 1.5 }}>
            A IA vai identificar o tipo de documento e substituir os campos em branco
            ({'"______"'}) pelas variáveis do sistema (ex: {'{{nome_estudante}}'}).
            O layout original é preservado.
          </p>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>Filtrar por tipo:</span>
        {(['all', 'PEI', 'PAEE', 'PDI', 'estudo_de_caso', 'outro'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            style={{
              padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
              border: `1.5px solid ${filterType === t ? C.petrol : C.border}`,
              background: filterType === t ? C.petrol : 'white',
              color: filterType === t ? 'white' : C.muted,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {t === 'all' ? 'Todos' : t === 'estudo_de_caso' ? 'Estudo de Caso' : t}
          </button>
        ))}

        <button
          onClick={reload}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 99, fontSize: 12,
            border: `1.5px solid ${C.border}`, background: 'white',
            color: C.muted, cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} />
          Atualizar
        </button>
      </div>

      {/* ── Lista de modelos ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
          <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
          <p style={{ margin: 0 }}>Carregando modelos…</p>
        </div>
      ) : templates.length === 0 ? (
        <div style={{
          background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
          padding: '56px 32px', textAlign: 'center',
        }}>
          <FileText size={48} color={C.border} style={{ marginBottom: 16 }} />
          <h3 style={{ color: C.dark, fontWeight: 600, marginBottom: 8 }}>
            Nenhum modelo cadastrado ainda
          </h3>
          <p style={{ color: C.muted, fontSize: 14, maxWidth: 400, margin: '0 auto' }}>
            Faça o upload do modelo Word da sua escola acima para começar.
            A IA vai preparar automaticamente.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {templates.map(tmpl => {
            const isExpanded = expandedId === tmpl.id;
            const tags = foundTags(tmpl);
            const badgeColor = docTypeBadgeColor(tmpl.documentType);

            return (
              <div
                key={tmpl.id}
                style={{
                  background: C.surface, borderRadius: 12,
                  border: `1px solid ${isExpanded ? C.petrol + '40' : C.border}`,
                  overflow: 'hidden',
                  boxShadow: isExpanded ? `0 4px 20px ${C.petrol}15` : '0 1px 4px rgba(0,0,0,0.04)',
                  transition: 'all 0.2s',
                }}
              >
                {/* ── Linha principal ── */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px 20px', cursor: 'pointer',
                }}
                  onClick={() => setExpandedId(isExpanded ? null : tmpl.id)}
                >
                  {/* Ícone status */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 9,
                    background: `${C.petrol}10`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <FileText size={18} color={C.petrol} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: C.dark, fontSize: 15 }}>
                        {tmpl.name}
                      </span>
                      {tmpl.documentType && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 9px', borderRadius: 99, fontSize: 11,
                          fontWeight: 700, background: `${badgeColor}15`, color: badgeColor,
                          border: `1px solid ${badgeColor}30`,
                        }}>
                          {docTypeIcon(tmpl.documentType)}
                          {tmpl.documentType === 'estudo_de_caso' ? 'Estudo de Caso' : tmpl.documentType}
                        </span>
                      )}
                      {tmpl.aiConfidence !== undefined && tmpl.aiConfidence > 0 && (
                        <span style={{ fontSize: 11, color: C.muted }}>
                          {fmtConfidence(tmpl.aiConfidence)}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: C.muted }}>
                        {tmpl.originalFilename}
                      </span>
                      <span style={{ fontSize: 12, color: C.muted }}>
                        Criado em {fmtDate(tmpl.createdAt)}
                      </span>
                      {tags.length > 0 && (
                        <span style={{
                          fontSize: 11, color: C.success, fontWeight: 600,
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                          <Tag size={11} />
                          {tags.length} {tags.length === 1 ? 'tag injetada' : 'tags injetadas'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status + ações */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {statusIcon(tmpl.status)}
                    {tmpl.status === 'ready' && (
                      <button
                        onClick={e => { e.stopPropagation(); handleDownload(tmpl); }}
                        title="Baixar arquivo preparado"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '6px 12px', borderRadius: 7,
                          background: `${C.petrol}10`, border: `1px solid ${C.petrol}30`,
                          color: C.petrol, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        <Download size={13} />
                        Baixar
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(tmpl); }}
                      title="Excluir modelo"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 30, height: 30, borderRadius: 6,
                        background: 'white', border: `1px solid ${C.border}`,
                        color: C.error, cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                    {isExpanded
                      ? <ChevronUp size={16} color={C.muted} />
                      : <ChevronDown size={16} color={C.muted} />
                    }
                  </div>
                </div>

                {/* ── Painel expandido ── */}
                {isExpanded && (
                  <div style={{
                    borderTop: `1px solid ${C.border}`,
                    padding: '20px 22px',
                    background: '#FAFAF8',
                  }}>
                    {/* Erro */}
                    {tmpl.status === 'error' && tmpl.errorMessage && (
                      <div style={{
                        display: 'flex', gap: 8, padding: '10px 14px',
                        background: '#FEF2F2', borderRadius: 8, marginBottom: 16,
                        border: `1px solid ${C.error}30`,
                      }}>
                        <AlertCircle size={15} color={C.error} style={{ flexShrink: 0, marginTop: 1 }} />
                        <p style={{ margin: 0, fontSize: 13, color: C.error }}>{tmpl.errorMessage}</p>
                      </div>
                    )}

                    {/* Raciocínio da IA */}
                    {tmpl.aiReasoning && (
                      <div style={{ marginBottom: 16 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Análise da IA
                        </p>
                        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>
                          {tmpl.aiReasoning}
                        </p>
                      </div>
                    )}

                    {/* Tags injetadas */}
                    {tmpl.tagsInjected && tmpl.tagsInjected.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Tags Identificadas ({tags.length} encontradas)
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {tmpl.tagsInjected.map((t, i) => (
                            <span
                              key={i}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '4px 10px', borderRadius: 99, fontSize: 11,
                                fontWeight: 600,
                                background: t.found ? `${C.success}15` : `${C.muted}15`,
                                color: t.found ? C.success : C.muted,
                                border: `1px solid ${t.found ? C.success + '30' : C.muted + '30'}`,
                              }}
                            >
                              {t.found ? <CheckCircle size={10} /> : <Clock size={10} />}
                              {t.tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Mapa de substituições */}
                    {tmpl.replacementsMap && tmpl.replacementsMap.length > 0 && (
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Substituições Aplicadas
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {tmpl.replacementsMap.map((r, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'grid', gridTemplateColumns: '1fr auto 1fr',
                                alignItems: 'center', gap: 8,
                                padding: '8px 12px', background: 'white',
                                borderRadius: 8, border: `1px solid ${C.border}`,
                                fontSize: 12,
                              }}
                            >
                              <span style={{
                                color: C.muted, overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {r.find}
                              </span>
                              <span style={{ color: C.border, fontWeight: 700 }}>→</span>
                              <span style={{
                                color: C.petrol, fontFamily: 'monospace',
                                fontWeight: 700, fontSize: 11,
                              }}>
                                {r.tag}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Nota sobre roteamento dinâmico ── */}
      {templates.some(t => t.status === 'ready') && (
        <div style={{
          marginTop: 24, padding: '14px 18px',
          background: `${C.gold}10`, borderRadius: 10,
          border: `1px solid ${C.gold}30`,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <Info size={15} color={C.gold} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 13, color: C.dark, lineHeight: 1.6 }}>
            <strong>Roteamento automático:</strong> Modelos classificados como{' '}
            <strong>Estudo de Caso</strong> aparecerão automaticamente na aba de geração de Estudo de Caso.
            Modelos de <strong>PEI</strong>, <strong>PAEE</strong> e <strong>PDI</strong> ficam disponíveis
            nos respectivos geradores de documentos.
          </p>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
