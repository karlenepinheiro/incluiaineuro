// components/document-workspace/DocumentWorkspace.tsx
// ─────────────────────────────────────────────────────────────────────────────
// FASE 1 — Estrutura visual do novo workspace de documentos formais.
//
// Este componente é APENAS uma casca de layout (painel lateral + viewport
// central). Ele não gera PDF, não pagina, não sabe nada sobre o conteúdo do
// documento — ele recebe a visualização A4 já pronta (tipicamente o componente
// `FormalPdfPreview`, que continua sendo o único responsável pelas páginas A4
// reais) via `children` e apenas a posiciona dentro de um canvas com fundo
// cinza muito claro, ao lado de um painel com identificação do documento e os
// botões de exportação já existentes.
//
// Os botões de PDF/Word/Impressão aqui dentro NÃO reimplementam nenhuma lógica:
// recebem os handlers reais (`onDownloadPdf`, `onDownloadWord`, `onPrint`) via
// props e apenas os chamam. Isso evita handlers duplicados, conforme a Fase 1
// exige.
//
// Originado no piloto do PAEE, este componente é a peça reutilizável de
// exportação de documentos formais: DocumentBuilder.tsx o usa para Estudo de
// Caso, PEI, PAEE, PDI e Plano Unificado (todos com renderer Word canônico).
// A API é genérica de propósito — o componente recebe handlers reais e um
// rótulo (`docLabel`) e não conhece nenhuma regra específica de tipo de
// documento. Documentos sem Word canônico (Fase 2) simplesmente não passam a
// prop `onDownloadWord`/`onOpenGoogleDocs`.

import React, { useEffect, useState } from 'react';
import { Download, FileOutput, PanelLeftClose, PanelLeftOpen, Printer } from 'lucide-react';
import { DocButton, DocIconButton } from '../ui/DocButton';
import { GoogleGIcon } from '../ui/GoogleGIcon';

/**
 * Estados da integração "Abrir no Google Docs" (piloto PAEE, 27/08/2026— ver
 * `googleDriveExportService.ts`). O componente é só apresentacional: recebe o
 * estado já resolvido pelo chamador (`DocumentBuilder.tsx`) e mostra o rótulo
 * correspondente — a mesma convenção já usada por `isDownloadingWord`.
 */
export type GoogleDocsExportStatus = 'idle' | 'connecting' | 'preparing' | 'uploading' | 'done' | 'error';

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

export interface DocumentWorkspaceProps {
  /** Rótulo curto do tipo de documento, ex.: "PAEE". */
  docLabel: string;
  /** Nome do aluno, quando disponível. */
  studentName?: string | null;
  /** Rótulo de status já resolvido pelo chamador (ex.: "Rascunho" / "Concluído"). `null`/`undefined` oculta o badge. */
  statusLabel?: string | null;

  /** Handler real de geração de PDF (ex.: handleGeneratePDF do DocumentBuilder). Não é reimplementado aqui. */
  onDownloadPdf: () => void;
  isDownloadingPdf?: boolean;

  /** Handler real de exportação Word. Omitir a prop oculta o botão (documento sem suporte a Word). */
  onDownloadWord?: () => void;
  isDownloadingWord?: boolean;

  /**
   * Handler real da integração "Abrir no Google Docs" (piloto PAEE). Omitir a
   * prop oculta o botão por completo (feature desligada por falta de
   * configuração, ou documento fora do piloto) — mesma convenção de
   * `onDownloadWord`. O chamador decide, a cada clique, se a ação é uma nova
   * exportação ou apenas reabrir o link já criado (`googleDocsStatus`
   * já reflete isso: 'done' sem alteração de conteúdo = reabrir).
   */
  onOpenGoogleDocs?: () => void;
  googleDocsStatus?: GoogleDocsExportStatus;
  /**
   * Mensagem exibida sob o botão. Quando ausente e `googleDocsStatus` é
   * 'idle', mostra o aviso de privacidade padrão antes do primeiro envio.
   * Quando presente, substitui o aviso padrão (usado para erros específicos:
   * popup bloqueado, consentimento recusado, timeout, etc.).
   */
  googleDocsMessage?: string | null;
  /**
   * Presente quando a tentativa automática de abrir a aba não pôde ser
   * confirmada como bem-sucedida (o retorno de `window.open()` não é um
   * sinal 100% confiável — ver `openGoogleDocLink` em
   * `googleDriveExportService.ts`). Renderiza um link alternativo discreto —
   * nunca uma alegação categórica de "bloqueado", já que criar o documento
   * com sucesso e não conseguir confirmar a abertura da aba são coisas
   * diferentes.
   */
  googleDocsFallbackUrl?: string | null;

  /** Handler real de impressão. */
  onPrint: () => void;

  /** Visualização A4 real (ex.: <FormalPdfPreview />), renderizada sem alterações dentro do viewport. */
  children: React.ReactNode;
}

/** Breakpoint (px) a partir do qual o painel começa aberto por padrão. Abaixo disso, começa recolhido. */
const DEFAULT_OPEN_BREAKPOINT = '(min-width: 768px)';

export const DocumentWorkspace: React.FC<DocumentWorkspaceProps> = ({
  docLabel,
  studentName,
  statusLabel,
  onDownloadPdf,
  isDownloadingPdf = false,
  onDownloadWord,
  isDownloadingWord = false,
  onOpenGoogleDocs,
  googleDocsStatus = 'idle',
  googleDocsMessage = null,
  googleDocsFallbackUrl = null,
  onPrint,
  children,
}) => {
  // Painel aberto por padrão em telas >= tablet; recolhido por padrão em celular.
  // Sempre alternável pelo usuário depois, em qualquer largura.
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setPanelOpen(window.matchMedia(DEFAULT_OPEN_BREAKPOINT).matches);
  }, []);

  return (
    <div
      className="w-full mt-8 flex flex-col lg:flex-row items-start gap-4 print:block print:m-0"
      data-testid="document-workspace"
      data-doc-label={docLabel}
    >
      {/* ── Painel lateral do documento ─────────────────────────────────────── */}
      <aside className="w-full lg:w-72 shrink-0 print:hidden" data-testid="document-workspace-panel">
        {panelOpen ? (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 lg:sticky lg:top-24">
            <div className="flex items-center justify-between mb-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Documento</p>
                <p className="text-base font-bold text-gray-900 truncate">{docLabel}</p>
              </div>
              <DocIconButton
                variant="ghost"
                icon={<PanelLeftClose size={16} />}
                label="Recolher painel do documento"
                onClick={() => setPanelOpen(false)}
              />
            </div>

            {studentName && (
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Aluno</p>
                <p className="text-sm font-semibold text-gray-800 truncate">{studentName}</p>
              </div>
            )}

            {statusLabel && (
              <div className="mb-4">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-600">
                  {statusLabel}
                </span>
              </div>
            )}

            <div className="h-px bg-gray-100 my-4" />

            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Exportar</p>
            <div className="flex flex-col gap-2">
              <DocButton
                variant="outline"
                icon={<Download size={15} />}
                loading={isDownloadingPdf}
                onClick={onDownloadPdf}
                className="justify-center w-full"
                title="Baixar PDF"
              >
                {isDownloadingPdf ? 'Gerando…' : 'Baixar PDF'}
              </DocButton>

              {onDownloadWord && (
                <DocButton
                  variant="outline"
                  icon={<FileOutput size={15} />}
                  loading={isDownloadingWord}
                  onClick={onDownloadWord}
                  className="justify-center w-full"
                  title="Baixar Word (.docx)"
                >
                  {isDownloadingWord ? 'Exportando…' : 'Baixar Word (.docx)'}
                </DocButton>
              )}

              {onOpenGoogleDocs && (
                <div>
                  <DocButton
                    variant="outline"
                    icon={<GoogleGIcon size={15} />}
                    loading={googleDocsStatus === 'connecting' || googleDocsStatus === 'preparing' || googleDocsStatus === 'uploading'}
                    onClick={onOpenGoogleDocs}
                    className="justify-center w-full"
                    title={GOOGLE_DOCS_STATUS_LABEL[googleDocsStatus]}
                    data-testid="open-google-docs-button"
                  >
                    {GOOGLE_DOCS_STATUS_LABEL[googleDocsStatus]}
                  </DocButton>
                  <p
                    className={`text-[10.5px] leading-snug mt-1.5 px-0.5 ${googleDocsStatus === 'error' ? 'text-amber-700' : 'text-gray-400'}`}
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
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1F4E5F] hover:underline mt-1 px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4E5F] focus-visible:ring-offset-1 rounded"
                      data-testid="google-docs-fallback-link"
                    >
                      Não abriu? Abrir no Google Docs ↗
                    </a>
                  )}
                </div>
              )}

              <DocButton
                variant="outline"
                icon={<Printer size={15} />}
                onClick={onPrint}
                className="justify-center w-full"
                title="Imprimir"
              >
                Imprimir
              </DocButton>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-full shadow-sm px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            title="Mostrar painel do documento"
            data-testid="document-workspace-panel-toggle"
          >
            <PanelLeftOpen size={14} />
            {docLabel}
          </button>
        )}
      </aside>

      {/* ── Viewport central (canvas cinza muito claro + páginas A4 reais) ──── */}
      <div
        className="flex-1 w-full min-w-0 rounded-2xl bg-gray-50 overflow-x-auto print:bg-transparent print:rounded-none print:overflow-visible"
        data-testid="document-workspace-viewport"
      >
        <div className="flex flex-col items-center py-2 px-1">
          {children}
        </div>
      </div>
    </div>
  );
};

export default DocumentWorkspace;
