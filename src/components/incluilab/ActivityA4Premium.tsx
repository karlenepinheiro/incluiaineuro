import React from 'react';
import {
  BookOpen,
  CheckSquare,
  HelpCircle,
  Layers,
  ListChecks,
  Palette,
  PenLine,
  Sparkles,
  Table2,
} from 'lucide-react';
import {
  IncluiLabActivityContent,
  IncluiLabQuestion,
  IncluiLabSection,
  normalizeIncluiLabActivity,
} from '../../utils/incluilabActivity';

export type ActivityVisualStyle = 'fundamental' | 'infantil' | 'pb';

interface ActivityA4PremiumProps {
  contentJson: unknown;
  studentName?: string;
  date?: string;
  printId?: string;
  visualStyle?: ActivityVisualStyle;
}

// Theme tokens use the same key names as the original static C object
// so all sub-component code is unchanged
type ThemeC = {
  ink: string; muted: string;
  petrol: string; petrolSoft: string;
  gold: string; goldSoft: string;
  green: string; greenSoft: string;
  roseSoft: string; border: string;
  table: string; paper: string;
};

const THEMES: Record<ActivityVisualStyle, ThemeC> = {
  fundamental: {
    ink: '#1F2937', muted: '#667085',
    petrol: '#1F4E5F', petrolSoft: '#EAF4F7',
    gold: '#C69214', goldSoft: '#FFF7E0',
    green: '#15803D', greenSoft: '#ECFDF3',
    roseSoft: '#FFF1F2', border: '#D9E1E5',
    table: '#F8FAFC', paper: '#FFFFFF',
  },
  infantil: {
    ink: '#1C1B1F', muted: '#6D6875',
    petrol: '#E76F51', petrolSoft: '#FFF0EB',
    gold: '#2A9D8F', goldSoft: '#E8FAF8',
    green: '#2A9D8F', greenSoft: '#E8FAF8',
    roseSoft: '#FFE8F5', border: '#F0DCDA',
    table: '#FFF5F0', paper: '#FFFEF5',
  },
  pb: {
    ink: '#0A0A0A', muted: '#555555',
    petrol: '#222222', petrolSoft: '#F0F0F0',
    gold: '#444444', goldSoft: '#F5F5F5',
    green: '#333333', greenSoft: '#EEEEEE',
    roseSoft: '#F5F5F5', border: '#CCCCCC',
    table: '#F0F0F0', paper: '#FFFFFF',
  },
};

type ThemeCFull = ThemeC & { fontFamily: string };

const THEME_FONTS: Record<ActivityVisualStyle, string> = {
  fundamental: "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif",
  infantil: "'Nunito', 'Comic Sans MS', 'Segoe UI', Arial, sans-serif",
  pb: "'Segoe UI', Arial, sans-serif",
};

// Mutable module-level theme tokens — updated at the start of each render
// Sub-components read from C directly (no prop drilling needed)
const C: ThemeCFull = { ...THEMES.fundamental, fontFamily: THEME_FONTS.fundamental };

function textLines(text?: string): string[] {
  return String(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function shortText(text: unknown, max = 220): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const clipped = clean.slice(0, max).trim();
  const cut = clipped.lastIndexOf(' ');
  return `${(cut > max * 0.65 ? clipped.slice(0, cut) : clipped).trim()}...`;
}

function SectionHeading({ section }: { section: IncluiLabSection }) {
  const iconMap: Record<string, React.ReactNode> = {
    text: <BookOpen size={14} />,
    info_box: <Sparkles size={14} />,
    vocabulary: <Layers size={14} />,
    questions: <HelpCircle size={14} />,
    match: <ListChecks size={14} />,
    fill_blank: <PenLine size={14} />,
    coloring: <Palette size={14} />,
    table: <Table2 size={14} />,
    steps: <CheckSquare size={14} />,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{
        width: 28,
        height: 28,
        borderRadius: 9,
        background: C.petrolSoft,
        color: C.petrol,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {iconMap[section.type] ?? <BookOpen size={14} />}
      </span>
      <h2 style={{
        margin: 0,
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: C.petrol,
        fontWeight: 900,
      }}>
        {section.title || labelForSection(section.type)}
      </h2>
    </div>
  );
}

function labelForSection(type: string): string {
  const labels: Record<string, string> = {
    text: 'Texto',
    info_box: 'Informacao',
    vocabulary: 'Vocabulario',
    questions: 'Questoes',
    match: 'Ligue as colunas',
    fill_blank: 'Complete',
    coloring: 'Colorir',
    table: 'Tabela',
    steps: 'Passo a passo',
  };
  return labels[type] ?? 'Atividade';
}

function AnswerLines({ count = 3 }: { count?: number }) {
  const safeCount = Math.max(0, Math.min(count, 7));
  if (!safeCount) return null;
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      {Array.from({ length: safeCount }).map((_, index) => (
        <div key={index} style={{ height: 24, borderBottom: `1.5px solid ${C.petrol}55` }} />
      ))}
    </div>
  );
}

function Options({ options = [] }: { options?: string[] }) {
  if (!options.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: options.length > 2 ? '1fr 1fr' : '1fr', gap: 8, marginTop: 10 }}>
      {options.slice(0, 6).map((option, index) => (
        <div key={`${option}-${index}`} style={{
          display: 'grid',
          gridTemplateColumns: '26px 1fr',
          gap: 8,
          alignItems: 'center',
          minHeight: 34,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: '6px 8px',
          background: '#fff',
        }}>
          <span style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: `1.5px solid ${C.petrol}`,
            color: C.petrol,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 900,
          }}>
            {String.fromCharCode(65 + index)}
          </span>
          <span style={{ fontSize: 13, lineHeight: 1.35, fontWeight: 650 }}>
            {shortText(option.replace(/^[A-D]\)\s*/, ''), 82)}
          </span>
        </div>
      ))}
    </div>
  );
}

function QuestionCard({ question, index }: { question: IncluiLabQuestion; index: number }) {
  const isChoice = question.kind === 'multiple_choice' || !!question.options?.length;
  const isColoring = question.kind === 'coloring' || question.kind === 'drawing';

  return (
    <section className="incluilab-avoid-break" style={{
      border: `1px solid ${C.border}`,
      borderLeft: `4px solid ${C.petrol}`,
      borderRadius: 10,
      padding: '12px 14px 14px',
      background: '#fff',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: C.petrol,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 900,
          flexShrink: 0,
        }}>
          {index + 1}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '2px 0 0', fontSize: 15, lineHeight: 1.45, fontWeight: 760 }}>
            {shortText(question.statement, 260)}
          </p>
          {isChoice ? <Options options={question.options} /> : <AnswerLines count={question.answerLines || 3} />}
          {isColoring && (
            <div style={{
              marginTop: 12,
              height: 110,
              border: `1.5px dashed ${C.border}`,
              borderRadius: 10,
              background: '#fff',
            }} />
          )}
        </div>
      </div>
    </section>
  );
}

function renderTextSection(section: IncluiLabSection) {
  const lines = textLines(section.content);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {lines.length ? lines.map((line, index) => (
        <p key={index} style={{ margin: 0, fontSize: 14, lineHeight: 1.55, fontWeight: 620 }}>
          {shortText(line, 260)}
        </p>
      )) : (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, fontWeight: 620 }}>
          {shortText(section.items?.map(String).join(' '), 320)}
        </p>
      )}
    </div>
  );
}

function renderListItems(items: IncluiLabSection['items']) {
  const safeItems = (items || []).map(item => typeof item === 'string' ? item : shortText((item as any).statement ?? (item as any).content ?? '', 160)).filter(Boolean);
  if (!safeItems.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: safeItems.length > 3 ? '1fr 1fr' : '1fr', gap: 8 }}>
      {safeItems.slice(0, 10).map((item, index) => (
        <div key={`${item}-${index}`} style={{
          border: `1px solid ${C.border}`,
          borderRadius: 9,
          padding: '8px 10px',
          background: '#fff',
          fontSize: 13,
          lineHeight: 1.4,
          fontWeight: 650,
        }}>
          {shortText(item, 90)}
        </div>
      ))}
    </div>
  );
}

function renderMatch(section: IncluiLabSection) {
  const pairs = section.pairs?.length
    ? section.pairs
    : (section.items || []).map((item: any) => ({ left: asItemText(item, 'left'), right: asItemText(item, 'right') })).filter(pair => pair.left || pair.right);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {pairs.slice(0, 6).map((pair, index) => (
        <div key={index} style={{
          display: 'grid',
          gridTemplateColumns: '1fr 70px 1fr',
          gap: 10,
          alignItems: 'center',
          fontSize: 13,
          fontWeight: 700,
        }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', background: '#fff' }}>
            {shortText(pair.left || `Item ${index + 1}`, 58)}
          </div>
          <div style={{ height: 1, borderTop: `2px dashed ${C.border}` }} />
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', background: '#fff' }}>
            {shortText(pair.right || 'Resposta', 58)}
          </div>
        </div>
      ))}
    </div>
  );
}

function asItemText(item: unknown, key?: string): string {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  const rec = item as Record<string, unknown>;
  return shortText(key ? rec[key] : rec.statement ?? rec.content ?? rec.title, 120);
}

function renderFillBlank(section: IncluiLabSection) {
  const items = (section.items || []).map(item => asItemText(item)).filter(Boolean);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {(items.length ? items : textLines(section.content)).slice(0, 7).map((item, index) => (
        <div key={index} style={{ fontSize: 14, lineHeight: 1.6, fontWeight: 650 }}>
          {index + 1}. {shortText(item, 150)} <span style={{ display: 'inline-block', width: 140, borderBottom: `1.5px solid ${C.petrol}70`, transform: 'translateY(-2px)' }} />
        </div>
      ))}
    </div>
  );
}

function renderSteps(section: IncluiLabSection) {
  const steps = section.steps?.length ? section.steps : (section.items || []).map(item => asItemText(item)).filter(Boolean);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {steps.slice(0, 8).map((step, index) => (
        <div key={index} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 9, alignItems: 'start' }}>
          <span style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            background: C.gold,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 900,
          }}>
            {index + 1}
          </span>
          <span style={{ fontSize: 14, lineHeight: 1.45, fontWeight: 700 }}>{shortText(step, 150)}</span>
        </div>
      ))}
    </div>
  );
}

function renderTable(section: IncluiLabSection) {
  const columns = section.columns?.length ? section.columns : ['Item', 'Resposta'];
  const rows = section.rows?.length ? section.rows : [['', ''], ['', ''], ['', '']];
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, overflow: 'hidden', borderRadius: 8 }}>
      <thead>
        <tr>
          {columns.map(column => (
            <th key={column} style={{ border: `1px solid ${C.border}`, background: C.petrolSoft, color: C.petrol, padding: '8px 10px', textAlign: 'left' }}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 8).map((row, rowIndex) => (
          <tr key={rowIndex}>
            {columns.map((column, columnIndex) => {
              const value = Array.isArray(row) ? row[columnIndex] : (row as Record<string, unknown>)[column];
              return (
                <td key={`${rowIndex}-${column}`} style={{ border: `1px solid ${C.border}`, padding: '10px', height: 30, background: '#fff' }}>
                  {shortText(value, 80)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SectionCard({ section }: { section: IncluiLabSection }) {
  const tone = section.type === 'info_box'
    ? C.goldSoft
    : section.type === 'vocabulary'
      ? C.greenSoft
      : section.type === 'coloring'
        ? C.roseSoft
        : '#FFFFFF';

  return (
    <section className="incluilab-avoid-break" style={{
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: 14,
      background: tone,
    }}>
      <SectionHeading section={section} />
      {section.type === 'questions' && (
        <div style={{ display: 'grid', gap: 10 }}>
          {(section.items || []).map((item, index) => (
            <QuestionCard key={index} question={normalizeQuestionItem(item, index)} index={index} />
          ))}
        </div>
      )}
      {(section.type === 'text' || section.type === 'info_box') && renderTextSection(section)}
      {section.type === 'vocabulary' && renderListItems(section.items)}
      {section.type === 'match' && renderMatch(section)}
      {section.type === 'fill_blank' && renderFillBlank(section)}
      {section.type === 'steps' && renderSteps(section)}
      {section.type === 'table' && renderTable(section)}
      {section.type === 'coloring' && (
        <div>
          {renderTextSection(section)}
          <div style={{ marginTop: 12, height: 145, border: `1.5px dashed ${C.border}`, borderRadius: 12, background: '#fff' }} />
        </div>
      )}
    </section>
  );
}

function normalizeQuestionItem(item: unknown, index: number): IncluiLabQuestion {
  if (typeof item === 'string') return { number: index + 1, kind: 'short_answer', statement: item, answerLines: 3 };
  const rec = item as IncluiLabQuestion | undefined;
  return {
    number: index + 1,
    kind: rec?.kind || 'short_answer',
    statement: rec?.statement || `Questao ${index + 1}`,
    options: rec?.options || [],
    answerLines: rec?.answerLines ?? 3,
  };
}

export const ActivityA4Premium: React.FC<ActivityA4PremiumProps> = ({
  contentJson,
  studentName,
  date,
  printId = 'incluilab-a4-premium',
  visualStyle = 'fundamental',
}) => {
  // Apply theme tokens before any sub-component renders
  const resolvedTheme = THEMES[visualStyle] ?? THEMES.fundamental;
  Object.assign(C, resolvedTheme, { fontFamily: THEME_FONTS[visualStyle] ?? THEME_FONTS.fundamental });

  const activity: IncluiLabActivityContent = normalizeIncluiLabActivity(contentJson);
  const today = date || new Date().toLocaleDateString('pt-BR');
  const fields = activity.studentFields.length ? activity.studentFields : ['Nome', 'Turma', 'Data'];

  const pageStyle: React.CSSProperties = {
    width: 794,
    minHeight: 1123,
    background: C.paper,
    color: C.ink,
    boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
    borderRadius: 12,
    transformOrigin: 'top center',
    overflow: 'hidden',
    fontFamily: C.fontFamily,
  };

  return (
    <div id={printId} data-incluilab-pdf-page="true" style={pageStyle}>
      <header style={{ padding: '34px 44px 22px', borderBottom: `3px solid ${C.petrol}`, background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: fields.length > 2 ? '2fr 1fr 1fr' : '1fr 1fr', gap: 14, marginBottom: 24 }}>
          {fields.slice(0, 4).map((field) => {
            const normalized = field.toLowerCase();
            const value = normalized.includes('nome') ? studentName || '' : normalized.includes('data') ? today : normalized.includes('turma') ? activity.grade : '';
            return (
              <div key={field}>
                <div style={{ fontSize: 10, fontWeight: 900, color: C.petrol, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  {field}
                </div>
                <div style={{ minHeight: 26, borderBottom: `2px solid ${C.petrol}`, fontSize: 13, fontWeight: 750, paddingBottom: 4 }}>
                  {value}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            {(activity.subject || activity.grade) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {activity.subject && <Chip>{activity.subject}</Chip>}
                {activity.grade && <Chip>{activity.grade}</Chip>}
              </div>
            )}
            <h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.05, fontWeight: 950, color: C.ink }}>
              {shortText(activity.title, 66)}
            </h1>
            {activity.subtitle && (
              <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.4, color: C.muted, fontWeight: 650 }}>
                {shortText(activity.subtitle, 120)}
              </p>
            )}
          </div>
          <div aria-hidden style={{
            width: 78,
            height: 78,
            borderRadius: 22,
            background: `linear-gradient(135deg, ${C.petrolSoft}, ${C.goldSoft})`,
            border: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: C.petrol,
          }}>
            <Sparkles size={34} />
          </div>
        </div>
      </header>

      <main style={{ padding: '20px 44px 30px', display: 'grid', gap: 12 }}>
        {activity.introText && (
          <section className="incluilab-avoid-break" style={{
            display: 'grid',
            gridTemplateColumns: '28px 1fr',
            gap: 10,
            alignItems: 'start',
            padding: '12px 14px',
            borderRadius: 12,
            background: C.petrolSoft,
            border: `1px solid ${C.petrol}22`,
            color: C.petrol,
          }}>
            <BookOpen size={17} style={{ marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, fontWeight: 800 }}>
              {shortText(activity.introText, 220)}
            </p>
          </section>
        )}

        {activity.sections.map((section, index) => (
          <SectionCard key={`${section.type}-${section.title}-${index}`} section={section} />
        ))}
      </main>

      <footer style={{
        margin: '0 44px 30px',
        paddingTop: 10,
        borderTop: `1px solid ${C.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: C.muted,
        fontSize: 10,
        fontWeight: 700,
      }}>
        <span>Atividade pronta para impressao em A4.</span>
        <span style={{ color: C.petrol, fontWeight: 900 }}>IncluiLAB</span>
      </footer>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          #${printId} {
            width: 210mm !important;
            min-height: 297mm !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
        }
        .incluilab-avoid-break {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      `}</style>
    </div>
  );
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 24,
      padding: '4px 10px',
      borderRadius: 999,
      background: C.goldSoft,
      border: `1px solid ${C.gold}33`,
      color: '#7C5800',
      fontSize: 10,
      fontWeight: 900,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    }}>
      {children}
    </span>
  );
}

export default ActivityA4Premium;
