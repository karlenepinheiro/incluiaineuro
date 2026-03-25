// components/DocumentCard.tsx
// Card estilo folha de papel para documentos institucionais
import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  icon: string;
  title: string;
  description: string;
  category: string;
  statusLabel: string;
  statusColor: string;
  auditCode?: string;
  versionCount?: number;
  isOpen?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const DocumentCard: React.FC<Props> = ({
  icon,
  title,
  description,
  category,
  statusLabel,
  statusColor,
  versionCount,
  isOpen,
  onToggle,
  children,
}) => (
  <div
    className="rounded-2xl overflow-hidden transition-all duration-200"
    style={{
      background: '#FFFFFF',
      border: '1px solid #E7E2D8',
      boxShadow: isOpen
        ? '0 8px 32px rgba(31,78,95,0.10), 0 2px 8px rgba(0,0,0,0.06)'
        : '0 2px 6px rgba(0,0,0,0.05)',
    }}
  >
    {/* Header — papel com borda superior colorida */}
    <div
      className="h-1 w-full"
      style={{ background: 'linear-gradient(90deg, #1F4E5F 0%, #C69214 100%)' }}
    />

    <button
      className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[#F6F4EF]/60 transition"
      onClick={onToggle}
    >
      <span className="text-2xl shrink-0 select-none">{icon}</span>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <h3 className="font-bold text-gray-800 text-[15px] leading-tight">{title}</h3>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: '#F6F4EF', color: '#6b7280' }}
          >
            {category}
          </span>
          {!!versionCount && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(31,78,95,0.08)', color: '#1F4E5F' }}
            >
              {versionCount} versã{versionCount === 1 ? 'o' : 'ões'}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">{description}</p>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${statusColor}`}>
          {statusLabel}
        </span>
        <span className="text-gray-400">
          {isOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </span>
      </div>
    </button>

    {isOpen && (
      <div className="border-t border-[#E7E2D8]">
        {/* Sombra de dobra — efeito papel */}
        <div
          className="h-1"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.04) 0%, transparent 100%)' }}
        />
        <div className="p-5">{children}</div>
      </div>
    )}
  </div>
);
