/**
 * StudentCodeSearchModal.tsx
 * Modal de busca de aluno por código único entre escolas.
 * Permite visualizar preview e importar como aluno externo.
 */
import React, { useState, useRef } from 'react';
import {
  Search, X, UserPlus, AlertCircle, CheckCircle2,
  Building2, GraduationCap, Hash, ArrowRight, Loader2,
  ShieldCheck, Info,
} from 'lucide-react';
import {
  StudentSearchService,
  type StudentSearchResult,
  type ImportResult,
} from '../services/studentSearchService';
import type { User } from '../types';

const C = {
  petrol:  '#1F4E5F',
  gold:    '#C69214',
  dark:    '#2E3A59',
  bg:      '#F6F4EF',
  surface: '#FFFFFF',
  border:  '#E7E2D8',
  gray:    '#6B7280',
};

interface Props {
  user: User;
  onImported: (studentId: string, protocolCode: string | null) => void;
  onClose: () => void;
}

type Step = 'search' | 'preview' | 'importing' | 'done' | 'error';

export const StudentCodeSearchModal: React.FC<Props> = ({ user, onImported, onClose }) => {
  const [code, setCode]           = useState('');
  const [step, setStep]           = useState<Step>('search');
  const [searching, setSearching] = useState(false);
  const [result, setResult]       = useState<StudentSearchResult | null>(null);
  const [imported, setImported]   = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Busca ──────────────────────────────────────────────────────────────────
  const handleSearch = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    setSearching(true);
    setErrorMsg('');
    setResult(null);

    try {
      const found = await StudentSearchService.searchByCode(normalized);
      if (!found) {
        setErrorMsg('Nenhum aluno encontrado com este código. Verifique e tente novamente.');
        setStep('search');
      } else {
        setResult(found);
        setStep('preview');
      }
    } catch {
      setErrorMsg('Erro na busca. Verifique sua conexão e tente novamente.');
    } finally {
      setSearching(false);
    }
  };

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!result) return;
    setStep('importing');
    try {
      const res = await StudentSearchService.importStudent(result.student_id, user);
      setImported(res);
      setStep('done');
      onImported(res.student_id, res.protocol_code);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erro ao importar aluno.');
      setStep('error');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ background: C.petrol }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <Search size={18} color="white" />
            </div>
            <div>
              <p className="font-bold text-white text-base">Buscar Aluno por Código</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>Pesquisa entre escolas via código único</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white opacity-70 hover:opacity-100 transition-opacity">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-5">

          {/* Aviso informativo */}
          <div
            className="flex gap-3 p-3 rounded-xl text-xs"
            style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF' }}
          >
            <Info size={16} className="shrink-0 mt-0.5" />
            <span>
              Digite o código único do aluno (formato <strong>INC-XXXX-XXXX</strong>).
              Apenas nome, escola e série são exibidos. Dados clínicos ficam protegidos.
            </span>
          </div>

          {/* Passo: busca */}
          {(step === 'search' || step === 'preview') && (
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: C.petrol }}>
                CÓDIGO DO ALUNO
              </label>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={code}
                  onChange={e => {
                    setCode(e.target.value.toUpperCase());
                    setErrorMsg('');
                    if (step === 'preview') setStep('search');
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ex.: INC-AB12-CD34"
                  maxLength={16}
                  className="flex-1 border rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2"
                  style={{
                    borderColor: C.border,
                    fontWeight: 700,
                    color: C.petrol,
                    '--tw-ring-color': C.petrol,
                  } as React.CSSProperties}
                  autoFocus
                />
                <button
                  onClick={handleSearch}
                  disabled={searching || !code.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ background: C.petrol }}
                >
                  {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  {searching ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
              {errorMsg && (
                <p className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
                  <AlertCircle size={13} /> {errorMsg}
                </p>
              )}
            </div>
          )}

          {/* Passo: preview */}
          {step === 'preview' && result && (
            <div
              className="rounded-xl p-4 flex flex-col gap-3"
              style={{ background: C.bg, border: `1.5px solid ${C.border}` }}
            >
              <p className="text-xs font-bold uppercase" style={{ color: C.petrol }}>Aluno Encontrado</p>

              {/* Nome */}
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0"
                  style={{ background: C.petrol }}
                >
                  {result.student_name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-base" style={{ color: C.dark }}>{result.student_name}</p>
                </div>
              </div>

              {/* Detalhes */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5" style={{ color: C.gray }}>
                  <Building2 size={13} />
                  <span>{result.school_name || 'Escola não informada'}</span>
                </div>
                {result.grade && (
                  <div className="flex items-center gap-1.5" style={{ color: C.gray }}>
                    <GraduationCap size={13} />
                    <span>{result.grade}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 font-mono" style={{ color: C.petrol }}>
                  <Hash size={13} />
                  <span className="font-bold">{result.unique_code}</span>
                </div>
              </div>

              {/* Aviso: escola diferente */}
              {result.tenant_id === user.tenant_id ? (
                <div
                  className="flex items-center gap-2 p-2 rounded-lg text-xs"
                  style={{ background: '#FEF9C3', color: '#92400E' }}
                >
                  <AlertCircle size={13} />
                  Este aluno já pertence à sua escola.
                </div>
              ) : (
                <div
                  className="flex items-center gap-2 p-2 rounded-lg text-xs"
                  style={{ background: '#ECFDF5', color: '#065F46' }}
                >
                  <ShieldCheck size={13} />
                  Aluno de outra escola. Ao importar, um protocolo de acesso será gerado e a escola de origem será notificada.
                </div>
              )}

              {/* Botão importar */}
              {result.tenant_id !== user.tenant_id && (
                <button
                  onClick={handleImport}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity"
                  style={{ background: C.petrol }}
                >
                  <UserPlus size={16} />
                  Importar Aluno para Minha Base
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          )}

          {/* Passo: importando */}
          {step === 'importing' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <Loader2 size={40} className="animate-spin" style={{ color: C.petrol }} />
              <div>
                <p className="font-bold text-base" style={{ color: C.dark }}>Importando aluno...</p>
                <p className="text-xs mt-1" style={{ color: C.gray }}>Gerando protocolo e enviando notificações.</p>
              </div>
            </div>
          )}

          {/* Passo: concluído */}
          {step === 'done' && imported && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: '#ECFDF5' }}
              >
                <CheckCircle2 size={36} color="#059669" />
              </div>
              <div>
                <p className="font-bold text-lg" style={{ color: C.dark }}>
                  {imported.already_exists ? 'Aluno já importado' : 'Aluno importado!'}
                </p>
                <p className="text-sm mt-1" style={{ color: C.gray }}>
                  {imported.already_exists
                    ? 'Este aluno já estava na sua base.'
                    : `${imported.student_name} foi adicionado como Aluno Externo.`}
                </p>
              </div>

              {imported.protocol_code && (
                <div
                  className="w-full rounded-xl p-4 text-center"
                  style={{ background: C.bg, border: `1px solid ${C.border}` }}
                >
                  <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.gray }}>
                    Protocolo de Acesso
                  </p>
                  <p className="font-mono font-bold text-xl tracking-widest" style={{ color: C.petrol }}>
                    {imported.protocol_code}
                  </p>
                  <p className="text-xs mt-1" style={{ color: C.gray }}>
                    Guarde este código. A escola de origem foi notificada.
                  </p>
                  <button
                    onClick={() => navigator.clipboard.writeText(imported.protocol_code!)}
                    className="mt-2 text-xs px-3 py-1 rounded-lg border transition-colors hover:bg-gray-100"
                    style={{ color: C.petrol, borderColor: C.border }}
                  >
                    Copiar código
                  </button>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: C.petrol }}
              >
                Fechar
              </button>
            </div>
          )}

          {/* Passo: erro */}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: '#FEF2F2' }}
              >
                <AlertCircle size={32} color="#DC2626" />
              </div>
              <div>
                <p className="font-bold text-base" style={{ color: '#DC2626' }}>Erro ao importar</p>
                <p className="text-xs mt-1" style={{ color: C.gray }}>{errorMsg}</p>
              </div>
              <button
                onClick={() => { setStep('search'); setErrorMsg(''); setResult(null); }}
                className="text-sm font-semibold underline"
                style={{ color: C.petrol }}
              >
                Tentar novamente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
