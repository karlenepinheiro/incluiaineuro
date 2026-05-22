import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFGenerator } from '../../services/PDFGenerator';
import type { DocumentType, SchoolConfig, Student, User } from '../../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type PreviewSection = {
  title: string;
  fields: Array<{ label: string; value: any; type?: string; maxScale?: number }>;
};

type RenderedPage = {
  dataUrl: string;
  height: number;
  pageNumber: number;
  width: number;
};

interface FormalPdfPreviewProps {
  docType: DocumentType;
  title: string;
  student: Student;
  user: User;
  school?: SchoolConfig | null;
  sections: PreviewSection[];
  auditCode: string;
}

const PAGE_MAX_WIDTH = 780;
const PAGE_SIDE_PADDING = 48;

export const FormalPdfPreview: React.FC<FormalPdfPreviewProps> = ({
  docType,
  title,
  student,
  user,
  school,
  sections,
  auditCode,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const objectUrlRef = useRef<string | null>(null);
  const sectionsKey = useMemo(() => JSON.stringify(sections), [sections]);

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
        const blob = await PDFGenerator.generateFromSections({
          docType,
          title,
          student,
          user,
          school,
          sections,
          auditCode,
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
  }, [auditCode, docType, school, sectionsKey, student, title, user]);

  const openPdfButton = pdfUrl ? (
    <a
      href={pdfUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
    >
      <ExternalLink size={14} />
      Abrir PDF em nova aba
    </a>
  ) : null;

  if (error) {
    return (
      <div className="mt-8 w-[96vw] max-w-[940px] rounded-2xl border border-red-200 bg-white p-5 text-red-700 shadow-xl print:hidden">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Nao foi possivel montar o preview A4.</p>
            <p className="mt-1 text-xs text-red-600">{error}</p>
          </div>
          {openPdfButton}
        </div>
        <p className="text-xs text-slate-600">
          O PDF foi preservado. Use o botao para abrir a versao final em nova aba.
        </p>
      </div>
    );
  }

  if (isRendering || pages.length === 0) {
    return (
      <div className="mt-8 flex min-h-[640px] w-[96vw] max-w-[940px] items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-xl print:hidden">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={18} className="animate-spin" />
          Gerando preview do PDF...
        </div>
      </div>
    );
  }

  return (
    <div
      className="mt-8 w-[96vw] max-w-[940px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xl print:shadow-none print:border-0 print:m-0"
      id="document-content"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 print:hidden">
        <div>
          <p className="text-sm font-semibold text-slate-800">Preview A4 do PDF</p>
          <p className="text-xs text-slate-500">
            {pages.length} {pages.length === 1 ? 'pagina renderizada' : 'paginas renderizadas'} a partir do mesmo PDF final.
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
                alt={`Pagina ${page.pageNumber} do documento`}
                className="block h-full w-full"
                draggable={false}
              />
            </div>
            <figcaption className="mt-3 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
              Pagina {page.pageNumber} de {pages.length}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
};

export default FormalPdfPreview;
