/**
 * StudentImportModal.tsx
 * Modal de importação de alunos por CSV — 4 etapas:
 *   1. upload   — zona de arraste + download modelo + dica + teaser IA (futuro)
 *   2. preview  — tabela com status por linha, resumo de campos
 *   3. importing — barra de progresso animada
 *   4. done     — resultado: importados, incompletos, pré-cadastros, erros
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  Upload, Download, X, CheckCircle, AlertCircle, AlertTriangle,
  FileText, Eye, EyeOff, Sparkles, Users, ArrowRight, Loader2,
  FileUp, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import {
  parseCSV,
  downloadTemplate,
  downloadExample,
  importStudentsBatch,
  TEMPLATE_EXAMPLE_ROWS,
  TEMPLATE_HEADERS,
  type ImportStudentRow,
  type ParsedCSVResult,
  type ImportBatchResult,
} from '../services/csvImportService';

// ─── Paleta ────────────────────────────────────────────────────────────────
const C = {
  petrol:    '#1F4E5F',
  dark:      '#2E3A59',
  gold:      '#C69214',
  goldLight: '#FDF6E3',
  bg:        '#F6F4EF',
  surface:   '#FFFFFF',
  border:    '#E7E2D8',
  borderMid: '#C9C3B5',
  text:      '#1F2937',
  textSec:   '#667085',
  red:       '#DC2626',
  redLight:  '#FEF2F2',
  amber:     '#D97706',
  amberLight:'#FFFBEB',
  green:     '#16A34A',
  greenLight:'#F0FDF4',
};

// ─── Tipos internos ────────────────────────────────────────────────────────
type ImportStep = 'upload' | 'preview' | 'importing' | 'done';

interface Props {
  tenantId: string;
  userId: string;
  onClose: () => void;
  onImportComplete: (importedCount: number) => void;
}

// ─── Badge de status ────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ImportStudentRow['registrationStatus'] }) {
  if (status === 'complete') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ background: C.greenLight, color: C.green }}>
      <CheckCircle size={10} /> Completo
    </span>
  );
  if (status === 'incomplete') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ background: C.amberLight, color: C.amber }}>
      <AlertTriangle size={10} /> Incompleto
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ background: C.redLight, color: C.red }}>
      <AlertCircle size={10} /> Pré-cadastro
    </span>
  );
}

// ─── Linha de status da barra lateral ───────────────────────────────────────
function RowBorderColor(status: ImportStudentRow['registrationStatus']): string {
  if (status === 'complete')   return C.green;
  if (status === 'incomplete') return C.amber;
  return C.red;
}

// ─── Componente principal ───────────────────────────────────────────────────
export const StudentImportModal: React.FC<Props> = ({
  tenantId,
  userId,
  onClose,
  onImportComplete,
}) => {
  const [step, setStep]             = useState<ImportStep>('upload');
  const [file, setFile]             = useState<File | null>(null);
  const [parsed, setParsed]         = useState<ParsedCSVResult | null>(null);
  const [progress, setProgress]     = useState(0);
  const [result, setResult]         = useState<ImportBatchResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Leitura do arquivo ────────────────────────────────────────────────────
  const processFile = useCallback((f: File) => {
    setParseError(null);
    if (!f.name.toLowerCase().endsWith('.csv') && f.type !== 'text/csv') {
      setParseError('Por favor, envie um arquivo no formato .csv');
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const result  = parseCSV(content);
        setParsed(result);
        setStep('preview');
      } catch (err: any) {
        setParseError(`Erro ao ler o arquivo: ${err?.message ?? 'formato inválido'}`);
      }
    };
    reader.readAsText(f, 'UTF-8');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, [processFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  // ── Importação ─────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!parsed || parsed.validRows.length === 0) return;
    setStep('importing');
    setProgress(0);
    try {
      const res = await importStudentsBatch(
        parsed.validRows,
        tenantId,
        userId,
        file?.name ?? 'importacao.csv',
        (pct) => setProgress(pct),
      );
      setResult(res);
      setStep('done');
    } catch (e: any) {
      setParseError(`Erro durante a importação: ${e?.message ?? String(e)}`);
      setStep('preview');
    }
  };

  // ── Resumo do preview ──────────────────────────────────────────────────────
  const previewCounts = parsed ? {
    total:      parsed.validRows.length,
    complete:   parsed.validRows.filter(r => r.registrationStatus === 'complete').length,
    incomplete: parsed.validRows.filter(r => r.registrationStatus === 'incomplete').length,
    preReg:     parsed.validRows.filter(r => r.registrationStatus === 'pre_registered').length,
    errors:     parsed.errorRows.length,
  } : null;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}
    >
      <div
        className="relative w-full flex flex-col rounded-2xl overflow-hidden"
        style={{
          background:  C.surface,
          border:      `1.5px solid ${C.border}`,
          maxWidth:    860,
          maxHeight:   '92vh',
          boxShadow:   '0 24px 64px rgba(0,0,0,0.18)',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: C.border, background: C.bg }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                 style={{ background: C.petrol }}>
              <FileUp size={18} color="#fff" />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: C.dark }}>
                Importar Alunos por CSV
              </h2>
              <p className="text-xs" style={{ color: C.textSec }}>
                {step === 'upload'    && 'Envie sua lista de alunos em formato CSV'}
                {step === 'preview'   && `${previewCounts?.total ?? 0} aluno(s) identificados — revise antes de importar`}
                {step === 'importing' && 'Criando cadastros…'}
                {step === 'done'      && 'Importação concluída'}
              </p>
            </div>
          </div>
          {step !== 'importing' && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:opacity-70"
              style={{ background: C.border }}
            >
              <X size={16} style={{ color: C.dark }} />
            </button>
          )}
        </div>

        {/* ── Progress steps ────────────────────────────────────────────── */}
        <div className="flex items-center gap-0 px-6 pt-4 shrink-0">
          {(['upload','preview','importing','done'] as ImportStep[]).map((s, idx) => {
            const labels = ['1. Arquivo','2. Revisão','3. Importando','4. Concluído'];
            const isActive   = step === s;
            const isPast     = (['upload','preview','importing','done'] as ImportStep[]).indexOf(step) > idx;
            return (
              <React.Fragment key={s}>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: isPast ? C.green : isActive ? C.petrol : C.border,
                      color:      isPast || isActive ? '#fff' : C.textSec,
                    }}
                  >
                    {isPast ? '✓' : idx + 1}
                  </div>
                  <span className="text-xs font-medium hidden sm:block"
                        style={{ color: isActive ? C.dark : C.textSec }}>
                    {labels[idx]}
                  </span>
                </div>
                {idx < 3 && (
                  <div className="flex-1 h-px mx-2" style={{ background: isPast ? C.green : C.border }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Conteúdo scrollável ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ════════════════════════════════════════════════════════════════
              STEP 1 — UPLOAD
          ════════════════════════════════════════════════════════════════ */}
          {step === 'upload' && (
            <div className="p-6 flex flex-col gap-5">

              {/* Botões de modelo + exemplo */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-85"
                  style={{ background: C.petrol, boxShadow: '0 4px 12px rgba(31,78,95,0.22)' }}
                >
                  <Download size={15} /> Baixar modelo CSV
                </button>
                <button
                  onClick={downloadExample}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-80"
                  style={{ background: C.goldLight, color: C.gold, border: `1.5px solid ${C.gold}` }}
                >
                  <FileText size={15} /> Baixar exemplo preenchido
                </button>
                <button
                  onClick={() => setShowExample(v => !v)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-80"
                  style={{ background: C.bg, color: C.dark, border: `1.5px solid ${C.border}` }}
                >
                  {showExample ? <EyeOff size={15}/> : <Eye size={15}/>}
                  {showExample ? 'Ocultar exemplo' : 'Ver exemplo preenchido'}
                </button>
              </div>

              {/* Exemplo inline */}
              {showExample && (
                <div
                  className="rounded-xl overflow-auto border"
                  style={{ borderColor: C.border }}
                >
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: C.bg }}>
                        {TEMPLATE_HEADERS.map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap"
                              style={{ color: C.dark, borderBottom: `1px solid ${C.border}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {TEMPLATE_EXAMPLE_ROWS.map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                          {row.map((cell, j) => (
                            <td key={j} className="px-3 py-2 whitespace-nowrap"
                                style={{ color: cell ? C.text : C.textSec }}>
                              {cell || <span className="italic opacity-50">vazio</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Zona de upload */}
              <div
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all"
                style={{
                  border:     `2px dashed ${isDragOver ? C.petrol : C.borderMid}`,
                  background: isDragOver ? 'rgba(31,78,95,0.04)' : C.bg,
                  padding:    '40px 24px',
                  minHeight:  160,
                }}
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: isDragOver ? C.petrol : '#EEF4F7' }}
                >
                  <Upload size={26} color={isDragOver ? '#fff' : C.petrol} />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-sm" style={{ color: C.dark }}>
                    {isDragOver ? 'Solte o arquivo aqui' : 'Arraste seu arquivo CSV'}
                  </p>
                  <p className="text-xs mt-1" style={{ color: C.textSec }}>
                    ou clique para selecionar • aceita vírgula e ponto-e-vírgula
                  </p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />

              {parseError && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-sm"
                     style={{ background: C.redLight, color: C.red }}>
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {parseError}
                </div>
              )}

              {/* Dica principal */}
              <div
                className="flex items-start gap-3 p-4 rounded-xl"
                style={{ background: '#EEF4F7', border: `1px solid #C5D9E2` }}
              >
                <Info size={16} style={{ color: C.petrol, marginTop: 2, flexShrink: 0 }} />
                <div>
                  <p className="text-sm" style={{ color: C.dark }}>
                    <strong>Dica:</strong> Se você tiver um arquivo em Word ou um documento sem
                    tabela, peça para uma IA organizar esse conteúdo no modelo CSV do IncluiAI
                    antes de importar.
                  </p>
                  <p className="text-xs mt-1.5" style={{ color: C.textSec }}>
                    Sugestão: copie o texto e use o ChatGPT ou Gemini com o prompt
                    <em> "organize esses dados no modelo CSV do IncluiAI"</em> e cole o modelo
                    baixado no contexto.
                  </p>
                </div>
              </div>

              {/* Teaser futuro: Converter com IA */}
              <div
                className="flex items-center justify-between gap-3 p-3.5 rounded-xl"
                style={{
                  background:  'linear-gradient(135deg, #FDF6E3 0%, #FFF9ED 100%)',
                  border:      `1px solid ${C.gold}40`,
                }}
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={16} style={{ color: C.gold }} />
                  <div>
                    <p className="text-xs font-bold" style={{ color: C.dark }}>
                      Converter documento em CSV com IA
                    </p>
                    <p className="text-xs" style={{ color: C.textSec }}>
                      Envie qualquer documento e a IA organiza os dados automaticamente
                    </p>
                  </div>
                </div>
                <span
                  className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: C.gold, color: '#fff' }}
                >
                  Em breve ✨
                </span>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 2 — PREVIEW
          ════════════════════════════════════════════════════════════════ */}
          {step === 'preview' && parsed && previewCounts && (
            <div className="p-6 flex flex-col gap-4">

              {/* Resumo de contagens */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Completos',     value: previewCounts.complete,   color: C.green,  bg: C.greenLight  },
                  { label: 'Incompletos',   value: previewCounts.incomplete, color: C.amber,  bg: C.amberLight  },
                  { label: 'Pré-cadastros', value: previewCounts.preReg,     color: C.red,    bg: C.redLight    },
                  { label: 'Erros (ignorados)', value: previewCounts.errors, color: C.textSec, bg: C.bg         },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className="rounded-xl p-3 text-center"
                       style={{ background: bg, border: `1px solid ${color}30` }}>
                    <p className="text-2xl font-extrabold" style={{ color }}>{value}</p>
                    <p className="text-xs mt-0.5" style={{ color }}>{label}</p>
                  </div>
                ))}
              </div>

              {/* Aviso campos não reconhecidos */}
              {parsed.unrecognizedHeaders.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
                     style={{ background: C.amberLight, color: C.amber }}>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Colunas não reconhecidas (serão ignoradas):{' '}
                    <strong>{parsed.unrecognizedHeaders.join(', ')}</strong>
                  </span>
                </div>
              )}

              {/* Legenda */}
              <div className="flex flex-wrap gap-3 text-xs" style={{ color: C.textSec }}>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: C.green }} />
                  Completo — todos os campos essenciais
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: C.amber }} />
                  Incompleto — faltam alguns campos
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: C.red }} />
                  Pré-cadastro — apenas nome reconhecido
                </span>
              </div>

              {/* Tabela de preview */}
              <div className="rounded-xl overflow-auto border" style={{ borderColor: C.border, maxHeight: 340 }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: C.bg, position: 'sticky', top: 0 }}>
                      {['#', 'Nome', 'Data Nasc.', 'Série', 'Responsável', 'Telefone', 'CID', 'Status'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap"
                            style={{ color: C.dark, borderBottom: `1px solid ${C.border}` }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.validRows.map(row => (
                      <tr
                        key={row.rowIndex}
                        style={{
                          borderBottom:  `1px solid ${C.border}`,
                          borderLeft:    `3px solid ${RowBorderColor(row.registrationStatus)}`,
                        }}
                      >
                        <td className="px-3 py-2" style={{ color: C.textSec }}>{row.rowIndex}</td>
                        <td className="px-3 py-2 font-medium" style={{ color: C.dark }}>
                          {row.name}
                        </td>
                        <td className="px-3 py-2" style={{ color: C.text }}>
                          {row.birthDate
                            ? (() => {
                                // Exibe como DD/MM/YYYY se estiver em ISO
                                const [y,m,d] = (row.birthDate).split('-');
                                return y && m && d ? `${d}/${m}/${y}` : row.birthDate;
                              })()
                            : <span style={{ color: C.textSec }}>—</span>
                          }
                        </td>
                        <td className="px-3 py-2" style={{ color: C.text }}>
                          {row.grade || <span style={{ color: C.textSec }}>—</span>}
                        </td>
                        <td className="px-3 py-2" style={{ color: C.text }}>
                          {row.guardianName || <span style={{ color: C.textSec }}>—</span>}
                        </td>
                        <td className="px-3 py-2" style={{ color: C.text }}>
                          {row.guardianPhone || <span style={{ color: C.textSec }}>—</span>}
                        </td>
                        <td className="px-3 py-2" style={{ color: C.text }}>
                          {row.cid || <span style={{ color: C.textSec }}>—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={row.registrationStatus} />
                            {row.missingRequiredFields.length > 0 && (
                              <span className="text-xs" style={{ color: C.textSec }}>
                                Falta: {row.missingRequiredFields.join(', ')}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {parsed.errorRows.map(row => (
                      <tr key={`err-${row.rowIndex}`}
                          style={{ borderBottom: `1px solid ${C.border}`, opacity: 0.5, borderLeft: `3px solid ${C.borderMid}` }}>
                        <td className="px-3 py-2" style={{ color: C.textSec }}>{row.rowIndex}</td>
                        <td className="px-3 py-2 italic" style={{ color: C.textSec }} colSpan={6}>
                          {row.errorMessage ?? 'Linha inválida'}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-xs px-2 py-0.5 rounded-full"
                                style={{ background: C.border, color: C.textSec }}>
                            Ignorado
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Aviso sobre cadastros incompletos */}
              {(previewCounts.incomplete + previewCounts.preReg) > 0 && (
                <div
                  className="flex items-start gap-3 p-4 rounded-xl"
                  style={{ background: C.amberLight, border: `1px solid ${C.amber}40` }}
                >
                  <AlertTriangle size={16} style={{ color: C.amber, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: C.dark }}>
                      {previewCounts.incomplete + previewCounts.preReg} aluno(s) com cadastro incompleto
                    </p>
                    <p className="text-xs mt-1" style={{ color: C.textSec }}>
                      Eles serão criados como pré-cadastro. Os campos faltantes ficam marcados em
                      vermelho para você completar depois. Documentos institucionais ficam bloqueados
                      até o cadastro ser completado.
                    </p>
                  </div>
                </div>
              )}

              {parseError && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-sm"
                     style={{ background: C.redLight, color: C.red }}>
                  <AlertCircle size={15} className="mt-0.5 shrink-0" /> {parseError}
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 3 — IMPORTING
          ════════════════════════════════════════════════════════════════ */}
          {step === 'importing' && (
            <div className="p-10 flex flex-col items-center gap-6">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center"
                style={{ background: '#EEF4F7' }}
              >
                <Loader2 size={36} style={{ color: C.petrol }} className="animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold" style={{ color: C.dark }}>
                  Criando cadastros…
                </p>
                <p className="text-sm mt-1" style={{ color: C.textSec }}>
                  Aguarde enquanto os alunos são importados.
                </p>
              </div>
              {/* Barra de progresso */}
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-xs mb-1.5" style={{ color: C.textSec }}>
                  <span>Progresso</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: C.border }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width:      `${progress}%`,
                      background: `linear-gradient(90deg, ${C.petrol}, ${C.gold})`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 4 — DONE
          ════════════════════════════════════════════════════════════════ */}
          {step === 'done' && result && (
            <div className="p-6 flex flex-col gap-5">

              {/* Ícone de sucesso */}
              <div className="flex flex-col items-center gap-3 pt-2">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                     style={{ background: C.greenLight }}>
                  <CheckCircle size={32} style={{ color: C.green }} />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-bold" style={{ color: C.dark }}>
                    {result.importedRows} aluno(s) importado(s) com sucesso!
                  </h3>
                  <p className="text-sm mt-1" style={{ color: C.textSec }}>
                    Arquivo: {file?.name ?? 'importacao.csv'}
                  </p>
                </div>
              </div>

              {/* Cards de resultado */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl p-3 text-center"
                     style={{ background: C.greenLight, border: `1px solid ${C.green}30` }}>
                  <p className="text-2xl font-extrabold" style={{ color: C.green }}>{result.completeRows}</p>
                  <p className="text-xs mt-0.5" style={{ color: C.green }}>Cadastros completos</p>
                </div>
                <div className="rounded-xl p-3 text-center"
                     style={{ background: C.amberLight, border: `1px solid ${C.amber}30` }}>
                  <p className="text-2xl font-extrabold" style={{ color: C.amber }}>{result.incompleteRows}</p>
                  <p className="text-xs mt-0.5" style={{ color: C.amber }}>Incompletos</p>
                </div>
                <div className="rounded-xl p-3 text-center"
                     style={{ background: C.redLight, border: `1px solid ${C.red}30` }}>
                  <p className="text-2xl font-extrabold" style={{ color: C.red }}>{result.preRegRows}</p>
                  <p className="text-xs mt-0.5" style={{ color: C.red }}>Pré-cadastros</p>
                </div>
              </div>

              {/* Alerta para cadastros incompletos */}
              {(result.incompleteRows + result.preRegRows) > 0 && (
                <div
                  className="flex items-start gap-3 p-4 rounded-xl"
                  style={{ background: C.redLight, border: `1px solid ${C.red}30` }}
                >
                  <AlertCircle size={16} style={{ color: C.red, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: C.dark }}>
                      {result.incompleteRows + result.preRegRows} aluno(s) com cadastro incompleto
                    </p>
                    <p className="text-xs mt-1" style={{ color: C.textSec }}>
                      Complete o cadastro para liberar a ficha completa e os documentos
                      institucionais. Acesse cada aluno e preencha os campos marcados em vermelho.
                    </p>
                  </div>
                </div>
              )}

              {/* Erros de linha */}
              {result.errors.length > 0 && (
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: C.border }}>
                  <div className="px-4 py-2.5 text-xs font-semibold flex items-center gap-2"
                       style={{ background: C.bg, color: C.dark, borderBottom: `1px solid ${C.border}` }}>
                    <AlertTriangle size={13} style={{ color: C.amber }} />
                    {result.errors.length} linha(s) com erro (não importadas)
                  </div>
                  <div className="divide-y" style={{ borderColor: C.border }}>
                    {result.errors.slice(0, 5).map(err => (
                      <div key={err.rowIndex} className="px-4 py-2 text-xs flex gap-3"
                           style={{ color: C.text }}>
                        <span style={{ color: C.textSec }}>Linha {err.rowIndex}</span>
                        {err.name && <strong>{err.name}</strong>}
                        <span style={{ color: C.red }}>{err.error}</span>
                      </div>
                    ))}
                    {result.errors.length > 5 && (
                      <div className="px-4 py-2 text-xs" style={{ color: C.textSec }}>
                        … e mais {result.errors.length - 5} erro(s)
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer com ações ─────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between gap-3 px-6 py-4 border-t shrink-0"
          style={{ borderColor: C.border, background: C.bg }}
        >
          {/* Esquerda */}
          <div>
            {step === 'preview' && (
              <button
                onClick={() => { setStep('upload'); setParsed(null); setFile(null); setParseError(null); }}
                className="text-sm font-medium transition hover:opacity-70"
                style={{ color: C.textSec }}
              >
                ← Trocar arquivo
              </button>
            )}
          </div>

          {/* Direita */}
          <div className="flex gap-3">
            {step === 'upload' && (
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition hover:opacity-80"
                style={{ background: C.border, color: C.dark }}
              >
                Cancelar
              </button>
            )}

            {step === 'preview' && previewCounts && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition hover:opacity-80"
                  style={{ background: C.border, color: C.dark }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleImport}
                  disabled={previewCounts.total === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: C.petrol, boxShadow: '0 4px 12px rgba(31,78,95,0.22)' }}
                >
                  <Users size={15} />
                  Importar {previewCounts.total} aluno(s)
                  <ArrowRight size={15} />
                </button>
              </>
            )}

            {step === 'done' && (
              <button
                onClick={() => { onImportComplete(result?.importedRows ?? 0); onClose(); }}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition hover:opacity-85"
                style={{ background: C.petrol, boxShadow: '0 4px 12px rgba(31,78,95,0.22)' }}
              >
                <CheckCircle size={15} />
                Ver alunos importados
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentImportModal;
