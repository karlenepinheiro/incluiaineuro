import React from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';

interface Props {
  noAccountCount: number;
  notActivatedCount: number;
  unknownProductCount: number;
  onOpenDrawer?: () => void;
}

export const KiwifyStatusBanner: React.FC<Props> = ({
  noAccountCount,
  notActivatedCount,
  unknownProductCount,
  onOpenDrawer,
}) => {
  const totalIssues = noAccountCount + notActivatedCount + unknownProductCount;

  if (totalIssues === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
        <CheckCircle size={13} className="text-emerald-500 shrink-0" />
        <span className="text-xs font-medium text-emerald-700">Kiwify · sem pendências de ativação</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
      <AlertTriangle size={13} className="text-amber-500 shrink-0" />
      <div className="flex-1 flex flex-wrap gap-x-4 gap-y-0.5 items-center">
        <span className="text-xs font-semibold text-amber-700">
          Kiwify · {totalIssues} {totalIssues === 1 ? 'pendência' : 'pendências'}
        </span>
        <div className="flex gap-3 text-[11px] text-amber-600">
          {noAccountCount > 0 && (
            <span>
              <strong>{noAccountCount}</strong> sem conta
            </span>
          )}
          {notActivatedCount > 0 && (
            <span>
              <strong>{notActivatedCount}</strong> sem ativação
            </span>
          )}
          {unknownProductCount > 0 && (
            <span>
              <strong>{unknownProductCount}</strong> produto desconhecido
            </span>
          )}
        </div>
      </div>
      {onOpenDrawer && noAccountCount > 0 && (
        <button
          onClick={onOpenDrawer}
          className="text-[11px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition shrink-0"
        >
          Ver compras →
        </button>
      )}
    </div>
  );
};
