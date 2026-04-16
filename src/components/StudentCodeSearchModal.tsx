/**
 * StudentCodeSearchModal.tsx
 * Busca aluno por código único entre escolas e cria vínculo (sem duplicar linha).
 * Depende de: schema_v25_student_tenant_access.sql
 */
import React, { useState, useRef } from 'react';
import {
  Search, X, Link2, AlertCircle, CheckCircle2,
  Building2, GraduationCap, Hash, ArrowRight, Loader2,
  ShieldCheck, Info, UserCheck,
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
  /** Chamado quando o vínculo é criado com sucesso. studentId = ID do aluno original (não duplicado). */
  onImported: (studentId: string, protocolCode: string | null) => void;
  onClose: () => void;
}

type Step = 'search' | 'preview' | 'linking' | 'done' | 'error';

export const StudentCodeSearchModal: React.FC<Props> = ({ user, onImported, onClose }) => {
  const [code, setCode]           = useState('');
  const [step, setStep]           = useState<Step>('search');
  const [searching, setSearching] = useState(false);
  const [result, setResult]       = useState<StudentSearchResult | null>(null);
  const [linked, setLinked]       = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isSameTenant = result?.tenant_id === user.tenant_id;

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

  // ── Vínculo (substitui "importar" que duplicava linha) ──────────────────────
  const handleLink = async () => {
    if (!result) return;
    setStep('linking');
    try {
      const res = await StudentSearchService.importStudent(result.student_id, user);
      setLinked(res);
      setStep('done');
      onImported(res.student_id, res.protocol_code);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erro ao vincular aluno. Tente novamente.');
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
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>Localiza e vincula alunos de outras escolas</p>
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

          {/* Campo de busca — permanece visível no passo preview */}
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
                    if (step === 'preview') { setStep('search'); setResult(null); }
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

          {/* Preview do aluno encontrado */}
          {step === 'preview' && result && (
            <div
              className="rounded-xl p-4 flex flex-col gap-3"
              style={{ background: C.bg, border: `1.5px solid ${C.border}` }}
            >
              <p className="text-xs font-bold uppercase" style={{ color: C.petrol }}>Aluno Encontrado</p>

              {/* Avatar + nome */}
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

              {/* Detalhes não-sensíveis */}
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
                <div className="flex items-center gap-1.5 font-mono col-span-2" style={{ color: C.petrol }}>
                  <Hash size={13} />
                  <span className="font-bold">{result.unique_code}</span>
                </div>
              </div>

              {/* Aviso contextual por cenário */}
              {isSameTenant ? (
                <div
                  className="flex items-start gap-2 p-3 rounded-lg text-xs"
                  style={{ background: '#FEF9C3', color: '#92400E' }}
                >
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    <strong>Este aluno já pertence à sua escola.</strong>{' '}
                    Você pode localizá-lo diretamente na lista de alunos.
                  </span>
                </div>
              ) : (
                <>
                  <div
                    className="flex items-start gap-2 p-3 rounded-lg text-xs"
                    style={{ background: '#ECFDF5', color: '#065F46' }}
                  >
                    <ShieldCheck size={14} className="shrink-0 mt-0.5" />
                    <span>
                      <strong>Aluno de outra escola.</strong>{' '}
                      Ao adicionar, um protocolo de acesso será gerado e a escola de origem será notificada.
                      Dados clínicos permanecem protegidos.
                    </span>
                  </div>

                  {/* Botão de ação principal */}
                  <button
                    onClick={handleLink}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                    style={{ background: C.petrol }}
                  >
                    <Link2 size={16} />
                    Adicionar à minha escola
                    <ArrowRight size={16} />
                  </button>
                </>
              )}
            </div>
          )}

          {/* Vinculando */}
          {step === 'linking' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <Loader2 size={40} className="animate-spin" style={{ color: C.petrol }} />
              <div>
                <p className="font-bold text-base" style={{ color: C.dark }}>Criando vínculo...</p>
                <p className="text-xs mt-1" style={{ color: C.gray }}>
                  Gerando protocolo de acesso e notificando a escola de origem.
                </p>
              </div>
            </div>
          )}

          {/* Sucesso */}
          {step === 'done' && linked && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: '#ECFDF5' }}
              >
                {linked.already_exists
                  ? <UserCheck size={36} color="#059669" />
                  : <CheckCircle2 size={36} color="#059669" />}
              </div>
              <div>
                <p className="font-bold text-lg" style={{ color: C.dark }}>
                  {linked.already_exists ? 'Aluno já vinculado' : 'Vínculo criado!'}
                </p>
                <p className="text-sm mt-1" style={{ color: C.gray }}>
                  {linked.already_exists
                    ? `${linked.student_name} já estava vinculado à sua escola.`
                    : `${linked.student_name} foi adicionado à sua escola como Aluno Externo.`}
                </p>
              </div>

              {linked.protocol_code && (
                <div
                  className="w-full rounded-xl p-4 text-center"
                  style={{ background: C.bg, border: `1px solid ${C.border}` }}
                >
                  <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.gray }}>
                    Protocolo de Acesso
                  </p>
                  <p className="font-mono font-bold text-xl tracking-widest" style={{ color: C.petrol }}>
                    {linked.protocol_code}
                  </p>
                  <p className="text-xs mt-1" style={{ color: C.gray }}>
                    Guarde este código. A escola de origem foi notificada.
                  </p>
                  <button
                    onClick={() => navigator.clipboard.writeText(linked.protocol_code!)}
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

          {/* Erro */}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: '#FEF2F2' }}
              >
                <AlertCircle size={32} color="#DC2626" />
              </div>
              <div>
                <p className="font-bold text-base" style={{ color: '#DC2626' }}>Não foi possível criar o vínculo</p>
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
