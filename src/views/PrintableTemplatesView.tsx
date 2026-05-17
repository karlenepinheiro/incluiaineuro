/**
 * PrintableTemplatesView.tsx
 * Modelos imprimíveis em branco — para preenchimento à mão.
 * Sprint 7 / Etapa 1 (FREE): Ficha do Aluno, Registro de Atendimento, Observação Pedagógica.
 * Sprint 7 / Etapa 2 (PRO): PEI, PAEE, PDI, Estudo de Caso, Plano de Ação (locked).
 */
import React, { useState } from 'react';
import {
  Download, User, ClipboardList, Eye, FileText, FileSearch,
  GraduationCap, Lock, Printer, Info, BookOpen,
} from 'lucide-react';
import { User as UserType } from '../types';
import {
  generateFichaAluno,
  generateRegistroAtendimento,
  generateObservacaoPedagogica,
} from '../services/blankPDFService';
import type { SchoolConfig } from '../types';

// ─── Catálogo de modelos ──────────────────────────────────────────────────────

type TemplateSlug =
  | 'ficha_aluno'
  | 'registro_atendimento'
  | 'observacao_pedagogica'
  | 'pei'
  | 'paee'
  | 'pdi'
  | 'estudo_caso'
  | 'plano_acao';

interface TemplateEntry {
  slug:        TemplateSlug;
  title:       string;
  description: string;
  plan:        'FREE' | 'PRO';
  icon:        React.ReactNode;
  category:    string;
  generate:    ((school?: SchoolConfig) => Promise<void>) | null;
}

const TEMPLATES: TemplateEntry[] = [
  {
    slug:        'ficha_aluno',
    title:       'Ficha do Aluno',
    description: 'Identificação, diagnóstico, suporte, contato familiar e perfil pedagógico.',
    plan:        'FREE',
    icon:        <User size={22} />,
    category:    'Pedagógico',
    generate:    generateFichaAluno,
  },
  {
    slug:        'registro_atendimento',
    title:       'Registro de Atendimento',
    description: 'Registro diário de atendimento AEE com objetivos, atividades e encaminhamentos.',
    plan:        'FREE',
    icon:        <ClipboardList size={22} />,
    category:    'Pedagógico',
    generate:    generateRegistroAtendimento,
  },
  {
    slug:        'observacao_pedagogica',
    title:       'Observação Pedagógica',
    description: 'Ficha de observação do aluno em sala de aula — comportamento, participação e estratégias.',
    plan:        'FREE',
    icon:        <Eye size={22} />,
    category:    'Pedagógico',
    generate:    generateObservacaoPedagogica,
  },
  {
    slug:        'pei',
    title:       'PEI em branco',
    description: 'Plano Educacional Individualizado com todas as seções para preenchimento manual.',
    plan:        'PRO',
    icon:        <FileText size={22} />,
    category:    'Documentos Oficiais',
    generate:    null,
  },
  {
    slug:        'paee',
    title:       'PAEE em branco',
    description: 'Plano de Atendimento Educacional Especializado com campos para metas e estratégias.',
    plan:        'PRO',
    icon:        <FileText size={22} />,
    category:    'Documentos Oficiais',
    generate:    null,
  },
  {
    slug:        'pdi',
    title:       'PDI em branco',
    description: 'Plano de Desenvolvimento Individual com linha do tempo e metas de longo prazo.',
    plan:        'PRO',
    icon:        <GraduationCap size={22} />,
    category:    'Documentos Oficiais',
    generate:    null,
  },
  {
    slug:        'estudo_caso',
    title:       'Estudo de Caso em branco',
    description: 'Estudo de Caso completo com 7 seções — identificação, histórico, análise e parecer.',
    plan:        'PRO',
    icon:        <FileSearch size={22} />,
    category:    'Documentos Oficiais',
    generate:    null,
  },
  {
    slug:        'plano_acao',
    title:       'Plano de Ação do Regente',
    description: 'Plano de ação semanal / mensal para o professor da sala comum.',
    plan:        'PRO',
    icon:        <BookOpen size={22} />,
    category:    'Pedagógico',
    generate:    null,
  },
];

const CATEGORIES = ['Pedagógico', 'Documentos Oficiais'];

// ─── Paleta inline ────────────────────────────────────────────────────────────
const petrol = '#1F4E5F';
const gold   = '#C69214';
const border = '#E7E2D8';
const bg     = '#F6F4EF';

// ─── Componente ───────────────────────────────────────────────────────────────

interface PrintableTemplatesViewProps {
  user: UserType;
}

export const PrintableTemplatesView: React.FC<PrintableTemplatesViewProps> = ({ user }) => {
  const [loadingSlug, setLoadingSlug] = useState<TemplateSlug | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('Todos');

  const school = user.schoolConfigs?.[0] as SchoolConfig | undefined;

  const filteredTemplates = activeCategory === 'Todos'
    ? TEMPLATES
    : TEMPLATES.filter(t => t.category === activeCategory);

  const handleDownload = async (tpl: TemplateEntry) => {
    if (!tpl.generate) return;
    setError(null);
    setLoadingSlug(tpl.slug);
    try {
      await tpl.generate(school);
    } catch (e: any) {
      setError(`Erro ao gerar "${tpl.title}": ${e?.message ?? 'Tente novamente.'}`);
    } finally {
      setLoadingSlug(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-20 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Printer size={20} style={{ color: petrol }} />
            <h1 className="text-xl font-bold text-gray-900">Modelos Imprimíveis</h1>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed max-w-xl">
            Formulários em branco para imprimir e preencher à mão.
            Úteis para reuniões, atendimentos externos e registros em papel.
          </p>
        </div>
        {school && (
          <div
            className="shrink-0 text-right text-xs text-gray-400 rounded-xl px-3 py-2"
            style={{ background: '#F9FAFB', border: `1px solid ${border}` }}
          >
            <p className="font-bold text-gray-600">{school.schoolName}</p>
            {school.city && <p>{school.city}{school.state ? ` — ${school.state}` : ''}</p>}
            <p className="text-[10px] text-gray-300 mt-0.5">aparece no cabeçalho do PDF</p>
          </div>
        )}
      </div>

      {/* ── Banner institucional ── */}
      <div
        className="rounded-2xl px-4 py-3 flex items-start gap-3"
        style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}
      >
        <Info size={15} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 leading-relaxed">
          Todos os PDFs gerados aqui são <strong>modelos em branco, sem validade de autenticação digital</strong>.
          Não contêm QR code nem código de validação oficial.
          Para documentos auditáveis com dados do aluno, use os módulos PEI, PAEE, Estudo de Caso e PDI do menu.
        </p>
      </div>

      {/* ── Erro ── */}
      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
          style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626' }}
        >
          <span className="font-bold">Erro:</span> {error}
        </div>
      )}

      {/* ── Filtros por categoria ── */}
      <div className="flex gap-2 flex-wrap">
        {['Todos', ...CATEGORIES].map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="text-xs font-bold px-3.5 py-1.5 rounded-full border transition"
            style={{
              borderColor: activeCategory === cat ? petrol : border,
              background:  activeCategory === cat ? petrol : '#fff',
              color:       activeCategory === cat ? '#fff' : '#6B7280',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ── Grid de cards ── */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map(tpl => {
          const isFree    = tpl.plan === 'FREE';
          const isLoading = loadingSlug === tpl.slug;

          return (
            <div
              key={tpl.slug}
              className="bg-white rounded-2xl overflow-hidden flex flex-col transition"
              style={{
                border:  `1.5px solid ${border}`,
                opacity: !isFree ? 0.72 : 1,
              }}
            >
              {/* Cor de topo */}
              <div
                className="h-1.5"
                style={{ background: isFree ? petrol : '#D1D5DB' }}
              />

              <div className="p-5 flex flex-col flex-1">
                {/* Ícone + badge */}
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: isFree ? '#EFF6FF' : '#F3F4F6', color: isFree ? petrol : '#9CA3AF' }}
                  >
                    {tpl.icon}
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: isFree ? '#DCFCE7' : '#FEF3C7',
                      color:      isFree ? '#166534' : '#92400E',
                    }}
                  >
                    {tpl.plan}
                  </span>
                </div>

                {/* Título + descrição */}
                <h3 className="text-sm font-bold text-gray-900 mb-1">{tpl.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed flex-1">{tpl.description}</p>

                {/* Botão */}
                <div className="mt-4">
                  {isFree ? (
                    <button
                      onClick={() => handleDownload(tpl)}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition"
                      style={{ background: isLoading ? '#9CA3AF' : petrol }}
                    >
                      {isLoading ? (
                        <><span className="animate-spin">⏳</span> Gerando PDF…</>
                      ) : (
                        <><Download size={15} /> Baixar PDF</>
                      )}
                    </button>
                  ) : (
                    <div
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: '#F3F4F6', color: '#9CA3AF' }}
                    >
                      <Lock size={14} />
                      Em breve — Plano PRO
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Nota de rodapé ── */}
      <div
        className="rounded-2xl px-5 py-4 text-xs text-gray-400 leading-relaxed"
        style={{ background: bg, border: `1px solid ${border}` }}
      >
        <p className="font-semibold text-gray-500 mb-1">Sobre os modelos em branco</p>
        <p>
          Os PDFs são gerados localmente no seu navegador — nenhum dado é enviado a servidores.
          O cabeçalho institucional usa os dados configurados em <strong>Configurações → Dados da Escola</strong>.
          Sem dados de escola, o cabeçalho exibe campos em branco.
        </p>
      </div>

    </div>
  );
};
