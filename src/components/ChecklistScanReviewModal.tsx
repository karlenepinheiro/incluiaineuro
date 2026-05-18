// components/ChecklistScanReviewModal.tsx
// Modal de revisão para checklists digitalizados via formato ENEM-like.
// Mostra imagem original + itens detectados com códigos + edição manual + salvar.
// REGRA: nunca salva automaticamente — exige confirmação do usuário.

import React, { useState, useEffect, useMemo } from 'react';
import {
  X, AlertTriangle, Save, RefreshCw, ShieldCheck,
  AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Student, User } from '../types';
import { ScanRawResult } from '../services/checklistScanService';
import {
  REGENTE_SHEET_SECTIONS,
  CUIDADORA_SHEET_SECTIONS,
  REGENTE_CODE_MAP,
  CUIDADORA_CODE_MAP,
  codesToRegenteData,
  codesToCuidadoraData,
} from '../services/checklistSheetService';
import {
  ObservationFormService,
  StudentDocumentService,
  TimelineService,
} from '../services/persistenceService';
import { StorageService } from '../services/storageService';
import { generateDocumentCode } from '../utils/documentCodes';
import { DEMO_MODE } from '../services/supabase';

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface ChecklistScanReviewModalProps {
  scan: ScanRawResult;
  file: File;
  student: Student;
  user: User;
  onClose: () => void;
  onSaved: () => void;
}

// ─── Componente ────────────────────────────────────────────────────────────────

export const ChecklistScanReviewModal: React.FC<ChecklistScanReviewModalProps> = ({
  scan,
  file,
  student,
  user,
  onClose,
  onSaved,
}) => {
  const isRegente = scan.checklistType === 'checklist_regente';
  const sections  = isRegente ? REGENTE_SHEET_SECTIONS : CUIDADORA_SHEET_SECTIONS;
  const codeMap   = isRegente ? REGENTE_CODE_MAP : CUIDADORA_CODE_MAP;

  // Estado editável da revisão
  const [markedCodes, setMarkedCodes] = useState<string[]>(scan.markedCodes ?? []);
  const [extraFields, setExtraFields] = useState<Record<string, string>>(scan.extraFields ?? {});
  const [freeNotes, setFreeNotes]     = useState(scan.freeNotes ?? '');
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(
      sections
        .filter(s => s.codes.some(c => scan.markedCodes?.includes(c)))
        .map(s => s.prefix),
    ),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // URL da imagem para preview
  const [imgUrl, setImgUrl] = useState<string>('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pct      = Math.round((scan.overallConfidence ?? 0) * 100);
  const lowConf  = pct < 60;
  const warnConf = pct >= 60 && pct < 80;
  const confColor = pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#DC2626';
  const confBg    = pct >= 80 ? '#DCFCE7' : pct >= 60 ? '#FEF9C3' : '#FEE2E2';

  const totalUncertain = useMemo(() => (scan.uncertainCodes ?? []).length, [scan.uncertainCodes]);

  // ─── Toggle código ───────────────────────────────────────────────────────────

  const toggleCode = (code: string) =>
    setMarkedCodes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code],
    );

  const toggleSection = (prefix: string) =>
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(prefix) ? next.delete(prefix) : next.add(prefix);
      return next;
    });

  // ─── Salvar — apenas após confirmação manual ─────────────────────────────────

  const handleSave = async () => {
    if (!user.tenant_id || !student.id) return;
    setIsSaving(true);
    setError(null);

    try {
      // Upload do arquivo original
      let fileUrl: string | null = null;
      let uploadedPath: string | null = null;
      if (!DEMO_MODE) {
        const ext  = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
        const path = `${user.tenant_id}/checklists/scan_${crypto.randomUUID()}.${ext}`;
        uploadedPath = await StorageService.uploadFile(file, 'documentos_pdf', path);
        if (uploadedPath) {
          fileUrl = await StorageService.getSignedUrl('documentos_pdf', uploadedPath, 60 * 60 * 24 * 30);
        }
      }

      const auditCode = generateDocumentCode('registration');

      // Converte códigos revisados → estrutura de checklist compatível
      const converted = isRegente
        ? codesToRegenteData(markedCodes, extraFields, freeNotes)
        : codesToCuidadoraData(markedCodes, extraFields, freeNotes);

      const fieldsData: Record<string, unknown> = {
        ...converted,
        origin:           'scan_sheet',
        schemaVersion:    'enem_v1',
        confidence:       scan.overallConfidence,
        markedCodes,
        uncertainCodes:   scan.uncertainCodes ?? [],
        originalFileUrl:  fileUrl,
        originalFilePath: uploadedPath,
        originalFileName: file.name,
        auditCode,
        savedAt:          new Date().toISOString(),
      };

      const title = isRegente
        ? 'Checklist de Observação em Sala (scan ENEM-like)'
        : 'Análise de Rotina Semanal — Cuidadora (scan ENEM-like)';

      const formId = await ObservationFormService.save({
        tenantId:   user.tenant_id,
        studentId:  student.id,
        userId:     user.id,
        formType:   scan.checklistType,
        title,
        fieldsData: fieldsData as Record<string, any>,
        auditCode,
        createdBy:  user.name,
        status:     'finalizado',
      });

      if (formId && !DEMO_MODE) {
        await StudentDocumentService.save({
          tenantId:     user.tenant_id,
          studentId:    student.id,
          name:         `${title} — ${file.name}`,
          documentType: 'Outro',
          fileUrl:      fileUrl ?? undefined,
          filePath:     uploadedPath ?? undefined,
          fileSize:     file.size,
          mimeType:     file.type,
          uploadedBy:   user.name,
          notes: `Scan ENEM-like · Confiança: ${pct}% · ${markedCodes.length} itens · Código: ${auditCode}`,
        });

        await TimelineService.add({
          tenantId:    user.tenant_id,
          studentId:   student.id,
          eventType:   'ficha',
          title:       `${title} registrado`,
          description: `Scan ENEM-like — ${markedCodes.length} itens — Confiança: ${pct}% — por ${user.name}`,
          linkedId:    formId,
          linkedTable: 'observation_forms',
          icon:        'ClipboardCheck',
          author:      user.name,
        });
      }

      onSaved();
    } catch (e: any) {
      setError(`Erro ao salvar: ${e?.message ?? 'Tente novamente.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.65)' }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-5 border-b border-[#E7E2D8]">
          <div>
            <h2 className="font-bold text-base text-gray-900">
              Revisão do Scan — {isRegente ? 'Professor Regente' : 'Cuidadora'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {student.name} · Revise os itens detectados e confirme antes de salvar
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Corpo em 2 colunas */}
        <div className="flex flex-col lg:flex-row">
          {/* Coluna esquerda: imagem */}
          <div className="lg:w-[40%] p-5 border-b lg:border-b-0 lg:border-r border-[#E7E2D8] flex flex-col gap-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Imagem original</p>
            <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex-1">
              {imgUrl && (
                <img
                  src={imgUrl}
                  alt="Checklist digitalizado"
                  className="w-full object-contain max-h-[70vh]"
                />
              )}
            </div>
            <p className="text-xs text-gray-400 truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>

          {/* Coluna direita: revisão */}
          <div className="lg:w-[60%] p-5 overflow-y-auto max-h-[85vh] flex flex-col gap-4">
            {/* Badge de confiança */}
            <div
              className="flex items-center gap-3 p-3.5 rounded-xl border"
              style={{ background: confBg, borderColor: confColor + '55' }}
            >
              <ShieldCheck size={20} style={{ color: confColor, flexShrink: 0 }} />
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: confColor }}>
                  Confiança da leitura: {pct}%
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {markedCodes.length} itens detectados
                  {totalUncertain > 0 ? ` · ${totalUncertain} incerto(s)` : ''}
                </p>
              </div>
            </div>

            {/* Aviso de baixa confiança — destaque especial */}
            {lowConf && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border-2 border-red-300">
                <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-800 font-medium leading-relaxed">
                  <strong>A leitura automática teve baixa confiança.</strong>{' '}
                  Revise cuidadosamente todos os itens antes de salvar.
                </p>
              </div>
            )}
            {warnConf && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  <strong>Confiança moderada.</strong> Verifique os itens marcados com ⚠ antes de salvar.
                </p>
              </div>
            )}
            {!lowConf && !warnConf && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Dados detectados pela IA. Revise e corrija antes de salvar. Nenhum item é salvo sem confirmação.
                </p>
              </div>
            )}

            {/* Cabeçalho editável */}
            <div className="rounded-xl border border-[#E7E2D8] bg-white p-4 space-y-3">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Cabeçalho</h4>
              {isRegente ? (
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['professor',      'Professor(a)',        'text',  'col-span-2'],
                    ['serie',          'Série / Ano',         'text',  ''],
                    ['dataObservacao', 'Data da observação',  'date',  ''],
                  ] as [string, string, string, string][]).map(([key, label, type, cls]) => (
                    <div key={key} className={cls}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input
                        type={type}
                        className="w-full border border-gray-200 rounded-lg p-1.5 text-xs outline-none focus:ring-1 focus:ring-[#1F4E5F]/30"
                        value={extraFields[key] ?? ''}
                        onChange={e => setExtraFields(p => ({ ...p, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['cuidadora',         'Cuidadora / Apoio',     'text', 'col-span-2'],
                    ['turno',             'Turno',                 'text', ''],
                    ['semanaReferencia',   'Semana de referência',  'text', ''],
                    ['dataPreenchimento',  'Data de preenchimento', 'date', ''],
                  ] as [string, string, string, string][]).map(([key, label, type, cls]) => (
                    <div key={key} className={cls}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input
                        type={type}
                        className="w-full border border-gray-200 rounded-lg p-1.5 text-xs outline-none focus:ring-1 focus:ring-[#1F4E5F]/30"
                        value={extraFields[key] ?? ''}
                        onChange={e => setExtraFields(p => ({ ...p, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Seções com códigos */}
            <div className="space-y-1.5">
              {sections.map(sec => {
                const isOpen      = openSections.has(sec.prefix);
                const marked      = sec.codes.filter(c => markedCodes.includes(c));
                const hasUncert   = sec.codes.some(c => scan.uncertainCodes?.includes(c));
                const isAlert     = sec.prefix === 'AW';
                return (
                  <div
                    key={sec.prefix}
                    className="rounded-xl border overflow-hidden"
                    style={{ borderColor: isAlert && marked.length > 0 ? '#FCA5A5' : '#E5E7EB' }}
                  >
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 transition"
                      onClick={() => toggleSection(sec.prefix)}
                    >
                      <div className="flex items-center gap-2">
                        <span>{sec.emoji}</span>
                        <span className={`text-xs font-bold ${isAlert ? 'text-red-700' : 'text-gray-700'}`}>
                          {sec.label}
                        </span>
                        {marked.length > 0 && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white"
                            style={{ background: isAlert ? '#DC2626' : '#1F4E5F' }}
                          >
                            {marked.length}
                          </span>
                        )}
                        {hasUncert && (
                          <span title="Itens incertos nesta seção">
                            <AlertTriangle size={11} className="text-amber-500" />
                          </span>
                        )}
                      </div>
                      {isOpen
                        ? <ChevronUp size={14} className="text-gray-400" />
                        : <ChevronDown size={14} className="text-gray-400" />}
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                        <div className="grid grid-cols-1 gap-1 mt-1.5">
                          {sec.codes.map(code => {
                            const isMarked    = markedCodes.includes(code);
                            const isUncertain = scan.uncertainCodes?.includes(code);
                            return (
                              <label
                                key={code}
                                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg cursor-pointer transition border ${
                                  isMarked
                                    ? isAlert
                                      ? 'bg-red-50 border-red-300 text-red-800'
                                      : 'bg-[#EFF6FF] border-[#1F4E5F]/30 text-[#1F4E5F]'
                                    : 'bg-gray-50 border-gray-100 text-gray-700 hover:bg-gray-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="shrink-0"
                                  style={{ accentColor: isAlert ? '#DC2626' : '#1F4E5F' }}
                                  checked={isMarked}
                                  onChange={() => toggleCode(code)}
                                />
                                <span
                                  className="font-mono font-bold text-[10px] shrink-0 w-8"
                                  style={{ color: isMarked ? (isAlert ? '#DC2626' : '#1F4E5F') : '#aaa' }}
                                >
                                  {code}
                                </span>
                                <span className="text-xs flex-1 leading-snug">{codeMap[code] ?? code}</span>
                                {isUncertain && (
                                  <span title="Baixa confiança de leitura — verifique na imagem">
                                    <AlertTriangle size={11} className="text-amber-400 shrink-0" />
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Observações livres */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                Observações livres (transcrição)
              </label>
              <textarea
                className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#1F4E5F]/30 outline-none bg-white resize-none"
                rows={3}
                value={freeNotes}
                onChange={e => setFreeNotes(e.target.value)}
                placeholder="Transcrição da área de observações manuscritas..."
              />
            </div>

            {/* Lista de incertos */}
            {totalUncertain > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                  <AlertTriangle size={12} />
                  Códigos com baixa confiança — verifique na imagem:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {scan.uncertainCodes!.map(c => (
                    <span key={c} className="font-mono text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {/* Ações — sticky bottom */}
            <div className="flex gap-2 pt-1 sticky bottom-0 bg-white/95 backdrop-blur-sm pb-1">
              <button
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !student.id}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-50"
                style={{ background: '#1F4E5F' }}
              >
                {isSaving
                  ? <><RefreshCw size={14} className="animate-spin" /> Salvando...</>
                  : <><Save size={14} /> Confirmar e salvar no dossiê</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
