import React from 'react';

// ── Variantes semânticas ──────────────────────────────────────────────────────
// primary     → Salvar / Concluir / Novo Documento   — petrol sólido
// secondary   → Editar / Organizar / Visualizar      — borda petrol, fundo branco
// outline     → PDF / Imprimir                       — borda cinza, fundo branco
// ghost       → Fechar / Voltar                      — sem borda, texto cinza
// destructive → Excluir                              — vermelho
// amber       → Salvar como modelo (especial)        — âmbar

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'amber';
type Size = 'sm' | 'md';

const BASE = 'inline-flex items-center gap-1.5 font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none';

const VARIANT_CLS: Record<Variant, string> = {
  primary:     'bg-[#1F4E5F] text-white hover:bg-[#153846] focus-visible:ring-[#1F4E5F]',
  secondary:   'bg-white text-[#1F4E5F] border border-[#1F4E5F] hover:bg-[#EFF9FF] focus-visible:ring-[#1F4E5F]',
  outline:     'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus-visible:ring-gray-300',
  ghost:       'bg-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100 focus-visible:ring-gray-300',
  destructive: 'bg-white text-red-500 border border-red-100 hover:bg-red-50 hover:border-red-200 focus-visible:ring-red-300',
  amber:       'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 focus-visible:ring-amber-300',
};

const SIZE_CLS: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
};

export interface DocButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  loading?: boolean;
}

export const DocButton: React.FC<DocButtonProps> = ({
  variant = 'outline',
  size = 'md',
  icon,
  loading,
  children,
  className = '',
  disabled,
  ...rest
}) => (
  <button
    className={`${BASE} ${VARIANT_CLS[variant]} ${SIZE_CLS[size]} ${className}`}
    disabled={disabled || loading}
    {...rest}
  >
    {loading ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : icon}
    {children}
  </button>
);

// ── Botão apenas-ícone com tooltip nativo ─────────────────────────────────────
export interface DocIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon: React.ReactNode;
  label: string;
}

export const DocIconButton: React.FC<DocIconButtonProps> = ({
  variant = 'ghost',
  icon,
  label,
  className = '',
  ...rest
}) => (
  <button
    aria-label={label}
    title={label}
    className={`p-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 ${VARIANT_CLS[variant]} ${className}`}
    {...rest}
  >
    {icon}
  </button>
);

// ── Container de toolbar ──────────────────────────────────────────────────────
interface DocumentToolbarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}

export const DocumentToolbar: React.FC<DocumentToolbarProps> = ({ left, right, className = '' }) => (
  <div className={`w-full bg-white border-b px-4 py-3 flex flex-col md:flex-row justify-between items-center sticky top-0 z-50 print:hidden gap-3 shadow-sm ${className}`}>
    <div className="flex items-center gap-3 w-full md:w-auto">{left}</div>
    <div className="flex flex-wrap items-center gap-2 justify-end w-full md:w-auto">{right}</div>
  </div>
);
