// components/document-workspace/DocumentExportActions.tsx
// ─────────────────────────────────────────────────────────────────────────────
// [FASE 2] Linha de ações de exportação REUTILIZÁVEL e leve — para documentos
// formais que NÃO usam o DocumentWorkspace inteiro (Relatório Técnico, Fichas,
// QuickDoc, Relatório de Evolução, …). Não muda a arquitetura visual da tela:
// é só um `<div>` com os botões padrão.
//
//   Baixar PDF · Baixar Word (.docx) · Abrir no Google Docs · Imprimir
//
// Recebe handlers reais (não reimplementa nada). O botão Word / Google Docs só
// aparece quando o handler correspondente é passado — nunca um botão sem função.
// A máquina de estados do Google Docs vem do hook useGoogleDocsExport.

import React from 'react';
import { Download, FileOutput, Printer } from 'lucide-react';
import { DocButton } from '../ui/DocButton';
import { GoogleGIcon } from '../ui/GoogleGIcon';
import type { GoogleDocsExportStatus } from './DocumentWorkspace';

const GOOGLE_DOCS_STATUS_LABEL: Record<GoogleDocsExportStatus, string> = {
  idle: 'Abrir no Google Docs',
  connecting: 'Conectando ao Google…',
  preparing: 'Preparando documento…',
  uploading: 'Enviando documento…',
  done: 'Documento criado — Abrir',
  error: 'Abrir no Google Docs',
};

const GOOGLE_DOCS_PRIVACY_NOTICE =
  'Uma cópia deste documento será enviada para a conta Google que você autorizar. As alterações feitas no Google Docs não serão sincronizadas com o IncluiAI.';

export interface DocumentExportActionsProps {
  size?: 'sm' | 'md';
  className?: string;

  onDownloadPdf: () => void;
  isDownloadingPdf?: boolean;

  /** Omitir oculta o botão Word (documento ainda sem renderer canônico). */
  onDownloadWord?: () => void;
  isDownloadingWord?: boolean;

  /** Omitir oculta o botão Google Docs (feature desligada ou documento fora do escopo). */
  onOpenGoogleDocs?: () => void;
  googleDocsStatus?: GoogleDocsExportStatus;
  googleDocsMessage?: string | null;
  googleDocsFallbackUrl?: string | null;

  /** Omitir oculta "Imprimir". */
  onPrint?: () => void;
}

export const DocumentExportActions: React.FC<DocumentExportActionsProps> = ({
  size = 'sm',
  className = '',
  onDownloadPdf,
  isDownloadingPdf = false,
  onDownloadWord,
  isDownloadingWord = false,
  onOpenGoogleDocs,
  googleDocsStatus = 'idle',
  googleDocsMessage = null,
  googleDocsFallbackUrl = null,
  onPrint,
}) => {
  const gdocsBusy =
    googleDocsStatus === 'connecting' ||
    googleDocsStatus === 'preparing' ||
    googleDocsStatus === 'uploading';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} data-testid="document-export-actions">
      <div className="flex flex-wrap items-center gap-2">
        <DocButton
          variant="outline"
          size={size}
          icon={<Download size={15} />}
          loading={isDownloadingPdf}
          onClick={onDownloadPdf}
          title="Baixar PDF"
        >
          {isDownloadingPdf ? 'Gerando…' : 'Baixar PDF'}
        </DocButton>

        {onDownloadWord && (
          <DocButton
            variant="outline"
            size={size}
            icon={<FileOutput size={15} />}
            loading={isDownloadingWord}
            onClick={onDownloadWord}
            title="Baixar Word (.docx)"
          >
            {isDownloadingWord ? 'Exportando…' : 'Baixar Word (.docx)'}
          </DocButton>
        )}

        {onOpenGoogleDocs && (
          <DocButton
            variant="outline"
            size={size}
            icon={<GoogleGIcon size={15} />}
            loading={gdocsBusy}
            onClick={onOpenGoogleDocs}
            title={GOOGLE_DOCS_STATUS_LABEL[googleDocsStatus]}
            data-testid="open-google-docs-button"
          >
            {GOOGLE_DOCS_STATUS_LABEL[googleDocsStatus]}
          </DocButton>
        )}

        {onPrint && (
          <DocButton
            variant="outline"
            size={size}
            icon={<Printer size={15} />}
            onClick={onPrint}
            title="Imprimir"
          >
            Imprimir
          </DocButton>
        )}
      </div>

      {onOpenGoogleDocs && (
        <>
          <p
            className={`text-[10.5px] leading-snug px-0.5 ${googleDocsStatus === 'error' ? 'text-amber-700' : 'text-gray-400'}`}
            role="status"
            aria-live="polite"
            data-testid="google-docs-message"
          >
            {googleDocsMessage ?? (googleDocsStatus === 'idle' ? GOOGLE_DOCS_PRIVACY_NOTICE : '')}
          </p>
          {googleDocsFallbackUrl && (
            <a
              href={googleDocsFallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1F4E5F] hover:underline px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4E5F] focus-visible:ring-offset-1 rounded"
              data-testid="google-docs-fallback-link"
            >
              Não abriu? Abrir no Google Docs ↗
            </a>
          )}
        </>
      )}
    </div>
  );
};

export default DocumentExportActions;
