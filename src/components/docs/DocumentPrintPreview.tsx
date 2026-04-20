// DocumentPrintPreview.tsx — Preview premium reutilizável para todos os documentos IncluiAI
// Renderiza HTML visual limpo e institucional; serve de base para print e futura exportação por HTML→PDF.

import React from 'react';
import { Shield, CheckCircle2, ChevronRight, Star, GraduationCap, Brain, Users, Phone, Building2, Award } from 'lucide-react';
import {
  DocumentPage, DocumentHeader, DocumentHero,
  DocumentCard, DocumentStudentBadge, DocumentFooter,
  DocumentSignatureBlock, DocumentHighlight, DocumentItemList,
  DocumentRunningHeader, DocQR,
  colors, fonts, fontSize, spacing, radius, shadows, a4,
  type DocType,
} from './DocComponents';
import type { Student, User } from '../../types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PrintField {
  label: string;
  value: any;
  type?: 'textarea' | 'text' | 'scale' | 'checklist' | 'grid';
  maxScale?: number;
}

export interface PrintSection {
  title: string;
  fields: PrintField[];
}

export interface SchoolMeta {
  schoolName?: string;
  city?: string;
  state?: string;
  contact?: string;
}

export interface DocumentPrintPreviewProps {
  docType: DocType;
  title: string;
  student: Student;
  user: User;
  school?: SchoolMeta | null;
  sections: PrintSection[];
  auditCode?: string;
  date?: string;
}

// ─── Helper: limpa nome do profissional ──────────────────────────────────────

function cleanName(name: string): string {
  return name.replace(/\s*(MASTER|PRO|FREE|PREMIUM|INSTITUTIONAL)\s*/gi, '').trim();
}

// ─── FieldRenderer ────────────────────────────────────────────────────────────

const FieldRenderer: React.FC<{ field: PrintField }> = ({ field }) => {
  const { label, value, type, maxScale = 5 } = field;

  const hasValue =
    value !== undefined && value !== null && value !== '' &&
    !(Array.isArray(value) && value.length === 0);
  if (!hasValue) return null;

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: fontSize.xs,
    fontWeight: 700,
    color: colors.petrol,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: spacing.sm,
    fontFamily: fonts.body,
  };

  const wrapStyle: React.CSSProperties = {
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottom: `1px solid ${colors.border}`,
  };

  // ── Escala / avaliação ─────────────────────────────────────────────────────
  if (type === 'scale') {
    const rating = typeof value === 'object' ? (value?.rating ?? 0) : Number(value) || 0;
    const obs    = typeof value === 'object' ? (value?.observation ?? value?.text ?? '') : '';
    const pct    = (rating / maxScale) * 100;
    const barColor =
      rating >= maxScale * 0.8 ? colors.petrol :
      rating >= maxScale * 0.6 ? colors.gold   : colors.red;

    return (
      <div style={wrapStyle}>
        <span style={labelStyle}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, marginBottom: obs ? spacing.sm : 0 }}>
          {/* Barra de progresso */}
          <div style={{ flex: 1, height: 8, background: `${colors.petrol}15`, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
          {/* Estrelas */}
          <div style={{ display: 'flex', gap: 2 }}>
            {Array.from({ length: maxScale }, (_, i) => (
              <Star
                key={i}
                size={13}
                fill={i < rating ? colors.gold : 'none'}
                stroke={i < rating ? colors.gold : colors.gray2}
              />
            ))}
          </div>
          <span style={{ fontSize: fontSize.sm, fontWeight: 800, color: barColor, minWidth: 36, textAlign: 'right' }}>
            {rating}/{maxScale}
          </span>
        </div>
        {obs && (
          <p style={{ margin: 0, fontSize: fontSize.sm, color: colors.gray, lineHeight: 1.6, fontStyle: 'italic' }}>
            {obs}
          </p>
        )}
      </div>
    );
  }

  // ── Checklist ──────────────────────────────────────────────────────────────
  if (type === 'checklist' && Array.isArray(value)) {
    return (
      <div style={wrapStyle}>
        <span style={labelStyle}>{label}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm }}>
          {value.map((v: string, i: number) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: fontSize.xs, fontWeight: 600,
              padding: '4px 10px', borderRadius: radius.full,
              background: `${colors.petrol}10`, color: colors.petrol,
              border: `1px solid ${colors.petrol}22`,
              fontFamily: fonts.body,
            }}>
              <CheckCircle2 size={10} color={colors.petrol} /> {v}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // ── Grid / tabela ──────────────────────────────────────────────────────────
  if (type === 'grid' && Array.isArray(value)) {
    const rows = value as Record<string, string>[];
    const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
    return (
      <div style={wrapStyle}>
        <span style={labelStyle}>{label}</span>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize.sm }}>
            <thead>
              <tr>
                {cols.map(c => (
                  <th key={c} style={{
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    background: colors.petrol, color: 'white',
                    fontWeight: 700, textAlign: 'left', fontSize: fontSize.xs,
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? colors.surface : colors.bg }}>
                  {cols.map(c => (
                    <td key={c} style={{
                      padding: `${spacing.sm}px ${spacing.md}px`,
                      borderBottom: `1px solid ${colors.border}`,
                      color: colors.dark,
                    }}>{row[c]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Texto livre (textarea / text) ──────────────────────────────────────────
  const str = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '—');
  const isRec = /recomenda|orienta|sug[eê]st|interven/i.test(label);

  if (isRec) {
    return (
      <div style={wrapStyle}>
        <span style={labelStyle}>{label}</span>
        <DocumentHighlight variant="gold">
          <DocumentItemList
            items={str.split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)}
            accentColor={colors.gold}
          />
        </DocumentHighlight>
      </div>
    );
  }

  // Detecta se é lista (itens separados por \n com bullet)
  const lines = str.split('\n').map(l => l.trim()).filter(Boolean);
  const isList = lines.length > 1 && lines.every(l => /^[-•*\d]/.test(l));

  return (
    <div style={wrapStyle}>
      <span style={labelStyle}>{label}</span>
      {isList ? (
        <DocumentItemList
          items={lines.map(l => l.replace(/^[-•*]\s*|\d+\.\s*/, ''))}
          accentColor={colors.petrol}
        />
      ) : (
        <p style={{
          margin: 0, fontSize: fontSize.base, color: colors.dark,
          lineHeight: 1.75, whiteSpace: 'pre-wrap', fontFamily: fonts.body,
        }}>
          {str}
        </p>
      )}
    </div>
  );
};

// ─── SectionCard interno ──────────────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; fields: PrintField[]; accentColor: string }> = ({
  title, fields, accentColor,
}) => {
  const visibleFields = fields.filter(f =>
    f.value !== undefined && f.value !== null && f.value !== '' &&
    !(Array.isArray(f.value) && f.value.length === 0)
  );
  if (visibleFields.length === 0) return null;

  return (
    <div style={{
      borderRadius: radius.xl, overflow: 'hidden',
      border: `1px solid ${colors.border}`,
      boxShadow: shadows.card,
      marginBottom: spacing.xl,
      pageBreakInside: 'avoid',
    }}>
      {/* Cabeçalho da seção */}
      <div style={{
        padding: `${spacing.md}px ${spacing.xl}px`,
        background: accentColor,
        display: 'flex', alignItems: 'center', gap: spacing.md,
      }}>
        <div style={{ width: 3, height: 16, background: 'rgba(255,255,255,0.6)', borderRadius: 2, flexShrink: 0 }} />
        <span style={{
          fontFamily: fonts.body, fontWeight: 700,
          fontSize: fontSize.sm, color: 'white',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          {title}
        </span>
      </div>
      {/* Corpo */}
      <div style={{ background: colors.surface, padding: `${spacing.xl}px ${spacing.xl}px ${spacing.sm}px` }}>
        {visibleFields.map((f, i) => <FieldRenderer key={i} field={f} />)}
      </div>
    </div>
  );
};

// ─── DocumentPrintPreview (componente principal) ──────────────────────────────

export const DocumentPrintPreview: React.FC<DocumentPrintPreviewProps> = ({
  docType, title, student, user, school, sections, auditCode, date,
}) => {
  const dateStr  = date || new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const userName = cleanName(user.name);
  const cityState = school?.city
    ? `${school.city}${school.state ? ', ' + school.state : ''}`
    : undefined;

  const accentColors: Record<DocType, string> = {
    relatorio:  colors.petrol,
    pei:        colors.blue,
    paee:       colors.green,
    pdi:        colors.purple,
    estudoCaso: colors.gold,
    ficha:      colors.petrol,
    atividade:  '#E85D04',
    protocolo:  colors.navy,
  };
  const accent = accentColors[docType] ?? colors.petrol;

  return (
    <DocumentPage id="document-print-preview">
      <style>{`
        @media print {
          #document-print-preview { margin: 0 !important; box-shadow: none !important; }
          #document-print-preview * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Cabeçalho principal */}
      <DocumentHeader
        docType={docType}
        docCode={auditCode}
        schoolName={school?.schoolName}
        cityState={cityState}
        date={dateStr}
        emittedBy={userName}
      />

      {/* Título do documento */}
      <DocumentHero
        title={title}
        docType={docType}
        subtitle={school?.schoolName}
      />

      {/* Conteúdo */}
      <div style={{ padding: `${spacing.xl}px ${spacing['3xl']}px` }}>

        {/* Identificação do aluno */}
        <DocumentStudentBadge
          student={{
            name:         student.name,
            birthDate:    student.birthDate,
            grade:        student.grade,
            shift:        student.shift,
            diagnosis:    (student.diagnosis ?? []).join(', ') || undefined,
            supportLevel: (student as any).supportLevel,
            schoolName:   school?.schoolName,
            guardianName: student.guardianName,
            guardianPhone: student.guardianPhone,
            city:         school?.city,
            state:        school?.state,
          }}
          accentColor={accent}
        />

        {/* Seções do documento */}
        {sections.map((sec, i) => (
          <SectionCard
            key={i}
            title={sec.title}
            fields={sec.fields}
            accentColor={accent}
          />
        ))}

        {/* Assinaturas */}
        <DocumentSignatureBlock
          title="Validação e Assinaturas"
          date={dateStr}
          location={school?.city}
          signatures={[
            { label: 'Profissional Responsável', name: userName, role: (user as any).role },
            { label: 'Responsável pelo Aluno' },
            { label: 'Coordenação / Direção' },
          ]}
        />

        {/* Rodapé com QR */}
        <DocumentFooter
          docCode={auditCode}
          emittedBy={userName}
          date={dateStr}
          schoolName={school?.schoolName}
          showQR
        />
      </div>
    </DocumentPage>
  );
};

export default DocumentPrintPreview;
