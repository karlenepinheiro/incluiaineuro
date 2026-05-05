import React, { useState } from 'react';
import {
  FileText, Brain, ClipboardCheck, Eye,
  GraduationCap, Users, Target,
  ChevronDown, ChevronUp, Download, ExternalLink, Hash,
  User as UserIcon, Calendar, FolderOpen,
} from 'lucide-react';
import { User } from '../types';

// ── Paleta ────────────────────────────────────────────────────────────────────
const P = {
  petrol:  '#1F4E5F',
  gold:    '#C69214',
  dark:    '#2E3A59',
  bg:      '#F6F4EF',
  surface: '#FFFFFF',
  border:  '#E7E2D8',
  text:    '#374151',
  muted:   '#6B7280',
  light:   '#F9F7F4',
};

// ── Tipos ─────────────────────────────────────────────────────────────────────
type DocKind =
  | 'relatorio_simples'
  | 'relatorio_completo'
  | 'ficha_complementar'
  | 'observacao_professor'
  | 'analise_aee'
  | 'escuta_familia'
  | 'plano_acao_regente';

interface DocumentHistoryItem {
  id: string;
  kind: DocKind;
  title: string;
  aluno: string;
  dataHora: string;
  geradoPor: string;
  codigo: string;
  descricao: string;
}

// ── Metadados por tipo ────────────────────────────────────────────────────────
const KIND_META: Record<DocKind, {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}> = {
  relatorio_simples: {
    label: 'Relatório Simples',
    icon: FileText,
    color: '#2563EB',
    bg: '#EFF6FF',
  },
  relatorio_completo: {
    label: 'Relatório Completo',
    icon: Brain,
    color: '#7C3AED',
    bg: '#F5F3FF',
  },
  ficha_complementar: {
    label: 'Ficha Complementar',
    icon: ClipboardCheck,
    color: '#D97706',
    bg: '#FFFBEB',
  },
  observacao_professor: {
    label: 'Observação do Professor',
    icon: Eye,
    color: '#16A34A',
    bg: '#F0FDF4',
  },
  analise_aee: {
    label: 'Análise de AEE',
    icon: GraduationCap,
    color: '#0D9488',
    bg: '#F0FDFA',
  },
  escuta_familia: {
    label: 'Escuta da Família',
    icon: Users,
    color: '#DB2777',
    bg: '#FDF2F8',
  },
  plano_acao_regente: {
    label: 'Plano de Ação — Prof. Regente',
    icon: Target,
    color: '#EA580C',
    bg: '#FFF7ED',
  },
};

// ── Dados mockados ────────────────────────────────────────────────────────────
const MOCK_DOCS: DocumentHistoryItem[] = [
  {
    id: '1',
    kind: 'relatorio_simples',
    title: 'Relatório de Evolução — Maio 2025',
    aluno: 'Lucas Andrade',
    dataHora: '05/05/2025 às 14:32',
    geradoPor: 'Karle Pinheiro',
    codigo: 'RS-2025-00841',
    descricao: 'Síntese objetiva do desenvolvimento do aluno no período, com destaque para avanços em comunicação expressiva e participação nas atividades.',
  },
  {
    id: '2',
    kind: 'relatorio_completo',
    title: 'Relatório Anual Completo 2025',
    aluno: 'Mariana Costa',
    dataHora: '02/05/2025 às 09:15',
    geradoPor: 'Karle Pinheiro',
    codigo: 'RC-2025-00392',
    descricao: 'Documento detalhado cobrindo todas as dimensões do perfil cognitivo, histórico de atendimentos, evolução por critério e recomendações para o próximo ciclo.',
  },
  {
    id: '3',
    kind: 'ficha_complementar',
    title: 'Ficha de Observação Comportamental',
    aluno: 'Pedro Henrique Souza',
    dataHora: '01/05/2025 às 16:00',
    geradoPor: 'Karle Pinheiro',
    codigo: 'FC-2025-00217',
    descricao: 'Registro sistematizado de comportamentos observados em sala de aula regular, coletado ao longo de 4 semanas de observação.',
  },
  {
    id: '4',
    kind: 'observacao_professor',
    title: 'Observação — Turma 3º Ano A',
    aluno: 'Ana Beatriz Lima',
    dataHora: '29/04/2025 às 10:45',
    geradoPor: 'Profª Renata Campos',
    codigo: 'OP-2025-00508',
    descricao: 'Anotações da professora regente sobre desempenho acadêmico, interações sociais e necessidades identificadas durante as atividades curriculares.',
  },
  {
    id: '5',
    kind: 'analise_aee',
    title: 'Análise de AEE — 1º Semestre',
    aluno: 'Lucas Andrade',
    dataHora: '25/04/2025 às 11:20',
    geradoPor: 'Karle Pinheiro',
    codigo: 'AEE-2025-00134',
    descricao: 'Análise do atendimento educacional especializado no período, incluindo objetivos alcançados, barreiras identificadas e ajustes propostos.',
  },
  {
    id: '6',
    kind: 'escuta_familia',
    title: 'Escuta Familiar — Reunião Maio',
    aluno: 'Mariana Costa',
    dataHora: '20/04/2025 às 15:00',
    geradoPor: 'Karle Pinheiro',
    codigo: 'EF-2025-00076',
    descricao: 'Registro das percepções da família sobre o desenvolvimento da aluna em casa, rotina, pontos de atenção e expectativas para o próximo período.',
  },
  {
    id: '7',
    kind: 'plano_acao_regente',
    title: 'Plano de Ação — Adaptações Curriculares',
    aluno: 'Pedro Henrique Souza',
    dataHora: '15/04/2025 às 08:30',
    geradoPor: 'Profª Renata Campos',
    codigo: 'PAR-2025-00055',
    descricao: 'Plano elaborado pelo professor regente com as adaptações curriculares previstas, estratégias de ensino diferenciadas e metas para o bimestre.',
  },
];

// ── Card ──────────────────────────────────────────────────────────────────────
const DocCard: React.FC<{ doc: DocumentHistoryItem }> = ({ doc }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = KIND_META[doc.kind];
  const Icon = meta.icon;

  return (
    <div style={{
      background: P.surface,
      border: `1px solid ${P.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'box-shadow 0.15s',
      boxShadow: expanded ? '0 4px 16px rgba(30,50,70,0.08)' : '0 1px 3px rgba(30,50,70,0.04)',
    }}>

      {/* Faixa de tipo colorida */}
      <div style={{
        height: 3,
        background: meta.color,
        opacity: 0.7,
      }} />

      {/* Corpo principal — sempre visível */}
      <div style={{ padding: '14px 16px' }}>

        {/* Linha 1: ícone + título + badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: meta.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon size={18} style={{ color: meta.color }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 13, fontWeight: 700, color: P.dark,
                lineHeight: 1.3, wordBreak: 'break-word',
              }}>
                {doc.title}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 600,
                padding: '2px 7px', borderRadius: 20,
                background: '#F0FDF4', color: '#15803D',
                border: '1px solid #BBF7D0',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                Registrado
              </span>
            </div>
            <span style={{
              fontSize: 11, color: meta.color, fontWeight: 600,
              background: meta.bg,
              padding: '1px 6px', borderRadius: 4, display: 'inline-block', marginTop: 3,
            }}>
              {meta.label}
            </span>
          </div>
        </div>

        {/* Linha 2: metadados */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '4px 12px',
          marginBottom: 12,
        }}>
          <MetaField icon={UserIcon} label="Aluno" value={doc.aluno} />
          <MetaField icon={Calendar} label="Data" value={doc.dataHora} />
          <MetaField icon={UserIcon} label="Gerado por" value={doc.geradoPor} />
          <MetaField icon={Hash} label="Registro" value={doc.codigo} mono />
        </div>

        {/* Linha 3: botões */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <ActionBtn
            icon={ExternalLink}
            label="Abrir"
            color={meta.color}
            bg={meta.bg}
            onClick={() => console.log('Abrir:', doc.codigo)}
          />
          <ActionBtn
            icon={Download}
            label="PDF"
            color={P.muted}
            bg={P.light}
            onClick={() => console.log('PDF em breve:', doc.codigo)}
          />
          <button
            onClick={() => setExpanded(v => !v)}
            title={expanded ? 'Minimizar' : 'Expandir'}
            style={{
              marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 7,
              border: `1px solid ${P.border}`,
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 11, fontWeight: 600, color: P.muted,
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = P.light)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {expanded
              ? <><ChevronUp size={13} /> Minimizar</>
              : <><ChevronDown size={13} /> Expandir</>
            }
          </button>
        </div>
      </div>

      {/* Painel expandido */}
      {expanded && (
        <div style={{
          borderTop: `1px solid ${P.border}`,
          padding: '12px 16px',
          background: P.light,
        }}>
          <p style={{ fontSize: 12, color: P.text, lineHeight: 1.6, margin: 0 }}>
            {doc.descricao}
          </p>
        </div>
      )}
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const MetaField: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}> = ({ icon: Icon, label, value, mono }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
    <Icon size={11} style={{ color: P.muted, flexShrink: 0 }} />
    <span style={{ fontSize: 10, color: P.muted, flexShrink: 0 }}>{label}:</span>
    <span style={{
      fontSize: 11, color: P.text, fontWeight: 500,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      fontFamily: mono ? 'monospace' : undefined,
    }}>
      {value}
    </span>
  </div>
);

const ActionBtn: React.FC<{
  icon: React.ElementType;
  label: string;
  color: string;
  bg: string;
  onClick: () => void;
}> = ({ icon: Icon, label, color, bg, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 7,
      border: `1px solid ${color}22`,
      background: bg, color, cursor: 'pointer',
      fontSize: 12, fontWeight: 600,
      transition: 'opacity 0.12s',
    }}
    onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
  >
    <Icon size={13} />
    {label}
  </button>
);

// ── View principal ────────────────────────────────────────────────────────────
interface Props {
  user: User;
}

export const FichasHistoricosView: React.FC<Props> = () => {
  const docs = MOCK_DOCS;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* Cabeçalho */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: P.dark, margin: 0 }}>
          Fichas e Históricos
        </h1>
        <p style={{ fontSize: 13, color: P.muted, margin: '4px 0 0' }}>
          Central de documentos e registros pedagógicos
        </p>
      </div>

      {/* Barra de ações — reservada para filtros e botões futuros */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 24,
        padding: '12px 16px',
        background: P.surface,
        border: `1px solid ${P.border}`,
        borderRadius: 10,
        minHeight: 52,
      }}>
        <div style={{ display: 'flex', gap: 8, flex: 1 }} />
        <div />
      </div>

      {/* Grid de cards */}
      {docs.length === 0 ? (
        <div style={{
          background: P.surface, border: `1px solid ${P.border}`,
          borderRadius: 12, minHeight: 420,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <FolderOpen size={44} strokeWidth={1.2}
              style={{ color: P.border, display: 'block', margin: '0 auto 16px' }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: P.text, margin: '0 0 6px' }}>
              Nenhum documento encontrado
            </p>
            <p style={{ fontSize: 13, color: P.muted, margin: 0 }}>
              Os documentos gerados aparecerão aqui.
            </p>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 16,
        }}>
          {docs.map(doc => (
            <DocCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}

    </div>
  );
};
