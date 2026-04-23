// RelatorioPreview.tsx — Wrapper do RelatorioViewer com toolbar, edição inline e print
// Preview = PDF: impressão via DOM overlay (mesmo HTML que o usuário vê na tela)

import React, { useState, useRef } from 'react';
import { Edit2, Printer, Download, Save, X, ChevronLeft, CheckCircle } from 'lucide-react';
import { RelatorioViewer } from './RelatorioViewer';
import type {
  RelatorioResultado,
  RelatorioSimples,
  RelatorioCompleto,
} from '../services/reportService';
import type { Student, SchoolConfig } from '../types';

// ── Campo editável simples ────────────────────────────────────────────────────
const EditBlock: React.FC<{
  label: string;
  value: string;
  rows?: number;
  onChange: (v: string) => void;
}> = ({ label, value, rows = 4, onChange }) => (
  <div>
    <label
      className="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
      style={{ color: '#667085' }}
    >
      {label}
    </label>
    <textarea
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      rows={rows}
      className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-y focus:outline-none focus:ring-2"
      style={{ '--tw-ring-color': '#1F4E5F' } as React.CSSProperties}
    />
  </div>
);

// ── Lista editável (string[]) ─────────────────────────────────────────────────
const EditListBlock: React.FC<{
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
}> = ({ label, items, onChange }) => (
  <div>
    <label
      className="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
      style={{ color: '#667085' }}
    >
      {label}
      <span className="ml-1 font-normal normal-case">(um item por linha)</span>
    </label>
    <textarea
      value={(items ?? []).join('\n')}
      onChange={e => onChange(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
      rows={Math.max((items ?? []).length + 1, 3)}
      className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-y focus:outline-none focus:ring-2 font-mono"
      style={{ '--tw-ring-color': '#1F4E5F' } as React.CSSProperties}
    />
  </div>
);

// ── Props ─────────────────────────────────────────────────────────────────────
export interface RelatorioPreviewProps {
  resultado: RelatorioResultado;
  student: Student;
  scores: number[];
  school?: SchoolConfig | null;
  onUpdate: (r: RelatorioResultado) => void;
  /** Opcional — quando fornecido, persiste as edições no banco ao salvar */
  onSaveEdits?: (r: RelatorioResultado) => Promise<void>;
  onClose: () => void;
}

// ── Componente principal ──────────────────────────────────────────────────────
export const RelatorioPreview: React.FC<RelatorioPreviewProps> = ({
  resultado,
  student,
  scores,
  school,
  onUpdate,
  onSaveEdits,
  onClose,
}) => {
  const [showEdit, setShowEdit] = useState(false);
  const [draft, setDraft] = useState<RelatorioResultado>(resultado);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);

  const d = draft.data;
  const isComplete = d.tipo === 'completo';

  // Patch helpers
  const patchField = (key: string, value: unknown) =>
    setDraft(prev => ({ ...prev, data: { ...prev.data, [key]: value } as typeof prev.data }));

  const handleSaveEdits = async () => {
    // Atualiza estado local imediatamente
    onUpdate(draft);
    setSaved(true);
    setSaving(true);
    try {
      if (onSaveEdits) await onSaveEdits(draft);
    } finally {
      setSaving(false);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  // Print: injeta clone direto no body e esconde demais filhos via JS
  const handlePrint = async () => {
    const el = viewerRef.current;
    if (!el) return;

    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.print\\:hidden, [data-no-print]').forEach(n => n.remove());
    clone.style.cssText = 'max-height:none;overflow:visible;padding:0;margin:0;background:white;';
    clone.id = '__relatorio_print_content__';

    // Esconde todos os filhos do body diretamente (sem depender de @media print)
    const bodyKids = Array.from(document.body.children) as HTMLElement[];
    bodyKids.forEach(el => el.style.setProperty('display', 'none', 'important'));
    document.body.appendChild(clone);

    const style = document.createElement('style');
    style.id = '__relatorio_print_style__';
    style.textContent = `
      @page { size: A4 portrait; margin: 15mm 15mm 20mm 15mm; }
      html, body { margin:0; padding:0;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
      #__relatorio_print_content__ [data-doc-page] {
        width: 100% !important; min-height: auto !important; box-shadow: none !important;
      }
      #__relatorio_print_content__ * { box-shadow: none !important; }
    `;
    document.head.appendChild(style);

    const prevTitle = document.title;
    document.title = `Relatório — ${student.name}`;
    await new Promise<void>(r => setTimeout(r, 200));
    window.print();

    setTimeout(() => {
      document.title = prevTitle;
      clone.remove();
      style.remove();
      bodyKids.forEach(el => el.style.removeProperty('display'));
    }, 800);
  };

  return (
    <div
      className="rounded-2xl border-2 overflow-hidden"
      style={{ borderColor: '#1F4E5F' }}
    >
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3 print:hidden"
        style={{ background: 'linear-gradient(135deg, #1F4E5F 0%, #2E3A59 100%)' }}
      >
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs font-medium transition"
        >
          <ChevronLeft size={14} /> Voltar ao formulário
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEdit(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition"
            style={{
              background: showEdit ? 'rgba(198,146,20,0.25)' : 'rgba(255,255,255,0.15)',
              color: showEdit ? '#C69214' : '#ffffff',
              border: `1px solid ${showEdit ? '#C69214' : 'rgba(255,255,255,0.55)'}`,
            }}
          >
            {showEdit ? <><X size={12} /> Fechar edição</> : <><Edit2 size={12} /> Editar</>}
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition"
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.55)',
            }}
          >
            <Printer size={13} /> Imprimir
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition"
            style={{ background: '#C69214' }}
          >
            <Download size={13} /> Exportar PDF
          </button>
        </div>
      </div>

      {/* ── Painel de edição ─────────────────────────────────────────────────── */}
      {showEdit && (
        <div
          className="p-5 border-b print:hidden"
          style={{ background: '#F6F4EF', borderColor: '#E7E2D8' }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold" style={{ color: '#1F4E5F' }}>
              Editar campos — as alterações ficam apenas neste relatório
            </p>
            <button
              onClick={handleSaveEdits}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ background: '#1F4E5F' }}
            >
              {saving
                ? <><Save size={13} className="animate-pulse" /> Salvando…</>
                : saved
                  ? <><CheckCircle size={13} /> Salvo!</>
                  : <><Save size={13} /> Salvar edições</>}
            </button>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto"
            style={{ maxHeight: '60vh' }}
          >
            {/* Campos comuns */}
            {d.identificacao !== undefined && (
              <EditBlock
                label="Identificação e Contexto"
                value={d.identificacao}
                onChange={v => patchField('identificacao', v)}
              />
            )}
            {(d as any).situacaoFuncional !== undefined && (
              <EditBlock
                label="Situação Funcional"
                value={(d as any).situacaoFuncional}
                onChange={v => patchField('situacaoFuncional', v)}
              />
            )}
            {d.conclusao !== undefined && (
              <EditBlock
                label="Conclusão e Parecer"
                rows={5}
                value={d.conclusao}
                onChange={v => patchField('conclusao', v)}
              />
            )}

            {/* Campos do modo SIMPLES */}
            {!isComplete && (() => {
              const s = d as RelatorioSimples;
              return (
                <>
                  <EditBlock
                    label="Situação Pedagógica Atual"
                    rows={5}
                    value={s.situacaoPedagogicaAtual}
                    onChange={v => patchField('situacaoPedagogicaAtual', v)}
                  />
                  {s.observacoesRelevantes !== undefined && (
                    <EditBlock
                      label="Observações Relevantes"
                      value={s.observacoesRelevantes}
                      onChange={v => patchField('observacoesRelevantes', v)}
                    />
                  )}
                  <EditListBlock
                    label="Dificuldades"
                    items={s.dificuldades ?? []}
                    onChange={v => patchField('dificuldades', v)}
                  />
                  <EditListBlock
                    label="Recomendações"
                    items={s.recomendacoes ?? []}
                    onChange={v => patchField('recomendacoes', v)}
                  />
                </>
              );
            })()}

            {/* Campos do modo COMPLETO */}
            {isComplete && (() => {
              const c = d as RelatorioCompleto;
              return (
                <>
                  <EditBlock
                    label="Resumo Executivo"
                    rows={4}
                    value={c.resumoExecutivo}
                    onChange={v => patchField('resumoExecutivo', v)}
                  />
                  <EditBlock
                    label="Análise Pedagógica"
                    rows={5}
                    value={c.analisePedagogica}
                    onChange={v => patchField('analisePedagogica', v)}
                  />
                  <EditBlock
                    label="Perfil Cognitivo"
                    value={c.perfilCognitivo}
                    onChange={v => patchField('perfilCognitivo', v)}
                  />
                  <EditBlock
                    label="Histórico Relevante"
                    value={c.historicoRelevante}
                    onChange={v => patchField('historicoRelevante', v)}
                  />
                  <EditBlock
                    label="Evolução Observada"
                    value={c.evolucaoObservada}
                    onChange={v => patchField('evolucaoObservada', v)}
                  />
                  {c.observacoesRelevantes !== undefined && (
                    <EditBlock
                      label="Observações Relevantes"
                      value={c.observacoesRelevantes}
                      onChange={v => patchField('observacoesRelevantes', v)}
                    />
                  )}
                  <EditListBlock
                    label="Dificuldades"
                    items={c.dificuldades ?? []}
                    onChange={v => patchField('dificuldades', v)}
                  />
                  <EditListBlock
                    label="Potencialidades"
                    items={c.potencialidades ?? []}
                    onChange={v => patchField('potencialidades', v)}
                  />
                  <EditListBlock
                    label="Estratégias Eficazes"
                    items={c.estrategiasEficazes ?? []}
                    onChange={v => patchField('estrategiasEficazes', v)}
                  />
                  <EditListBlock
                    label="Recomendações Pedagógicas"
                    items={c.recomendacoesPedagogicas ?? []}
                    onChange={v => patchField('recomendacoesPedagogicas', v)}
                  />
                  <EditListBlock
                    label="Recomendações Clínicas"
                    items={c.recomendacoesClinicas ?? []}
                    onChange={v => patchField('recomendacoesClinicas', v)}
                  />
                  <EditListBlock
                    label="Recomendações para a Família"
                    items={c.recomendacoesFamiliares ?? []}
                    onChange={v => patchField('recomendacoesFamiliares', v)}
                  />
                  <EditListBlock
                    label="Recomendações Institucionais"
                    items={c.recomendacoesInstitucionais ?? []}
                    onChange={v => patchField('recomendacoesInstitucionais', v)}
                  />
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Documento / Viewer ───────────────────────────────────────────────── */}
      <div
        ref={viewerRef}
        className="bg-white overflow-auto"
        style={{ maxHeight: '85vh', padding: '24px' }}
      >
        <RelatorioViewer
          student={student}
          scores={scores}
          resultado={draft}
          school={school}
        />
      </div>
    </div>
  );
};