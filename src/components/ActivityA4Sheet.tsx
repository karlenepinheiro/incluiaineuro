// ActivityA4Sheet.tsx — Atividade Adaptada • IncluiAI Design System
import React from 'react';
import { Printer, Target, BookOpen, PenLine, MessageSquare } from 'lucide-react';
import { AtividadeJSON } from '../types';
import {
  DocumentPage, DocumentCard, DocumentHighlight, DocumentSignatureBlock,
  DocumentFooter, DocLogo,
} from './docs/DocComponents';
import { colors, fonts, fontSize, spacing, radius, shadows } from './docs/DocTokens';

interface ActivityA4SheetProps {
  atividade: AtividadeJSON;
  studentName?: string;
  teacherName?: string;
  discipline?: string;
  grade?: string;
  date?: string;
  onPrint?: () => void;
}

export const ActivityA4Sheet: React.FC<ActivityA4SheetProps> = ({
  atividade, studentName, teacherName, grade, date, onPrint,
}) => {
  const today = date || new Date().toLocaleDateString('pt-BR');

  return (
    <div>
      {onPrint && (
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onPrint}
            style={{
              background: colors.petrol, color: '#fff', border: 'none',
              borderRadius: radius.lg, padding: '8px 20px', fontWeight: 700,
              fontSize: fontSize.base, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: spacing.sm,
              fontFamily: fonts.body,
            }}
          >
            <Printer size={14} /> Imprimir / Salvar PDF
          </button>
        </div>
      )}

      <DocumentPage id="atividade-a4">

        {/* ── Cabeçalho ── */}
        <div style={{
          background: `linear-gradient(135deg, ${colors.petrol} 0%, ${colors.navy} 100%)`,
          padding: `${spacing.xl}px ${spacing['3xl']}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: spacing.lg,
        }}>
          <DocLogo size="md" inverted />
          <div style={{ textAlign: 'right', fontSize: fontSize.sm, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7 }}>
            {studentName && <div><strong style={{ color: 'white' }}>Aluno(a):</strong> {studentName}</div>}
            {grade       && <div><strong style={{ color: 'white' }}>Turma:</strong> {grade}</div>}
            {teacherName && <div><strong style={{ color: 'white' }}>Professor(a):</strong> {teacherName}</div>}
            <div><strong style={{ color: 'white' }}>Data:</strong> {today}</div>
          </div>
        </div>

        {/* ── Corpo ── */}
        <div style={{ padding: `${spacing.xl}px ${spacing['3xl']}px`, display: 'flex', flexDirection: 'column', gap: spacing.lg }}>

          {/* Hero: título da atividade */}
          <div style={{
            borderRadius: radius.xl, border: `2px solid ${colors.petrol}20`,
            background: colors.petrolXL, padding: `${spacing.lg}px ${spacing.xl}px`,
            boxShadow: shadows.sm,
          }}>
            <p style={{ margin: 0, fontSize: fontSize.xs, color: colors.petrol, textTransform: 'uppercase',
              letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
              Atividade Adaptada
            </p>
            <h1 style={{ margin: 0, fontSize: fontSize['3xl'], fontWeight: 800, color: colors.dark,
              lineHeight: 1.15, letterSpacing: '-0.4px', fontFamily: fonts.body }}>
              {atividade.titulo}
            </h1>
            {atividade.subtitulo && (
              <p style={{ margin: `${spacing.sm}px 0 0`, fontSize: fontSize.md, color: colors.gray, lineHeight: 1.5 }}>
                {atividade.subtitulo}
              </p>
            )}
            <div style={{ marginTop: spacing.md, height: 3, width: 36, borderRadius: radius.full, background: colors.orange }} />
          </div>

          {/* Grid: Objetivo + Instrução */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: spacing.md }}>
            <DocumentCard
              title="Objetivo de Aprendizagem"
              icon={<Target size={13} color="white" />}
              accentColor={colors.petrol}
              style={{ marginBottom: 0 }}
            >
              <p style={{ margin: 0, fontSize: fontSize.base, color: colors.dark, lineHeight: 1.65 }}>
                {atividade.objetivo}
              </p>
            </DocumentCard>

            <DocumentCard
              title="Instrução"
              icon={<BookOpen size={13} color="white" />}
              accentColor={colors.green}
              style={{ marginBottom: 0 }}
            >
              <p style={{ margin: 0, fontSize: fontSize.base, color: colors.dark, lineHeight: 1.65 }}>
                {atividade.instrucao}
              </p>
            </DocumentCard>
          </div>

          {/* Questões / Atividades */}
          <DocumentCard
            title="Atividades"
            icon={<PenLine size={13} color="white" />}
            accentColor={colors.petrolM}
            noPadding
          >
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '1px', background: colors.border,
            }}>
              {atividade.questoes.map((q, i) => (
                <div key={i} style={{
                  background: colors.surface, padding: `${spacing.md}px ${spacing.lg}px`,
                  minHeight: 52, display: 'flex', alignItems: 'center', gap: spacing.sm,
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: radius.full, flexShrink: 0,
                    background: colors.petrolL, color: colors.petrol,
                    fontWeight: 800, fontSize: fontSize.xs,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{i + 1}</span>
                  <span style={{ fontSize: fontSize.md, fontWeight: 500, color: colors.dark, lineHeight: 1.5 }}>{q}</span>
                </div>
              ))}
            </div>
          </DocumentCard>

          {/* Espaço para respostas */}
          <div style={{
            borderRadius: radius.xl, border: `1px solid ${colors.border}`,
            background: colors.surface, padding: `${spacing.md}px ${spacing.xl}px`,
            boxShadow: shadows.sm,
          }}>
            <p style={{ margin: `0 0 ${spacing.md}px`, fontSize: fontSize.xs, fontWeight: 700,
              color: colors.petrol, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Espaço para respostas extras
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ height: 28, borderBottom: `1.5px solid ${colors.border}` }} />
              ))}
            </div>
          </div>

          {/* Observação para o professor */}
          <DocumentHighlight variant="petrol" icon={<MessageSquare size={14} />} title="Observação para o Professor">
            <p style={{ margin: 0, fontSize: fontSize.base, color: colors.dark, lineHeight: 1.65 }}>
              {atividade.observacao_professor || 'Oferecer apoio e mediação conforme necessário. Adapte o tempo e o suporte de acordo com as necessidades do aluno.'}
            </p>
          </DocumentHighlight>

          {/* Assinaturas */}
          <DocumentSignatureBlock
            signatures={[
              { label: 'Professor(a)', role: 'Educador Responsável' },
              { label: 'Responsável', role: 'Assinatura do Responsável' },
            ]}
          />

          {/* Rodapé */}
          <DocumentFooter
            emittedBy={teacherName}
            date={today}
            showQR={false}
          />

        </div>
      </DocumentPage>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #atividade-a4, #atividade-a4 * { visibility: visible; }
          #atividade-a4 {
            position: fixed !important;
            left: 0 !important; top: 0 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
        }
      `}</style>
    </div>
  );
};
