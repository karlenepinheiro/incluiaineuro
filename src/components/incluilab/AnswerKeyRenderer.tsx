/**
 * AnswerKeyRenderer.tsx — Sprint 2B.3 (item 3)
 *
 * Renderer PRÓPRIO do Gabarito — projeção independente do ActivityPackage,
 * separada do Guia do Professor (ver canonicalActivityPipeline.ts,
 * buildTeacherGuideMarkdown, que não anexa mais o gabarito).
 *
 * Deliberadamente NÃO usa ReactMarkdown/remark-gfm: evita o risco de uma
 * tabela GFM ou token longo sem quebra forçar overflow horizontal para fora
 * da página A4 (causa raiz identificada na Auditoria 2B.2-C). Layout simples,
 * largura fixa e `overflowWrap`/`wordBreak` em cada célula de texto.
 */
import React from 'react';
import { CheckCircle } from 'lucide-react';
import type { ActivityAnswerKeyItem, ActivitySchema } from '../../types';

const C = {
  petrol: '#1F4E5F',
  border: '#D0D8DC',
  text: '#20263A',
  muted: '#667085',
  softGreen: '#F4FBF7',
  green: '#16A34A',
};

interface AnswerKeyRendererProps {
  activity: ActivitySchema;
  answerKey: ActivityAnswerKeyItem[];
  printId?: string;
}

export const AnswerKeyRenderer: React.FC<AnswerKeyRendererProps> = ({
  activity,
  answerKey,
  printId = 'incluilab-gabarito',
}) => {
  const byId = new Map(activity.exercises.map(ex => [ex.id, ex]));

  return (
    <div
      id={printId}
      data-incluilab-pdf-page="true"
      style={{
        width: 794,
        minHeight: 1123,
        maxWidth: 794,
        boxSizing: 'border-box',
        background: '#fff',
        borderRadius: 12,
        padding: '40px 44px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        fontFamily: "'Segoe UI', Arial, sans-serif",
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
        overflowX: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28,
        paddingBottom: 18, borderBottom: `2px solid ${C.border}`,
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 11, background: C.softGreen,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <CheckCircle size={20} color={C.green} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            IncluiLAB · Uso exclusivo do professor
          </p>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text, overflowWrap: 'break-word' }}>
            Gabarito — {activity.header.title || 'Atividade'}
          </h2>
        </div>
      </div>

      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {answerKey.map((item, index) => {
          const exercise = byId.get(item.exerciseId);
          return (
            <li
              key={item.exerciseId || index}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: '12px 16px',
                overflowWrap: 'break-word',
                wordBreak: 'break-word',
                maxWidth: '100%',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: C.petrol, marginBottom: 4, overflowWrap: 'break-word' }}>
                {index + 1}. {exercise?.title || `Exercício ${item.exerciseId}`}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: C.text, overflowWrap: 'break-word' }}>
                <strong>Resposta:</strong> {item.answer}
              </div>
              {item.explanation && (
                <div style={{ fontSize: 12, lineHeight: 1.5, color: C.muted, marginTop: 4, overflowWrap: 'break-word' }}>
                  {item.explanation}
                </div>
              )}
            </li>
          );
        })}
      </ol>

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
          }
        }
      `}</style>
    </div>
  );
};
