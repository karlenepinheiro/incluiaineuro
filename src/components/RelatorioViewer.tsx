// RelatorioViewer.tsx — Relatório Técnico Pedagógico • IncluiAI
// ARQUITETURA: usa DocComponents como camada visual unificada
// Separação limpa: conteúdo (RelatorioResultado) → renderização (DocComponents)

import React from 'react';
import {
  Download, Printer, FileText, User, BookOpen, Brain,
  ClipboardList, TrendingUp, Lightbulb, HeartHandshake,
  Building2, Star, Shield, Zap, AlertCircle, Stethoscope,
} from 'lucide-react';
import type {
  RelatorioResultado, RelatorioSimples, RelatorioCompleto,
} from '../services/reportService';
import type { Student, SchoolConfig } from '../types';
import {
  colors, fonts, fontSize, spacing, radius,
  scoreColor, scoreBg, scoreLabel,
} from './docs/DocTokens';
import {
  DocumentPage, DocumentHeader, DocumentHero,
  DocumentStudentBadge, DocumentCard, DocumentChartBlock,
  DocumentChecklist, DocumentItemList, DocumentHighlight,
  DocumentFooter, DocumentSignatureBlock, DocumentRunningHeader,
} from './docs/DocComponents';

// ─── Dimensões dos critérios cognitivos ───────────────────────────────────────

const CRITERIA_SHORT = ['Com.', 'Int.', 'Aut.', 'Autorr.', 'Aten.', 'Comp.', 'Mot.F', 'Mot.G', 'Part.', 'Ling.'];
const CRITERIA_FULL  = [
  'Comunicação Expressiva', 'Interação Social', 'Autonomia (AVD)',
  'Autorregulação', 'Atenção Sustentada', 'Compreensão',
  'Motricidade Fina', 'Motricidade Grossa', 'Participação', 'Linguagem/Leitura',
];

// ─── Gráficos SVG (especializados — não generalizados) ────────────────────────

const BarChartSVG: React.FC<{ scores: number[] }> = ({ scores }) => {
  if (!scores.length) return null;
  const W = 520, H = 130, padX = 4, baseY = H - 18;
  const barW = (W - padX * (scores.length + 1)) / scores.length;
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 28}`} style={{ minWidth: 300 }}>
        {[1, 2, 3, 4, 5].map(v => (
          <line key={v} x1={0} y1={baseY - (v / 5) * (H - 18)} x2={W} y2={baseY - (v / 5) * (H - 18)}
            stroke={colors.border} strokeWidth={0.5} strokeDasharray="3 3" />
        ))}
        {scores.map((s, i) => {
          const h = (s / 5) * (H - 18);
          const x = padX + i * (barW + padX);
          const y = baseY - h;
          const color = scoreColor(s);
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h} rx={3} fill={color} opacity={0.82} />
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={8} fill={color} fontWeight="700">{s}</text>
              <text x={x + barW / 2} y={baseY + 12} textAnchor="middle" fontSize={6.5} fill={colors.gray}>
                {CRITERIA_SHORT[i] ?? ''}
              </text>
            </g>
          );
        })}
        <line x1={0} y1={baseY} x2={W} y2={baseY} stroke={colors.border} strokeWidth={1} />
      </svg>
    </div>
  );
};

const PieChartSVG: React.FC<{ scores: number[] }> = ({ scores }) => {
  if (!scores.length) return null;
  const buckets = [
    { label: 'Suporte intensivo (1)', count: 0, color: colors.red    },
    { label: 'Em construção (2)',      count: 0, color: colors.amber  },
    { label: 'Em desenvolvimento (3)', count: 0, color: colors.purple },
    { label: 'Avançado (4–5)',         count: 0, color: colors.green  },
  ];
  scores.forEach(s => {
    if      (s <= 1) buckets[0].count++;
    else if (s <= 2) buckets[1].count++;
    else if (s <= 3) buckets[2].count++;
    else             buckets[3].count++;
  });
  const total = scores.length;
  const cx = 78, cy = 78, r = 64;
  let cumAngle = -Math.PI / 2;
  const slices = buckets.map(b => {
    const angle  = (b.count / total) * 2 * Math.PI;
    const startA = cumAngle;
    cumAngle    += angle;
    return { ...b, startA, angle };
  }).filter(s => s.count > 0);

  const arcPath = (startA: number, angle: number) => {
    if (angle >= 2 * Math.PI)
      return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r} Z`;
    const x1 = cx + r * Math.cos(startA), y1 = cy + r * Math.sin(startA);
    const x2 = cx + r * Math.cos(startA + angle), y2 = cy + r * Math.sin(startA + angle);
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${angle > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <svg width="156" height="156" viewBox="0 0 156 156">
        {slices.map((s, i) => (
          <path key={i} d={arcPath(s.startA, s.angle)} fill={s.color} stroke="white" strokeWidth={1.5} />
        ))}
        <circle cx={cx} cy={cy} r={26} fill="white" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={14} fontWeight="800" fill={colors.dark}>{total}</text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize={6.5} fill={colors.gray}>critérios</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {buckets.filter(b => b.count > 0).map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: fontSize.xs, color: colors.dark }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: b.color, flexShrink: 0 }} />
            {b.label}
            <span style={{ fontWeight: 700, color: b.color, marginLeft: 4 }}>
              {b.count} ({Math.round((b.count / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const RadarSVG: React.FC<{ scores: number[] }> = ({ scores }) => {
  if (scores.length < 3) return null;
  const n = scores.length, size = 200;
  const cx = size / 2, cy = size / 2, R = size * 0.36;
  const angle = (i: number) => (i * 2 * Math.PI) / n - Math.PI / 2;
  const pt    = (i: number, rr: number) => `${cx + rr * Math.cos(angle(i))},${cy + rr * Math.sin(angle(i))}`;
  const polygon = scores.map((s, i) => pt(i, (s / 5) * R)).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.2, 0.4, 0.6, 0.8, 1].map(f => (
        <polygon key={f} points={Array.from({ length: n }, (_, i) => pt(i, R * f)).join(' ')}
          fill="none" stroke={colors.border} strokeWidth="1" />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <line key={i} x1={cx} y1={cy} x2={cx + R * Math.cos(angle(i))} y2={cy + R * Math.sin(angle(i))}
          stroke={colors.border} strokeWidth="1" />
      ))}
      <polygon points={polygon} fill={`${colors.petrol}22`} stroke={colors.petrol} strokeWidth="2" strokeLinejoin="round" />
      {scores.map((s, i) => {
        const rr = (s / 5) * R;
        return <circle key={i} cx={cx + rr * Math.cos(angle(i))} cy={cy + rr * Math.sin(angle(i))} r={4} fill={colors.petrol} />;
      })}
      {Array.from({ length: n }, (_, i) => (
        <text key={i} x={cx + (R + 14) * Math.cos(angle(i))} y={cy + (R + 14) * Math.sin(angle(i)) + 3}
          textAnchor="middle" fontSize={6.5} fill={colors.gray}>
          {CRITERIA_SHORT[i]}
        </text>
      ))}
    </svg>
  );
};

// ─── Score por critério (barras horizontais) ──────────────────────────────────

const CriteriaScores: React.FC<{ scores: number[] }> = ({ scores }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
    {CRITERIA_FULL.map((name, i) => {
      const s     = scores[i] ?? 1;
      const color = scoreColor(s);
      return (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: fontSize['2xs'], width: 140, flexShrink: 0, color: colors.dark }}>{name}</span>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: colors.border, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(s / 5) * 100}%`, background: color, borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: fontSize['2xs'], fontWeight: 700, width: 16, textAlign: 'right', color }}>{s}</span>
        </div>
      );
    })}
  </div>
);

// ─── Indicador geral de desenvolvimento (capa) ───────────────────────────────

const ScoreIndicatorBar: React.FC<{ avg: number }> = ({ avg }) => (
  <div style={{
    borderRadius: radius.lg, border: `1px solid ${colors.border}`,
    padding: `${spacing.md}px ${spacing.xl}px`, background: colors.surface,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
      <p style={{
        margin: 0, fontSize: fontSize.xs, color: colors.gray,
        textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700,
      }}>
        Indicador Geral de Desenvolvimento
      </p>
      <span style={{
        fontSize: fontSize.xs, fontWeight: 700, color: scoreColor(avg),
        background: scoreBg(avg), padding: '2px 10px', borderRadius: radius.full,
      }}>
        {scoreLabel(avg)}
      </span>
    </div>
    <div style={{ height: 10, borderRadius: 20, background: colors.border, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${(avg / 5) * 100}%`, borderRadius: 20,
        background: `linear-gradient(90deg, ${scoreColor(avg)}, ${scoreColor(avg)}cc)`,
      }} />
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
      {[1, 2, 3, 4, 5].map(v => (
        <span key={v} style={{ fontSize: fontSize['2xs'], color: colors.gray2 }}>{v}</span>
      ))}
    </div>
  </div>
);

// ─── Recomendações multidisciplinares ─────────────────────────────────────────
// Componente local especializado; usa DocComponents internamente

const RecommendationBlocks: React.FC<{
  pedagogicas:    string[];
  clinicas:       string[];
  familiares:     string[];
  institucionais?: string[];
}> = ({ pedagogicas, clinicas, familiares, institucionais = [] }) => {
  const groups = [
    { title: 'Pedagógicas',    items: pedagogicas,   icon: <BookOpen size={14} />,      color: colors.petrol },
    { title: 'Clínicas',       items: clinicas,       icon: <Stethoscope size={14} />,   color: colors.purple },
    { title: 'Familiares',     items: familiares,     icon: <HeartHandshake size={14} />, color: colors.green },
    { title: 'Institucionais', items: institucionais, icon: <Building2 size={14} />,     color: colors.blue  },
  ].filter(g => g.items?.length > 0);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: groups.length >= 3 ? '1fr 1fr' : '1fr',
      gap: spacing.md, marginBottom: spacing.xl,
    }}>
      {groups.map((g, i) => (
        <DocumentCard key={i} title={g.title} icon={g.icon} accentColor={g.color} style={{ marginBottom: 0 }}>
          <DocumentItemList items={g.items} accentColor={g.color} />
        </DocumentCard>
      ))}
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  student:      Student;
  scores:       number[];
  resultado:    RelatorioResultado;
  school?:      SchoolConfig | null;
  onExportPDF?: () => void;
  onPrint?:     () => void;
  loading?:     boolean;
}

export const RelatorioViewer: React.FC<Props> = ({
  student, scores, resultado, school, onExportPDF, onPrint, loading,
}) => {
  const { data } = resultado;
  const avg        = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const dateStr    = new Date(resultado.geradoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const schoolName = school?.schoolName || student.schoolName || '';
  const cityState  = [school?.city || student.city, school?.state].filter(Boolean).join(' – ');
  const isComplete = data.tipo === 'completo';
  const completo   = isComplete ? (data as RelatorioCompleto) : null;
  const simples    = !isComplete ? (data as RelatorioSimples) : null;
  const execText   = completo?.resumoExecutivo ||
    (data.identificacao?.length > 260 ? data.identificacao.substring(0, 257) + '…' : data.identificacao);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '96px 0', gap: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: `4px solid ${colors.petrol}40`, borderTopColor: colors.petrol,
          animation: 'spin 1s linear infinite',
        }} />
        <p style={{ fontSize: fontSize.sm, fontWeight: 600, color: colors.petrol, margin: 0 }}>
          Gerando relatório técnico…
        </p>
        <p style={{ fontSize: fontSize.xs, color: colors.gray, margin: 0 }}>
          A IA está analisando os dados do aluno. Aguarde alguns segundos.
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: fonts.body }}>

      {/* ── Barra de ações (oculta na impressão) ── */}
      <div className="print:hidden" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, padding: '10px 16px', borderRadius: radius.xl,
        background: colors.petrolL, border: `1px solid ${colors.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={15} color={colors.petrol} />
          <span style={{ fontSize: fontSize.sm, fontWeight: 700, color: colors.petrol }}>Relatório gerado com sucesso</span>
          <span style={{ fontSize: fontSize.xs, fontFamily: 'monospace', color: colors.gray, marginLeft: 8 }}>
            {resultado.codigoDoc}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onPrint && (
            <button onClick={onPrint} style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              padding: '6px 12px', borderRadius: radius.md, fontSize: fontSize.xs, fontWeight: 600,
              background: colors.surface, border: `1px solid ${colors.border}`, color: colors.dark,
            }}>
              <Printer size={13} /> Imprimir
            </button>
          )}
          {onExportPDF && (
            <button onClick={onExportPDF} style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              padding: '6px 14px', borderRadius: radius.md, fontSize: fontSize.xs, fontWeight: 700,
              background: colors.petrol, color: 'white', border: 'none',
            }}>
              <Download size={13} /> Exportar PDF
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PÁGINA 1 — CAPA                                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      <DocumentPage id="relatorio-cover" breakAfter>
        <DocumentHeader
          docType="relatorio"
          docLabel={isComplete ? 'Relatório Completo' : 'Relatório Simples'}
          docCode={resultado.codigoDoc}
          schoolName={schoolName}
          cityState={cityState}
          date={dateStr}
          emittedBy={resultado.geradoPor}
        />
        <DocumentHero
          title="Relatório Técnico Pedagógico"
          subtitle="Atendimento Educacional Especializado — Educação Inclusiva"
          docType="relatorio"
        />
        <div style={{ padding: `${spacing.xl}px 40px 28px`, display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
          <DocumentStudentBadge
            student={{
              name:          student.name,
              birthDate:     student.birthDate,
              grade:         student.grade,
              shift:         student.shift,
              diagnosis:     Array.isArray(student.diagnosis)
                               ? student.diagnosis.join(' • ')
                               : student.diagnosis || '',
              supportLevel:  student.supportLevel,
              schoolName:    schoolName,
              guardianName:  student.guardianName,
              guardianPhone: student.guardianPhone,
              city:          school?.city || student.city,
              state:         school?.state,
              score:         scores.length > 0 ? avg : undefined,
            }}
            accentColor={colors.petrol}
          />
          {scores.length > 0 && <ScoreIndicatorBar avg={avg} />}
          <div style={{ flex: 1 }} />
          <DocumentFooter
            docCode={resultado.codigoDoc}
            emittedBy={resultado.geradoPor}
            date={dateStr}
            schoolName={schoolName}
            showQR
          />
        </div>
      </DocumentPage>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PÁGINAS INTERNAS                                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      <div style={{ paddingTop: spacing['2xl'] }}>

        <DocumentRunningHeader
          studentName={student.name}
          docType="relatorio"
          code={resultado.codigoDoc}
        />

        {/* Resumo Executivo */}
        {execText && (
          <DocumentCard title="Resumo Executivo" icon={<Zap size={14} />} accentColor={colors.gold}>
            <p style={{ margin: 0, fontSize: fontSize.base, color: colors.dark, lineHeight: 1.8 }}>
              {execText}
            </p>
            {data.conclusao && (
              <div style={{
                borderLeft: `3px solid ${colors.gold}`, paddingLeft: spacing.md,
                marginTop: spacing.lg, fontSize: fontSize.sm, color: colors.gray,
                lineHeight: 1.7, fontStyle: 'italic',
              }}>
                {data.conclusao.length > 200 ? data.conclusao.substring(0, 197) + '…' : data.conclusao}
              </div>
            )}
          </DocumentCard>
        )}

        {/* Identificação completa */}
        {data.identificacao && (
          <DocumentCard title="Identificação do Aluno" icon={<User size={14} />}>
            <p style={{ margin: 0, fontSize: fontSize.base, color: colors.dark, lineHeight: 1.8 }}>
              {data.identificacao}
            </p>
          </DocumentCard>
        )}

        {/* ── Gráficos (modo completo) ── */}
        {isComplete && scores.length > 0 && (
          <DocumentCard title="Perfil Multidimensional — Análise Gráfica" icon={<Brain size={14} />} accentColor={colors.purple}>

            {/* Badges de média */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: spacing.xl, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${spacing.md}px ${spacing.lg}px`, borderRadius: radius.lg, background: colors.petrolL }}>
                <Star size={18} color={colors.petrol} />
                <div>
                  <p style={{ margin: 0, fontSize: fontSize['2xs'], fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.gray }}>Média Geral</p>
                  <p style={{ margin: 0, fontSize: fontSize['2xl'], fontWeight: 800, color: colors.petrol, lineHeight: 1 }}>
                    {avg.toFixed(1)}<span style={{ fontSize: fontSize.sm, fontWeight: 400 }}>/5</span>
                  </p>
                </div>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: `${spacing.md}px ${spacing.lg}px`,
                borderRadius: radius.lg, background: `${scoreColor(avg)}15`, border: `1px solid ${scoreColor(avg)}40`,
              }}>
                <TrendingUp size={18} color={scoreColor(avg)} />
                <div>
                  <p style={{ margin: 0, fontSize: fontSize['2xs'], fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.gray }}>Nível</p>
                  <p style={{ margin: 0, fontSize: fontSize.sm, fontWeight: 700, color: scoreColor(avg) }}>{scoreLabel(avg)}</p>
                </div>
              </div>
            </div>

            {/* Radar + Pizza lado a lado */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.xl, marginBottom: spacing.xl }}>
              <DocumentChartBlock title="Mapa Cognitivo (Radar)" accentColor={colors.purple} compact>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <RadarSVG scores={scores} />
                </div>
              </DocumentChartBlock>
              <DocumentChartBlock title="Distribuição de Dificuldades" accentColor={colors.purple} compact>
                <PieChartSVG scores={scores} />
              </DocumentChartBlock>
            </div>

            {/* Barras por área + legenda */}
            <DocumentChartBlock title="Nível de Suporte por Área" accentColor={colors.purple} compact>
              <BarChartSVG scores={scores} />
              <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                {[
                  { color: colors.green,  label: 'Avançado (80–100%)'          },
                  { color: colors.purple, label: 'Em desenvolvimento (60–79%)' },
                  { color: colors.amber,  label: 'Em construção (40–59%)'      },
                  { color: colors.red,    label: 'Suporte intensivo (< 40%)'   },
                ].map(({ color, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: fontSize['2xs'], color: colors.gray }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                    {label}
                  </div>
                ))}
              </div>
            </DocumentChartBlock>

            {/* Score por critério */}
            <div style={{ marginTop: spacing.lg }}>
              <CriteriaScores scores={scores} />
            </div>
          </DocumentCard>
        )}

        {/* Histórico relevante (completo) */}
        {completo?.historicoRelevante && (
          <DocumentCard title="Histórico Relevante" icon={<BookOpen size={14} />} accentColor="#5B6F7A">
            <p style={{ margin: 0, fontSize: fontSize.base, color: colors.dark, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
              {completo.historicoRelevante}
            </p>
          </DocumentCard>
        )}

        {/* Análise / Situação pedagógica */}
        {((completo as any)?.analisePedagogica || simples?.situacaoPedagogicaAtual) && (
          <DocumentCard
            title={isComplete ? 'Análise Pedagógica' : 'Situação Pedagógica Atual'}
            icon={<ClipboardList size={14} />}
          >
            <p style={{ margin: 0, fontSize: fontSize.base, color: colors.dark, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
              {(completo as any)?.analisePedagogica || simples?.situacaoPedagogicaAtual}
            </p>
          </DocumentCard>
        )}

        {/* Situação funcional */}
        {data.situacaoFuncional && (
          <DocumentCard title="Situação Funcional" icon={<User size={14} />} accentColor={colors.petrolM}>
            <p style={{ margin: 0, fontSize: fontSize.base, color: colors.dark, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
              {data.situacaoFuncional}
            </p>
          </DocumentCard>
        )}

        {/* Perfil cognitivo (completo) */}
        {completo?.perfilCognitivo && (
          <DocumentCard title="Perfil Cognitivo e Funcional" icon={<Brain size={14} />} accentColor={colors.purple}>
            <p style={{ margin: 0, fontSize: fontSize.base, color: colors.dark, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
              {completo.perfilCognitivo}
            </p>
          </DocumentCard>
        )}

        {/* Dificuldades + Potencialidades (grade 2 colunas) */}
        {(data.dificuldades?.length > 0 || (completo?.potencialidades?.length ?? 0) > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md, marginBottom: spacing.xl }}>
            {data.dificuldades?.length > 0 && (
              <DocumentCard title="Dificuldades Observadas" icon={<AlertCircle size={14} />} accentColor={colors.red} style={{ marginBottom: 0 }}>
                <DocumentItemList items={data.dificuldades} accentColor={colors.red} />
              </DocumentCard>
            )}
            {completo?.potencialidades && completo.potencialidades.length > 0 && (
              <DocumentCard title="Potencialidades e Habilidades" icon={<Star size={14} />} accentColor={colors.green} style={{ marginBottom: 0 }}>
                <DocumentItemList items={completo.potencialidades} accentColor={colors.green} />
              </DocumentCard>
            )}
          </div>
        )}

        {/* Estratégias eficazes (completo) */}
        {completo?.estrategiasEficazes && completo.estrategiasEficazes.length > 0 && (
          <DocumentCard title="Estratégias com Resultados Positivos" icon={<Lightbulb size={14} />} accentColor={colors.amber}>
            <DocumentItemList items={completo.estrategiasEficazes} accentColor={colors.amber} />
          </DocumentCard>
        )}

        {/* Checklist de áreas (completo) */}
        {completo?.checklist && completo.checklist.length > 0 && (
          <DocumentCard title="Checklist de Áreas de Desenvolvimento" icon={<ClipboardList size={14} />}>
            <p style={{ margin: '0 0 12px', fontSize: fontSize['2xs'], color: colors.gray2 }}>
              ✅ Preservado — sem dificuldade significativa &nbsp;|&nbsp; ⚠️ Presente — dificuldade observada com intensidade indicada
            </p>
            <DocumentChecklist
              items={completo.checklist.map(item => ({ ...item, grau: item.grau ?? undefined }))}
              columns={2}
            />
          </DocumentCard>
        )}

        {/* Evolução observada (completo) */}
        {completo?.evolucaoObservada && (
          <DocumentCard title="Evolução Observada" icon={<TrendingUp size={14} />} accentColor={colors.green}>
            <p style={{ margin: 0, fontSize: fontSize.base, color: colors.dark, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
              {completo.evolucaoObservada}
            </p>
          </DocumentCard>
        )}

        {/* Observações relevantes */}
        {(data as any).observacoesRelevantes && (
          <DocumentCard title="Observações Relevantes" icon={<FileText size={14} />} accentColor={colors.gray}>
            <p style={{ margin: 0, fontSize: fontSize.base, color: colors.dark, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
              {(data as any).observacoesRelevantes}
            </p>
          </DocumentCard>
        )}

        {/* Conclusão e Parecer Técnico — destaque institucional */}
        {data.conclusao && (
          <DocumentHighlight variant="petrol" title="Conclusão e Parecer Técnico" icon={<Shield size={14} />}>
            <p style={{ margin: 0, fontSize: fontSize.base, color: colors.dark, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
              {data.conclusao}
            </p>
          </DocumentHighlight>
        )}

        {/* Recomendações */}
        {isComplete && completo ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
              <HeartHandshake size={16} color={colors.blue} />
              <span style={{ fontSize: fontSize.sm, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.blue }}>
                Recomendações Multidisciplinares
              </span>
            </div>
            <RecommendationBlocks
              pedagogicas={completo.recomendacoesPedagogicas    || []}
              clinicas={completo.recomendacoesClinicas          || []}
              familiares={completo.recomendacoesFamiliares      || []}
              institucionais={completo.recomendacoesInstitucionais}
            />
          </>
        ) : (
          simples?.recomendacoes && simples.recomendacoes.length > 0 && (
            <DocumentCard title="Recomendações" icon={<HeartHandshake size={14} />} accentColor={colors.blue}>
              <DocumentItemList items={simples.recomendacoes} accentColor={colors.blue} />
            </DocumentCard>
          )
        )}

        {/* Assinaturas */}
        <DocumentSignatureBlock
          title="Validação e Assinaturas"
          date={dateStr}
          location={school?.city || student.city}
          signatures={[
            { label: 'Profissional Responsável', name: resultado.geradoPor },
            { label: 'Responsável pelo Aluno' },
            { label: 'Coordenação / Direção' },
          ]}
        />

        {/* Rodapé institucional com QR */}
        <DocumentFooter
          docCode={resultado.codigoDoc}
          emittedBy={resultado.geradoPor}
          date={dateStr}
          schoolName={schoolName}
          showQR
        />

      </div>
    </div>
  );
};