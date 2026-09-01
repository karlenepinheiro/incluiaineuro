import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { ensurePdfjsMapUpsertCompat } from '../../utils/pdfjsCompat';
import { buildIntelligentProfilePdf } from '../../services/IntelligentProfilePDFDocument';
import type { IntelligentProfileRecord } from '../../services/intelligentProfileService';
import type { SchoolConfig, Student } from '../../types';

// Mesma correção de compatibilidade usada por FormalPdfPreview — necessária
// para o pdf.js funcionar em Safari/WebKit (iPad). Ver src/utils/pdfjsCompat.ts.
ensurePdfjsMapUpsertCompat();

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type RenderedPage = {
  dataUrl: string;
  height: number;
  pageNumber: number;
  width: number;
};

interface IntelligentProfilePdfPreviewProps {
  record: IntelligentProfileRecord;
  student: Student;
  school?: SchoolConfig | null;
  generatedByName?: string | null;
}

const PAGE_MAX_WIDTH = 780;
const PAGE_SIDE_PADDING = 48;

/**
 * Prévia A4 do Perfil Inteligente — renderiza o PDF REAL (via pdf.js), o mesmo
 * arquivo que o botão "Baixar PDF" gera. Garante fidelidade total
 * preview ↔ PDF ↔ Word. Espelha `FormalPdfPreview` (documentos formais).
 */
export const IntelligentProfilePdfPreview: React.FC<IntelligentProfilePdfPreviewProps> = ({
  record,
  student,
  school,
  generatedByName,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const objectUrlRef = useRef<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const handleRetry = useCallback(() => setRetryToken(t => t + 1), []);

  const profileKey = useMemo(
    () => `${record.id}:${record.version_number}:${record.updated_at ?? record.created_at}`,
    [record.id, record.version_number, record.updated_at, record.created_at],
  );

  useEffect(() => {
    let active = true;

    const cleanupObjectUrl = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    setPages([]);
    setPdfUrl(null);
    setError(null);
    setIsRendering(true);
    cleanupObjectUrl();

    const renderPreview = async () => {
      try {
        const { blob } = await buildIntelligentProfilePdf({
          profile: record.profile_json,
          student,
          versionNumber: record.version_number,
          generatedAt: record.created_at,
          generatedByName: generatedByName ?? record.generated_by_name ?? 'Profissional',
          school: school ?? null,
        });
        if (!active) return;

        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setPdfUrl(objectUrl);

        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const renderedPages: RenderedPage[] = [];
        const targetWidth = Math.min(
          PAGE_MAX_WIDTH,
          Math.max(320, window.innerWidth - PAGE_SIDE_PADDING),
        );

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (!active) return;
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = targetWidth / baseViewport.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Nao foi possivel preparar o canvas do preview.');

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: context, viewport }).promise;

          renderedPages.push({
            dataUrl: canvas.toDataURL('image/png'),
            height: viewport.height,
            pageNumber,
            width: viewport.width,
          });
        }

        if (!active) return;
        setPages(renderedPages);
      } catch (e: any) {
        if (!active) return;
        console.error('[IntelligentProfilePdfPreview] Falha ao renderizar a prévia A4:', e);
        setError(e?.message || 'Nao foi possivel renderizar o preview A4 do PDF.');
      } finally {
        if (active) setIsRendering(false);
      }
    };

    void renderPreview();

    return () => {
      active = false;
      cleanupObjectUrl();
    };
  }, [profileKey, school, student, generatedByName, retryToken]);

  const openPdfButton = pdfUrl ? (
    <a
      href={pdfUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
    >
      <ExternalLink size={14} />
      Abrir PDF
    </a>
  ) : null;

  if (error) {
    return (
      <div className="mt-6 w-full max-w-[940px] rounded-2xl border border-amber-200 bg-white p-5 text-slate-700 shadow-xl print:hidden">
        <p className="text-sm font-semibold text-slate-800">
          Tivemos dificuldade para exibir a prévia neste navegador.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Seu documento está preservado e você pode abri-lo ou baixá-lo normalmente.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {openPdfButton}
          {pdfUrl && (
            <a
              href={pdfUrl}
              download={`PerfilInteligente_${(student.name || 'aluno').replace(/[\\/:*?"<>|]+/g, '_')}_V${record.version_number}.pdf`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Download size={14} />
              Baixar PDF
            </a>
          )}
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (isRendering || pages.length === 0) {
    return (
      <div className="mt-6 flex min-h-[640px] w-full max-w-[940px] items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-xl print:hidden">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={18} className="animate-spin" />
          Gerando preview do PDF...
        </div>
      </div>
    );
  }

  return (
    <div
      className="mt-6 w-full max-w-[940px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xl print:shadow-none print:border-0 print:m-0"
      id="document-content"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 print:hidden">
        <div>
          <p className="text-sm font-semibold text-slate-800">Preview A4 do PDF</p>
          <p className="text-xs text-slate-500">
            {pages.length} {pages.length === 1 ? 'página renderizada' : 'páginas renderizadas'} a partir do mesmo PDF final.
          </p>
        </div>
        {openPdfButton}
      </div>

      <div className="flex flex-col items-center gap-8 overflow-x-hidden bg-slate-100 px-3 py-8 sm:px-6">
        {pages.map(page => (
          <figure key={page.pageNumber} className="m-0 flex w-full flex-col items-center">
            <div
              className="overflow-hidden rounded-[3px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]"
              style={{
                aspectRatio: `${page.width} / ${page.height}`,
                maxWidth: '780px',
                width: 'min(100%, 780px)',
              }}
            >
              <img
                src={page.dataUrl}
                alt={`Página ${page.pageNumber} do Perfil Inteligente`}
                className="block h-full w-full"
                draggable={false}
              />
            </div>
            <figcaption className="mt-3 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
              Página {page.pageNumber} de {pages.length}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
};

export default IntelligentProfilePdfPreview;
