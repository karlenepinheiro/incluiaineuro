import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type BillingHealthSeverity = 'ok' | 'warn' | 'critical' | 'neutral';

interface Props {
  title: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  severity?: BillingHealthSeverity;
  cta?: { label: string; onClick: () => void };
  prefix?: string;
}

const DOT: Record<BillingHealthSeverity, string> = {
  ok:       'bg-emerald-400',
  warn:     'bg-amber-400',
  critical: 'bg-red-500',
  neutral:  'bg-gray-300',
};

const BORDER: Record<BillingHealthSeverity, string> = {
  ok:       'border-gray-100',
  warn:     'border-amber-200',
  critical: 'border-red-200',
  neutral:  'border-gray-100',
};

const BG: Record<BillingHealthSeverity, string> = {
  ok:       'bg-white',
  warn:     'bg-amber-50/40',
  critical: 'bg-red-50/40',
  neutral:  'bg-white',
};

const CTA_STYLE: Record<BillingHealthSeverity, string> = {
  ok:       'text-gray-700 bg-gray-100 hover:bg-gray-200',
  warn:     'text-amber-700 bg-amber-100 hover:bg-amber-200',
  critical: 'text-red-700 bg-red-100 hover:bg-red-200',
  neutral:  'text-gray-600 bg-gray-100 hover:bg-gray-200',
};

export const BillingHealthCard: React.FC<Props> = ({
  title, value, subtext, icon: Icon, severity = 'neutral', cta, prefix = '',
}) => (
  <div className={`rounded-2xl border p-4 flex flex-col gap-2 transition-shadow hover:shadow-sm ${BORDER[severity]} ${BG[severity]}`}>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[severity]}`} />
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider leading-none">{title}</span>
      </div>
      <Icon size={12} className="text-gray-300" />
    </div>
    <p className="text-2xl font-bold text-gray-900 leading-none tabular-nums">
      {prefix}{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
    </p>
    {subtext && <p className="text-[10px] text-gray-400 leading-snug">{subtext}</p>}
    {cta && (
      <button
        onClick={cta.onClick}
        className={`mt-1 text-[10px] font-semibold py-1 px-2 rounded-lg transition self-start ${CTA_STYLE[severity]}`}
      >
        {cta.label} →
      </button>
    )}
  </div>
);
