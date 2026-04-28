import React from 'react';
import {
  Accessibility,
  BookOpen,
  CheckCircle,
  Clock,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  ListChecks,
  Package,
  Sparkles,
  Target,
} from 'lucide-react';
import type {
  ActivityBlock,
  ActivityExercise,
  ActivitySchema,
  ActivityVisualAsset,
  GuiaPedagogico,
} from '../../types';
import { findPictogramByText } from '../../data/incluilab/pictogramLibrary';

interface A4ActivityRendererProps {
  activity: ActivitySchema;
  studentName?: string;
  date?: string;
  printId?: string;
  activeView?: 'folha' | 'guia';
}

const C = {
  petrol: '#1F4E5F',
  navy: '#2E5F72',
  gold: '#B88912',
  orange: '#D97706',
  green: '#16A34A',
  blue: '#2563EB',
  bg: '#FFFFFF',
  paper: '#FFFFFF',
  surface: '#FFFFFF',
  border: '#D0D8DC',
  text: '#20263A',
  muted: '#667085',
  softBlue: '#F3F8FA',
  softGold: '#FFFBEB',
  softGreen: '#F4FBF7',
  softOrange: '#FFF7ED',
  softLilac: '#F8F7FF',
  softRose: '#FFF7F8',
  softMint: '#F2FBF8',
  // worksheet accent — único acento colorido das questões
  accent: '#1F4E5F',
  accentLight: '#E8F2F6',
};

// Mantido para uso no Guia Pedagógico
const CARD_PALETTE = [
  C.softBlue,
  C.softGold,
  C.softGreen,
  C.softOrange,
  C.softLilac,
  C.softRose,
  C.softMint,
];

const pageStyle: React.CSSProperties = {
  width: '210mm',
  minHeight: '297mm',
  boxSizing: 'border-box',
  margin: '0 auto',
  background: C.paper,
  color: C.text,
  fontFamily: "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif",
  boxShadow: '0 10px 28px rgba(32,38,58,0.10)',
  borderRadius: 8,
  overflow: 'visible',
};

const contentStyle: React.CSSProperties = {
  padding: '0 13mm 8mm',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const lineClamp = (lines: number): React.CSSProperties => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
});

function shortText(text: string | undefined, max = 118): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const sentence = clean.match(/^.{20,}?[.!?](\s|$)/)?.[0]?.trim();
  if (sentence && sentence.length <= max) return sentence;
  const clipped = clean.slice(0, max).trim();
  const lastSpace = clipped.lastIndexOf(' ');
  return (lastSpace > max * 0.65 ? clipped.slice(0, lastSpace) : clipped).trim();
}

function labelForExercise(type: ActivityExercise['type']): string {
  const labels: Record<ActivityExercise['type'], string> = {
    multiple_choice: 'Marque a resposta',
    short_answer: 'Escreva a resposta',
    fill_blank: 'Complete',
    matching: 'Ligue as colunas',
    drawing: 'Desenhe',
    ordering: 'Coloque em ordem',
  };
  return labels[type] ?? 'Responda';
}

function hashIndex(text: string, max: number): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) & 0xffff;
  return h % max;
}

function cleanImagePlaceholders(text: string): { clean: string; subjects: string[] } {
  const pattern = /\[IMAGEM\s*(?:DO|DA|DE|DOS|DAS|DUM|DUMA)?\s*([^\]]+)\]/gi;
  const subjects: string[] = [];
  const clean = text
    .replace(pattern, (_m, subject: string) => { subjects.push(subject.trim()); return ''; })
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { clean, subjects };
}

// ── Emoji visual card ────────────────────────────────────────────────────────

function EmojiCard({
  emoji,
  label,
  size = 'medium',
  paletteKey = '',
}: {
  emoji: string;
  label?: string;
  size?: 'small' | 'medium' | 'large';
  paletteKey?: string;
}) {
  const emojiPx = size === 'large' ? 72 : size === 'medium' ? 48 : 36;
  const bg = CARD_PALETTE[hashIndex(paletteKey || emoji, CARD_PALETTE.length)];
  const minH = size === 'large' ? 160 : size === 'medium' ? 118 : 84;
  return (
    <div style={{
      borderRadius: 16,
      background: bg,
      border: `2px solid ${C.surface}`,
      boxShadow: 'inset 0 0 0 1px rgba(31,78,95,0.06)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: size === 'large' ? '18px 10px' : '12px 8px',
      gap: 6,
      minHeight: minH,
      width: '100%',
    }}>
      <span style={{ fontSize: emojiPx, lineHeight: 1.1, display: 'block' }}>{emoji}</span>
      {label && (
        <span style={{ fontSize: 10, fontWeight: 850, color: C.muted, textAlign: 'center', ...lineClamp(1) }}>
          {label}
        </span>
      )}
    </div>
  );
}

// ── Visual frame (image | emoji | legacy SVG) ────────────────────────────────

function VisualFrame({
  asset,
  fallbackText,
  large = false,
}: {
  asset?: ActivityVisualAsset;
  fallbackText: string;
  large?: boolean;
}) {
  if (!asset) return null;
  const boxSize = large ? 88 : 58;

  if (asset?.url) {
    return (
      <div style={{
        width: boxSize,
        height: boxSize,
        borderRadius: 8,
        background: C.surface,
        border: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 5,
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <img
          src={asset.url}
          alt={asset.altText || asset.title}
          style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6 }}
        />
      </div>
    );
  }

  const lookupText = [asset?.title, asset?.description, fallbackText].filter(Boolean).join(' ');
  // Usa fallbackEmoji do JSON se presente; caso contrário tenta pictogramLibrary
  const fallbackEmoji = asset?.fallbackEmoji;
  const pic = fallbackEmoji ? null : findPictogramByText(lookupText);
  const emoji = fallbackEmoji ?? pic?.fallbackEmoji ?? '🖼️';

  if (!emoji) return null;

  return (
    <div style={{
      width: boxSize,
      height: boxSize,
      borderRadius: 8,
      border: `1px solid ${C.border}`,
      background: C.surface,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: large ? 42 : 28, lineHeight: 1 }}>{emoji}</span>
    </div>
  );
}

// ── Section title ────────────────────────────────────────────────────────────

function SectionTitle({ icon, title, color = C.petrol }: { icon: React.ReactNode; title: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{
        width: 26, height: 26, borderRadius: 9,
        background: `${color}18`, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <h2 style={{
        margin: 0, fontSize: 11, fontWeight: 900, color,
        textTransform: 'uppercase', letterSpacing: '0.07em',
      }}>
        {title}
      </h2>
    </div>
  );
}

// ── Intro card ───────────────────────────────────────────────────────────────

function IntroCard({
  title, icon, children, tone = C.softBlue, color = C.petrol,
}: {
  title: string; icon: React.ReactNode; children: React.ReactNode;
  tone?: string; color?: string;
}) {
  return (
    <section className="incluilab-avoid-break" style={{
      background: tone, border: `1px solid ${color}25`, borderRadius: 14, padding: 12,
    }}>
      <SectionTitle icon={icon} title={title} color={color} />
      {children}
    </section>
  );
}

// ── Instruction steps ────────────────────────────────────────────────────────

function InstructionSteps({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.slice(0, 3).map((item, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 8, alignItems: 'center' }}>
          <span style={{
            width: 26, height: 26, borderRadius: 999,
            background: C.gold, color: '#fff',
            fontSize: 12, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {i + 1}
          </span>
          <span style={{ fontSize: 13, lineHeight: 1.35, fontWeight: 700, color: C.text }}>
            {shortText(item, 72)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Multiple choice grid ─────────────────────────────────────────────────────

function OptionGrid({ options }: { options: string[] }) {
  const visible = options.slice(0, 4);
  const cols = visible.length > 2 ? '1fr 1fr' : '1fr';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 7, marginTop: 8 }}>
      {visible.map((option, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '26px 1fr', gap: 8,
          alignItems: 'center', minHeight: 36, padding: '6px 8px',
          border: `1px solid ${C.border}`, borderRadius: 6, background: '#fff',
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: 4,
            background: C.petrol, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 900, flexShrink: 0,
          }}>
            {String.fromCharCode(65 + i)}
          </div>
          <span style={{ fontSize: 13, lineHeight: 1.35, fontWeight: 600, color: C.text }}>
            {shortText(option, 62)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Answer area (per exercise type) ─────────────────────────────────────────

function AnswerArea({ exercise }: { exercise: ActivityExercise }) {
  if (exercise.type === 'multiple_choice') {
    return null; // options shown by OptionGrid above
  }

  if (exercise.type === 'drawing') {
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{
          height: 88,
          border: `1.5px dashed ${C.border}`,
          borderRadius: 6,
          background: '#fff',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: 6,
        }}>
          <span style={{
            fontSize: 9, color: C.muted, fontWeight: 700,
            background: '#fff', padding: '2px 8px',
          }}>
            Desenhe aqui
          </span>
        </div>
      </div>
    );
  }

  if (exercise.type === 'matching') {
    const items = (exercise.options.length ? exercise.options : ['Item 1', 'Item 2', 'Item 3']).slice(0, 4);
    return (
      <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '24px 1fr 70px', gap: 8,
            alignItems: 'center', minHeight: 34,
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.petrol }}>{i + 1}.</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.35, color: C.text }}>
              {shortText(item, 58)}
            </span>
            <span style={{ height: 24, borderBottom: `1.5px solid ${C.border}` }} />
          </div>
        ))}
      </div>
    );
  }

  if (exercise.type === 'ordering') {
    const items = (exercise.options.length ? exercise.options : ['Primeiro', 'Depois', 'Por fim']).slice(0, 4);
    return (
      <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 8, alignItems: 'center' }}>
            <span style={{
              width: 26, height: 26, borderRadius: 4,
              border: `1.5px solid ${C.border}`, background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: C.muted, fontWeight: 700,
            }}>__</span>
            <span style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', fontSize: 12.5, lineHeight: 1.35 }}>
              {shortText(item, 68)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // short_answer | fill_blank
  const lines = Math.min(Math.max(exercise.answerLines, 2), 4);
  return (
    <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{
          height: 28,
          borderBottom: `1.5px solid ${C.petrol}50`,
        }} />
      ))}
    </div>
  );
}

// ── Support hint ─────────────────────────────────────────────────────────────

function SupportHint({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div style={{
      marginTop: 10, display: 'flex', gap: 7, alignItems: 'flex-start',
      padding: '8px 10px', borderRadius: 12, background: C.softGreen,
      color: '#166534', fontSize: 11, lineHeight: 1.35, fontWeight: 700,
    }}>
      <Lightbulb size={13} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={lineClamp(2)}>{shortText(text, 96)}</span>
    </div>
  );
}

// ── Worksheet block (exercise + visual) ──────────────────────────────────────

function WorksheetBlock({
  exercise,
  block,
  asset,
  index,
}: {
  exercise: ActivityExercise;
  block?: ActivityBlock;
  asset?: ActivityVisualAsset;
  index: number;
}) {
  const { clean: cleanPrompt, subjects } = cleanImagePlaceholders(exercise.prompt);
  const derivedText = subjects.length > 0
    ? subjects.join(' ')
    : `${block?.title ?? ''} ${exercise.title ?? ''} ${cleanPrompt}`;

  const title = exercise.title || `Questao ${index + 1}`;

  return (
    <section
      className="incluilab-worksheet-block incluilab-avoid-break"
      style={{
        border: `1px solid ${C.border}`,
        borderLeft: `3.5px solid ${C.petrol}`,
        borderRadius: 6,
        background: '#FFFFFF',
        padding: '9px 12px 11px',
      }}
    >
      {/* Número preenchido + label do tipo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 7,
      }}>
        <span style={{
          width: 24, height: 24, borderRadius: 999,
          background: C.petrol, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 900, flexShrink: 0,
          letterSpacing: '-0.02em',
        }}>{index + 1}</span>
        <span style={{
          fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.05em', color: C.petrol,
        }}>
          {labelForExercise(exercise.type)}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: asset ? '1fr 68px' : '1fr', gap: 10, alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: '0 0 6px', fontSize: 14, lineHeight: 1.4, fontWeight: 700, color: C.text }}>
            {shortText(cleanPrompt || title, 200)}
          </p>
          {exercise.type === 'multiple_choice' && exercise.options.length > 0 && (
            <OptionGrid options={exercise.options} />
          )}
          <AnswerArea exercise={exercise} />
        </div>
        {asset && <VisualFrame asset={asset} fallbackText={derivedText} />}
      </div>
    </section>
  );
}

// ── Accessibility strip ───────────────────────────────────────────────────────

function AccessibilityStrip({ activity }: { activity: ActivitySchema }) {
  const notes = [
    ...activity.accessibilityNotes.supports,
    ...activity.accessibilityNotes.adaptations,
  ].filter(Boolean).slice(0, 4);

  if (!notes.length) return null;

  return (
    <section className="incluilab-avoid-break" style={{
      display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10,
      alignItems: 'start', padding: 12, borderRadius: 16,
      background: C.softGreen, border: `1px solid ${C.green}30`,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 12,
        background: C.green, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Accessibility size={17} />
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {notes.map((note, i) => (
          <span key={i} style={{
            padding: '6px 10px', borderRadius: 999,
            background: '#fff', border: `1px solid ${C.green}25`,
            color: '#166534', fontSize: 11, fontWeight: 850,
          }}>
            {shortText(note, 50)}
          </span>
        ))}
      </div>
    </section>
  );
}

// ── Guia Pedagógico ───────────────────────────────────────────────────────────

function GuideSection({
  icon, title, items, tone = C.softBlue, color = C.petrol,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  tone?: string;
  color?: string;
}) {
  if (!items.length) return null;
  return (
    <section style={{
      background: tone, border: `1px solid ${color}22`, borderRadius: 14, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 8,
          background: `${color}18`, color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {icon}
        </div>
        <h3 style={{ margin: 0, fontSize: 10, fontWeight: 900, color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {title}
        </h3>
      </div>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.slice(0, 6).map((item, i) => (
          <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
              background: color, color: '#fff', fontSize: 9, fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{i + 1}</span>
            <span style={{ fontSize: 12, lineHeight: 1.45, color: '#20263A', fontWeight: 600 }}>
              {shortText(item, 140)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const PedagogicalGuide: React.FC<{ guide: GuiaPedagogico; activityTitle: string; printId: string }> = ({
  guide, activityTitle, printId,
}) => {
  return (
    <div id={printId} style={{ ...pageStyle }}>
      {/* Header institucional */}
      <header style={{
        background: `linear-gradient(135deg, ${C.petrol} 0%, #1a3f50 100%)`,
        color: '#fff',
        padding: '10mm 13mm 8mm',
        borderRadius: '12px 12px 0 0',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <GraduationCap size={22} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 9, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 850 }}>
                IncluiLAB · Documento do Professor
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 900 }}>Guia Pedagógico</p>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, opacity: 0.8, lineHeight: 1.7 }}>
            <div>{new Date().toLocaleDateString('pt-BR')}</div>
          </div>
        </div>
        <div style={{
          marginTop: 12, paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.15)',
        }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, lineHeight: 1.1 }}>
            {shortText(activityTitle, 72)}
          </h1>
        </div>
      </header>

      {/* Corpo */}
      <main style={{ ...contentStyle, gap: 10 }}>
        {/* Objetivo + Tempo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'stretch' }}>
          <section style={{
            background: C.softBlue, border: `1px solid ${C.petrol}22`, borderRadius: 14, padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 8, background: `${C.petrol}18`, color: C.petrol, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Target size={13} />
              </div>
              <h3 style={{ margin: 0, fontSize: 10, fontWeight: 900, color: C.petrol, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Objetivo da Aula</h3>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, fontWeight: 750, color: '#20263A', ...lineClamp(3) }}>
              {guide.objetivo_da_aula}
            </p>
          </section>
          {guide.tempo_estimado && (
            <section style={{
              background: C.softGold, border: `1px solid ${C.gold}30`, borderRadius: 14, padding: '12px 14px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 90,
            }}>
              <Clock size={20} color={C.gold} />
              <p style={{ margin: 0, fontSize: 10, fontWeight: 900, color: C.gold, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Tempo</p>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 900, color: '#20263A', textAlign: 'center' }}>
                {shortText(guide.tempo_estimado, 20)}
              </p>
            </section>
          )}
        </div>

        {/* Metodologia */}
        <section style={{
          background: C.softGreen, border: `1px solid ${C.green}25`, borderRadius: 14, padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <div style={{ width: 24, height: 24, borderRadius: 8, background: `${C.green}18`, color: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={13} />
            </div>
            <h3 style={{ margin: 0, fontSize: 10, fontWeight: 900, color: C.green, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Metodologia Adaptada</h3>
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, fontWeight: 650, color: '#20263A' }}>
            {shortText(guide.metodologia_adaptada, 280)}
          </p>
        </section>

        {/* Grid: dicas + critérios */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <GuideSection
            icon={<Lightbulb size={12} />}
            title="Dicas de Mediação"
            items={guide.dicas_de_mediacao}
            tone={C.softGold}
            color="#92700A"
          />
          <GuideSection
            icon={<CheckCircle size={12} />}
            title="Critérios de Avaliação"
            items={guide.criterios_de_avaliacao}
            tone={C.softGreen}
            color={C.green}
          />
        </div>

        {/* Grid: materiais + adaptações */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <GuideSection
            icon={<Package size={12} />}
            title="Materiais Necessários"
            items={guide.materiais_necessarios}
            tone={C.softLilac}
            color="#6D28D9"
          />
          <GuideSection
            icon={<Accessibility size={12} />}
            title="Adaptações Inclusivas"
            items={guide.adaptacoes_inclusivas}
            tone={C.softMint}
            color="#047857"
          />
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        margin: '0 13mm 10mm',
        paddingTop: 8,
        borderTop: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        color: C.muted, fontSize: 9,
      }}>
        <span>Guia Pedagógico — uso exclusivo do professor. Não distribuir ao aluno.</span>
        <span style={{ fontWeight: 900, color: C.petrol }}>IncluiLAB</span>
      </footer>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body * { visibility: hidden !important; }
          #${printId}, #${printId} * { visibility: visible !important; }
          #${printId} {
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: ${C.paper} !important;
          }
        }
      `}</style>
    </div>
  );
};

// ── Asset / block finders ─────────────────────────────────────────────────────

function findAssetForExercise(activity: ActivitySchema, exercise: ActivityExercise, index: number): ActivityVisualAsset | undefined {
  if (exercise.visualAssetId) {
    const direct = activity.visualAssets.find(a => a.id === exercise.visualAssetId);
    if (direct) return direct;
  }
  const linked = activity.blocks.find(b => b.visualAssetIds.some(id => id === exercise.visualAssetId));
  if (linked?.visualAssetIds[0]) {
    const a = activity.visualAssets.find(a => a.id === linked.visualAssetIds[0]);
    if (a) return a;
  }
  return undefined;
}

function findBlockForExercise(activity: ActivitySchema, exercise: ActivityExercise, index: number): ActivityBlock | undefined {
  if (exercise.visualAssetId) {
    const b = activity.blocks.find(b => b.visualAssetIds.includes(exercise.visualAssetId as string));
    if (b) return b;
  }
  return activity.blocks[index];
}

// ── Pedagogical validator + size control ──────────────────────────────────────

const VISUAL_TRIGGER_RE = [
  /\bobserv[ae]\b.{0,25}(lado|imagem|figura)/i,
  /\bveja\s+ao\s+lado\b/i,
  /\bcont[ae]\s+os\s+objetos\b/i,
  /\bolh[ae]\s+(a\s+)?(imagem|figura)\b/i,
];

function needsVisualAsset(text: string): boolean {
  return VISUAL_TRIGGER_RE.some(p => p.test(text));
}

const EMOJI_MAP: Array<[RegExp, string]> = [
  [/animal|bicho|cachorro|gato|pássaro/i, '🐾'],
  [/fruta|alimento|comida|maçã|banana/i, '🍎'],
  [/numer|contar|quantidad/i, '🔢'],
  [/forma|geomé|círculo|quadrado/i, '🔷'],
  [/letra|palavra|leitura/i, '📝'],
  [/natur|planta|flor|árvore/i, '🌸'],
  [/corpo|humano|person|criança/i, '🧍'],
  [/cor|pintar|desenh/i, '🎨'],
];

function deriveEmoji(text: string): string {
  for (const [re, emoji] of EMOJI_MAP) if (re.test(text)) return emoji;
  return '⭐';
}

function repairActivity(activity: ActivitySchema): ActivitySchema {
  // 1. Student worksheet must stay compact and printable.
  let exercises = activity.exercises.slice(0, 5).map(ex => ({
    ...ex,
    answerLines: Math.min(Math.max(ex.answerLines || 3, 2), ex.type === 'drawing' ? 1 : 4),
  }));
  const assets = activity.visualAssets.map(a => ({ ...a }));

  // 2. Fix exercises with visual triggers but no visual asset
  exercises = exercises.map((ex, idx) => {
    const combined = `${ex.title ?? ''} ${ex.prompt ?? ''}`;
    const hasAsset = ex.visualAssetId
      ? assets.some(a => a.id === ex.visualAssetId && (a.url || a.fallbackEmoji))
      : false;

    if (needsVisualAsset(combined) && !hasAsset) {
      const cleaned = ex.prompt
        .replace(/\bveja\s+ao\s+lado\b/gi, '')
        .replace(/\bobserve\s+(a\s+)?(imagem|figura)(\s+ao\s+lado)?\b/gi, 'Observe')
        .replace(/\bimagem\s+ao\s+lado\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      const autoId = `auto-visual-${idx}`;
      assets.push({
        id: autoId, type: 'placeholder',
        title: ex.title || 'Visual',
        description: combined,
        altText: ex.title,
        fallbackEmoji: deriveEmoji(combined),
      });
      return { ...ex, prompt: cleaned, visualAssetId: autoId };
    }

    // Ensure fallbackEmoji when no url
    if (ex.visualAssetId) {
      const ai = assets.findIndex(a => a.id === ex.visualAssetId);
      if (ai >= 0 && !assets[ai].url && !assets[ai].fallbackEmoji) {
        assets[ai] = { ...assets[ai], fallbackEmoji: deriveEmoji(combined) };
      }
    }
    return ex;
  });

  // 3. Deduplicate material blocks; limit items per block to 4
  const seenMat = new Set<string>();
  const blocks = activity.blocks
    .filter(b => {
      if (b.type !== 'materials') return true;
      const key = [...b.items].sort().join('|');
      if (seenMat.has(key)) return false;
      seenMat.add(key);
      return true;
    })
    .map(b => ({ ...b, items: b.items.slice(0, 4) }));

  return { ...activity, exercises, blocks, visualAssets: assets };
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export const A4ActivityRenderer: React.FC<A4ActivityRendererProps> = ({
  activity: activityProp,
  studentName,
  date,
  printId = 'incluilab-a4-renderer',
  activeView = 'folha',
}) => {
  const today = date || new Date().toLocaleDateString('pt-BR');

  // Renderiza guia do professor quando solicitado
  if (activeView === 'guia' && activityProp.guia_pedagogico) {
    return (
      <PedagogicalGuide
        guide={activityProp.guia_pedagogico}
        activityTitle={activityProp.header.title}
        printId={`${printId}-guia`}
      />
    );
  }

  // Aplica validação pedagógica + controle de tamanho antes de renderizar
  const activity = repairActivity(activityProp);
  const { header } = activity;
  const steps = header.instructions.length
    ? header.instructions
    : ['Leia com calma.', 'Resolva uma etapa por vez.', 'Peça ajuda quando precisar.'];

  return (
    <div id={printId} style={pageStyle}>
      {/* ── Header ── */}
      <header style={{
        background: C.surface,
        color: C.text,
        padding: '8mm 13mm 5mm',
        borderRadius: '8px 8px 0 0',
        borderBottom: `2px solid ${C.petrol}`,
      }}>
        {/* Cabeçalho Nome / Data / Turma */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr',
          gap: 12,
          alignItems: 'end',
        }}>
          {[
            ['Nome', studentName || ''],
            ['Data', today],
            ['Turma', header.level || ''],
          ].map(([label, value]) => (
            <div key={label} style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 8.5, fontWeight: 900, color: C.petrol,
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3,
              }}>
                {label}:
              </div>
              <div style={{
                minHeight: 24,
                borderBottom: `2px solid ${C.petrol}`,
                fontSize: 13,
                fontWeight: value ? 700 : 400,
                paddingBottom: 3,
                color: C.text,
              }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Divisor */}
        <div style={{ height: 1, background: C.border, margin: '10px 0' }} />

        {/* Título principal + visual */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: activity.visualAssets[0] ? '1fr 84px' : '1fr',
          gap: 14, alignItems: 'center',
        }}>
          <div>
            {header.theme && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: C.muted, marginBottom: 5,
              }}>
                <BookOpen size={9} /> {shortText(header.theme, 56)}
              </div>
            )}
            <h1 style={{
              margin: 0, fontSize: 36, fontWeight: 900, lineHeight: 1.05,
              color: C.text, letterSpacing: '-0.01em',
            }}>
              {shortText(header.title, 60)}
            </h1>
          </div>
          <VisualFrame asset={activity.visualAssets[0]} fallbackText={`${header.title} ${header.theme}`} large />
        </div>
      </header>

      {/* ── Body ── */}
      <main style={contentStyle}>
        <div style={{
          marginTop: 8,
          padding: '8px 12px',
          background: C.accentLight,
          border: `1px solid ${C.petrol}30`,
          borderLeft: `4px solid ${C.petrol}`,
          borderRadius: 6,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 13, lineHeight: 1.4, fontWeight: 700, color: C.petrol,
        }}>
          <span style={{ fontSize: 15, flexShrink: 0 }}>📌</span>
          {shortText(steps[0] || 'Leia com atencao e responda as questoes.', 140)}
        </div>

        {/* Exercises */}
        <section style={{ display: 'grid', gap: 8 }}>
          {activity.exercises.map((exercise, index) => (
            <WorksheetBlock
              key={exercise.id}
              exercise={exercise}
              index={index}
              asset={findAssetForExercise(activity, exercise, index)}
              block={findBlockForExercise(activity, exercise, index)}
            />
          ))}
        </section>

      </main>

      {/* ── Footer ── */}
      <footer style={{
        margin: '0 13mm 10mm',
        paddingTop: 8,
        borderTop: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        color: C.muted, fontSize: 10,
      }}>
        <span>{shortText(activity.footer?.note || 'Atividade gerada pelo IncluiLAB.', 90)}</span>
        <span style={{ fontWeight: 900, color: C.petrol }}>{activity.footer?.generatedBy || 'IncluiLAB'}</span>
      </footer>

      {/* ── Print styles ── */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body * { visibility: hidden !important; }
          #${printId}, #${printId} * { visibility: visible !important; }
          #${printId} {
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: ${C.paper} !important;
          }
          .incluilab-avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .incluilab-print-break {
            break-after: page;
            page-break-after: always;
          }
          .incluilab-print-break:last-child {
            break-after: auto;
            page-break-after: auto;
          }
        }
      `}</style>
    </div>
  );
};

export default A4ActivityRenderer;
