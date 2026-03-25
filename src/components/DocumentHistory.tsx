// components/DocumentHistory.tsx
// Histórico de versões de documentos gerados
import React from 'react';
import { Download, Clock, FileText, Archive } from 'lucide-react';

export interface DocVersion {
  id: string;
  versionNumber: number;
  docType: string;
  title: string;
  auditCode: string;
  createdAt: string;
  createdBy: string;
  fileBlob?: Blob;
}

interface Props {
  versions: DocVersion[];
  onDownload: (version: DocVersion) => void;
  compact?: boolean;
}

export const DocumentHistory: React.FC<Props> = ({ versions, onDownload, compact = false }) => {
  if (!versions.length) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Clock size={28} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">Nenhuma versão gerada ainda.</p>
        <p className="text-xs mt-1">Clique em "Gerar PDF" para criar a primeira versão.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
        {versions.length} versã{versions.length === 1 ? 'o' : 'ões'} gerada{versions.length === 1 ? '' : 's'}
      </p>
      {[...versions].reverse().map(v => (
        <div
          key={v.id}
          className="flex items-center gap-3 p-3 rounded-xl border border-[#E7E2D8] hover:border-[#1F4E5F]/30 transition group"
          style={{ background: '#F6F4EF' }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: '#1F4E5F' }}
          >
            <FileText size={14} color="#fff" />
          </div>

          <div className="flex-1 min-w-0">
            {!compact && (
              <p className="text-sm font-bold text-gray-800 truncate">
                v{v.versionNumber} — {v.title}
              </p>
            )}
            {compact && (
              <p className="text-sm font-bold text-gray-800">
                Versão {v.versionNumber}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-0.5">
              {new Date(v.createdAt).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
              {' · '}{v.createdBy}
            </p>
            <p className="text-[10px] font-mono text-gray-400 mt-0.5">{v.auditCode}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {v.fileBlob ? (
              <button
                type="button"
                onClick={() => onDownload(v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                style={{ background: '#1F4E5F', color: '#fff' }}
                title="Baixar PDF desta versão"
              >
                <Download size={12} /> PDF
              </button>
            ) : (
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                <Archive size={11} /> salvo
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
