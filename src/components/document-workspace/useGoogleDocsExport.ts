// components/document-workspace/useGoogleDocsExport.ts
// ─────────────────────────────────────────────────────────────────────────────
// [FASE 2] Hook reutilizável que encapsula TODA a máquina de estados do
// "Abrir no Google Docs" — a mesma lógica já validada no piloto do PAEE
// (DocumentBuilder.tsx), agora extraída para não ser copiada em cada tela:
//
//   - 1º clique cria a cópia; cliques seguintes reabrem a MESMA cópia;
//   - guarda síncrona de duplo clique (ref, antes de qualquer await);
//   - editar o conteúdo (assinatura muda) ⇒ confirmação antes de nova cópia;
//   - trocar de aluno/documento (isolationKey muda) ⇒ reseta todo o estado;
//   - link alternativo discreto quando a aba não pôde ser confirmada;
//   - falha de OAuth/upload nunca mostra sucesso; timeout nunca reenvia.
//
// NUNCA chama IA, NUNCA consome créditos, NUNCA persiste token (o serviço
// googleDriveExportService cuida disso). O Blob é sempre o mesmo do
// "Baixar Word (.docx)" — injetado via `generateDocxBlob`.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GoogleDriveExportError,
  exportCurrentDocumentToGoogleDocs,
  openGoogleDocLink,
} from '../../services/googleDriveExportService';
import type { GoogleDocsExportStatus } from './DocumentWorkspace';

export interface UseGoogleDocsExportParams {
  /** Gera o Blob DOCX canônico a exportar — o MESMO gerador de "Baixar Word". */
  generateDocxBlob: () => Promise<Blob>;
  /** Nome de exibição já resolvido no Drive (ver buildGoogleDocsDisplayName). */
  displayName: string;
  /**
   * Assinatura leve do conteúdo atual (ex.: JSON das seções). Quando muda depois
   * de uma exportação concluída, a ação volta a ser uma exportação NOVA e pede
   * confirmação — nunca reabre silenciosamente uma cópia desatualizada.
   */
  contentSignature: string;
  /**
   * Chave de isolamento por tenant + aluno + tipo de documento. Quando muda,
   * todo o estado é resetado (o link do PEI nunca abre no lugar do PAEE; o
   * documento de um aluno nunca abre o link de outro).
   */
  isolationKey: string;
  /** Quando false, `onOpenGoogleDocs` é undefined (botão não deve aparecer). */
  enabled?: boolean;
}

export interface UseGoogleDocsExportResult {
  status: GoogleDocsExportStatus;
  message: string | null;
  fallbackUrl: string | null;
  /** undefined quando `enabled === false`. */
  onOpenGoogleDocs?: () => void;
  reset: () => void;
}

export function useGoogleDocsExport(params: UseGoogleDocsExportParams): UseGoogleDocsExportResult {
  const { generateDocxBlob, displayName, contentSignature, isolationKey, enabled = true } = params;

  const [status, setStatus] = useState<GoogleDocsExportStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; exportedSignature: string } | null>(null);
  const inFlightRef = useRef(false);

  const reset = useCallback(() => {
    setStatus('idle');
    setMessage(null);
    setFallbackUrl(null);
    setResult(null);
    inFlightRef.current = false;
  }, []);

  // Troca de aluno/documento: limpa o estado. Só RESETA — nunca inicia upload.
  useEffect(() => {
    reset();
  }, [isolationKey, reset]);

  const contentChangedSinceExport =
    status === 'done' && result !== null && result.exportedSignature !== contentSignature;
  const effectiveStatus: GoogleDocsExportStatus = contentChangedSinceExport ? 'idle' : status;

  const onOpenGoogleDocs = useCallback(async () => {
    // 1. Já existe cópia para o conteúdo ATUAL → só reabre (nunca novo upload).
    if (!contentChangedSinceExport && status === 'done' && result) {
      const opened = openGoogleDocLink(result.url);
      setFallbackUrl(opened ? null : result.url);
      return;
    }

    // 2. Existe cópia de uma versão ANTERIOR → confirmação explícita.
    if (contentChangedSinceExport) {
      const ok = typeof window !== 'undefined'
        && window.confirm('O documento foi alterado. Deseja criar uma nova cópia no Google Docs?');
      if (!ok) return;
    }

    if (inFlightRef.current) return; // duplo clique
    inFlightRef.current = true;
    setFallbackUrl(null);
    setMessage(null);

    const signatureAtStart = contentSignature;
    try {
      const { url } = await exportCurrentDocumentToGoogleDocs(
        { displayName, generateDocxBlob },
        (step) => setStatus(step),
      );
      setResult({ url, exportedSignature: signatureAtStart });
      setStatus('done');
      const opened = openGoogleDocLink(url);
      setFallbackUrl(opened ? null : url);
    } catch (e: any) {
      const msg = e instanceof GoogleDriveExportError
        ? e.message
        : (e?.message || 'Não foi possível abrir no Google Docs. Tente novamente.');
      setMessage(msg);
      setStatus('error');
    } finally {
      inFlightRef.current = false;
    }
  }, [contentChangedSinceExport, status, result, contentSignature, displayName, generateDocxBlob]);

  return {
    status: effectiveStatus,
    message,
    fallbackUrl,
    onOpenGoogleDocs: enabled ? () => { void onOpenGoogleDocs(); } : undefined,
    reset,
  };
}
