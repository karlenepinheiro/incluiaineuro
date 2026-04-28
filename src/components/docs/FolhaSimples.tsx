// FolhaSimples.tsx — Template premium para atividades adaptadas • IncluiAI
// Pipeline: generateContent() → <FolhaSimples> → exportToPDF()

import React from 'react';
import { Shield, BookOpen, Target, MessageSquare, Printer } from 'lucide-react';
import type { AtividadeJSON } from '../../types';
import { colors, fonts, fontSize, spacing, radius, shadows } from './DocTokens';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface FolhaSimplesProps {
  atividade: AtividadeJSON;
  studentName?: string;
  teacherName?: string;
  schoolName?: string;
  grade?: string;
  date?: string;
}

// ─── exportToPDF ─────────────────────────────────────────────────────────────
// Isola o elemento pelo ID e dispara o diálogo de impressão do navegador.
// Funciona offline, sem dependências externas, gera PDF via "Salvar como PDF".

export function exportToPDF(): void {
  const el = document.getElementById('folha-simples-print');
  if (!el) return;

  const clone = el.cloneNode(true) as HTMLElement;
  const win = window.open('', '_blank', 'width=900,height=1200');
  if (!win) return;

  win.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>Atividade Adaptada — IncluiAI</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          background: white;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @page { size: A4; margin: 0; }
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>${clone.outerHTML}</body>
    </html>
  `);
  win.document.close();

  win.onload = () => {
    win.focus();
    win.print();
    // fecha janela após print dialog (comportamento do SO)
    win.addEventListener('afterprint', () => win.close());
  };
}

// ─── Subcomponentes internos ──────────────────────────────────────────────────

const SHEET_ID = 'folha-simples-print';

const DisciplinaPill: React.FC<{ label: string }> = ({ label }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center',
    background: `${colors.orange}15`,
    color: colors.orange,
    border: `1px solid ${colors.orange}30`,
    borderRadius: radius.full,
    fontSize: fontSize.xs,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '3px 10px',
    fontFamily: fonts.body,
  }}>
    {label}
  </span>
);

const SectionLabel: React.FC<{ icon: React.ReactNode; title: string; color: string }> = ({ icon, title, color }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6,
    marginBottom: spacing.sm,
  }}>
    <div style={{
      width: 20, height: 20, borderRadius: radius.sm,
      background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {icon}
    </div>
    <span style={{
      fontSize: fontSize.xs, fontWeight: 700, color,
      textTransform: 'uppercase', letterSpacing: '0.07em',
      fontFamily: fonts.body,
    }}>
      {title}
    </span>
  </div>
);

const AnswerLines: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} style={{
        borderBottom: `1.5px solid ${colors.border}`,
        height: 24,
      }} />
    ))}
  </div>
);

const Divider: React.FC = () => (
  <div style={{ borderTop: `1px solid ${colors.border}`, margin: `${spacing.lg}px 0` }} />
);

// ─── FolhaSimples ─────────────────────────────────────────────────────────────

export const FolhaSimples: React.FC<FolhaSimplesProps> = ({
  atividade,
  studentName,
  teacherName,
  schoolName,
  grade,
  date,
}) => {
  const today = date ?? new Date().toLocaleDateString('pt-BR');
  const disciplinaLabel = atividade.disciplina
    ? String(atividade.disciplina).replace(/_/g, ' ')
    : 'Atividade Adaptada';

  return (
    <div>
      {/* Botão de ação — oculto no print */}
      <div className="no-print" style={{
        marginBottom: 16,
        display: 'flex', justifyContent: 'flex-end', gap: 10,
      }}>
        <button
          onClick={exportToPDF}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: colors.petrol, color: 'white',
            border: 'none', borderRadius: radius.lg,
            padding: '9px 20px', fontWeight: 700,
            fontSize: fontSize.base, cursor: 'pointer',
            fontFamily: fonts.body,
            boxShadow: shadows.md,
          }}
        >
          <Printer size={14} /> Salvar como PDF
        </button>
      </div>

      {/* ── Folha A4 ── */}
      <div
        id={SHEET_ID}
        style={{
          width: '210mm',
          minHeight: '297mm',
          background: colors.surface,
          fontFamily: fonts.body,
          margin: '0 auto',
          boxShadow: '0 10px 28px rgba(32,38,58,0.10)',
          borderRadius: radius.md,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >

        {/* ── Cabeçalho ── */}
        <div style={{
          background: colors.surface,
          padding: `${spacing.lg}px ${spacing['3xl']}px ${spacing.md}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: spacing.lg,
          flexShrink: 0,
          borderBottom: `1px solid ${colors.border}`,
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: radius.md,
              background: colors.petrolL,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Shield size={18} color={colors.petrol} />
            </div>
            <div>
              <div style={{ fontSize: fontSize.md, fontWeight: 800, color: colors.dark, lineHeight: 1.1 }}>
                Inclui<span style={{ color: colors.gold }}>AI</span>
              </div>
              <div style={{ fontSize: fontSize.xs, color: colors.gray2, marginTop: 1 }}>
                Educação Inclusiva
              </div>
            </div>
          </div>

          {/* Metadados direita */}
          <div style={{
            textAlign: 'right',
            fontSize: fontSize.sm,
            color: colors.gray2,
            lineHeight: 1.8,
          }}>
            {schoolName && (
              <div style={{ fontWeight: 600, color: colors.dark }}>{schoolName}</div>
            )}
            {teacherName && (
              <div>Prof.: <strong style={{ color: colors.dark }}>{teacherName}</strong></div>
            )}
            <div>Data: <strong style={{ color: colors.dark }}>{today}</strong></div>
          </div>
        </div>

        {/* ── Corpo ── */}
        <div style={{
          padding: `${spacing.xl}px ${spacing['3xl']}px`,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.lg,
        }}>

          {/* Título do documento */}
          <div style={{
            borderRadius: 0,
            border: 'none',
            background: colors.surface,
            padding: `0 0 ${spacing.sm}px`,
            borderBottom: `1px solid ${colors.border}`,
          }}>
            <DisciplinaPill label={disciplinaLabel} />
            <h1 style={{
              margin: `${spacing.sm}px 0 0`,
              fontSize: fontSize['3xl'],
              fontWeight: 800,
              color: colors.dark,
              lineHeight: 1.15,
              letterSpacing: 0,
            }}>
              {atividade.titulo}
            </h1>
            {atividade.subtitulo && (
              <p style={{
                margin: `${spacing.xs}px 0 0`,
                fontSize: fontSize.base,
                color: colors.gray,
                lineHeight: 1.5,
              }}>
                {atividade.subtitulo}
              </p>
            )}
            {false && atividade.nivel_dificuldade && (
              <div style={{ marginTop: spacing.sm }}>
                <span style={{
                  fontSize: fontSize['2xs'],
                  fontWeight: 700,
                  color: colors.petrol,
                  background: colors.petrolL,
                  border: `1px solid ${colors.petrol}25`,
                  borderRadius: radius.full,
                  padding: '2px 8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  Nível: {atividade.nivel_dificuldade}
                </span>
              </div>
            )}
          </div>

          {/* Objetivo + Instrução em duas colunas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: spacing.md }}>
            <div style={{
              display: 'none',
              borderRadius: radius.lg,
              border: `1px solid ${colors.petrol}20`,
              background: colors.petrolXL,
              padding: `${spacing.md}px ${spacing.lg}px`,
            }}>
              <SectionLabel
                icon={<Target size={11} color="white" />}
                title="Objetivo"
                color={colors.petrol}
              />
              <p style={{
                margin: 0,
                fontSize: fontSize.base,
                color: colors.dark,
                lineHeight: 1.65,
              }}>
                {atividade.objetivo}
              </p>
            </div>

            <div style={{
              borderRadius: radius.md,
              border: `1px solid ${colors.border}`,
              background: colors.surface,
              padding: `${spacing.sm}px ${spacing.lg}px`,
            }}>
              <SectionLabel
                icon={<BookOpen size={11} color="white" />}
                title="Instrução"
                color={colors.green}
              />
              <p style={{
                margin: 0,
                fontSize: fontSize.base,
                color: colors.dark,
                lineHeight: 1.65,
              }}>
                {atividade.instrucao}
              </p>
            </div>
          </div>

          {/* Linha de identificação do aluno */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr',
            gap: spacing.md,
            borderRadius: radius.lg,
            border: `1px solid ${colors.border}`,
            background: colors.surface,
            padding: `${spacing.sm}px ${spacing.lg}px`,
          }}>
            {[
              { label: 'Nome do(a) Aluno(a)', value: studentName },
              { label: 'Turma / Série',       value: grade },
              { label: 'Data',                value: today },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{
                  fontSize: fontSize['2xs'],
                  fontWeight: 700,
                  color: colors.gray2,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 4,
                }}>
                  {label}
                </div>
                <div style={{
                  fontSize: fontSize.base,
                  color: value ? colors.dark : colors.border,
                  fontWeight: value ? 600 : 400,
                  borderBottom: `1.5px solid ${colors.border}`,
                  paddingBottom: 4,
                  minWidth: 80,
                }}>
                  {value ?? ''}
                </div>
              </div>
            ))}
          </div>

          {/* Questões */}
          <div>
            <div style={{
              fontSize: fontSize.xs,
              fontWeight: 700,
              color: colors.petrol,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: spacing.md,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <div style={{ width: 3, height: 14, background: colors.orange, borderRadius: 2 }} />
              Atividades ({Math.min(atividade.questoes.length, 5)} {Math.min(atividade.questoes.length, 5) === 1 ? 'questão' : 'questões'})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              {atividade.questoes.slice(0, 5).map((q, i) => (
                <div key={i} style={{
                  borderRadius: radius.md,
                  border: `1px solid ${colors.border}`,
                  background: colors.surface,
                  padding: `${spacing.md}px ${spacing.lg}px`,
                  pageBreakInside: 'avoid',
                }}>
                  {/* Número + enunciado */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.sm }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: radius.full, flexShrink: 0,
                      border: `1.5px solid ${colors.petrol}`,
                      background: colors.surface, color: colors.petrol,
                      fontWeight: 800, fontSize: fontSize.xs,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginTop: 1,
                    }}>
                      {i + 1}
                    </div>
                    <p style={{
                      margin: 0,
                      fontSize: fontSize.md,
                      fontWeight: 500,
                      color: colors.dark,
                      lineHeight: 1.55,
                      flex: 1,
                    }}>
                      {q}
                    </p>
                  </div>

                  {/* Linhas de resposta */}
                  <AnswerLines count={4} />
                </div>
              ))}
            </div>
          </div>

          {false && <Divider />}

          {/* Bloco interno separado */}
          {false && atividade.observacao_professor && (
            <div style={{
              borderRadius: radius.lg,
              border: `1px solid ${colors.gold}35`,
              background: colors.goldL,
              padding: `${spacing.md}px ${spacing.lg}px`,
            }}>
              <SectionLabel
                icon={<MessageSquare size={11} color="white" />}
                title="Apoio separado"
                color={colors.gold}
              />
              <p style={{
                margin: 0,
                fontSize: fontSize.base,
                color: colors.dark,
                lineHeight: 1.65,
                fontStyle: 'italic',
              }}>
                {atividade.observacao_professor}
              </p>
            </div>
          )}

          {/* Assinaturas */}
          <div style={{
            display: 'none',
            gridTemplateColumns: '1fr 1fr',
            gap: spacing['3xl'],
            marginTop: spacing.sm,
          }}>
            {['Professor(a) Responsável', 'Responsável pelo Aluno'].map(label => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{
                  borderTop: `1.5px solid ${colors.border}`,
                  paddingTop: spacing.sm,
                  fontSize: fontSize.xs,
                  color: colors.gray2,
                  letterSpacing: '0.04em',
                }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Rodapé */}
          <div style={{
            marginTop: 'auto',
            paddingTop: spacing.lg,
            borderTop: `1px solid ${colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: fontSize['2xs'],
            color: colors.gray2,
          }}>
            <span>
              IncluiAI — Educação Inclusiva de Alta Qualidade
            </span>
            <span>
              Gerado em {today}
              {teacherName ? ` · ${teacherName}` : ''}
            </span>
          </div>

        </div>
      </div>

      {/* CSS de impressão */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body * { visibility: hidden; }
          #${SHEET_ID}, #${SHEET_ID} * { visibility: visible; }
          #${SHEET_ID} {
            position: fixed !important;
            left: 0 !important; top: 0 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
};
