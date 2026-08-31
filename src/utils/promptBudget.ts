/**
 * promptBudget.ts — Orçamento determinístico de tamanho de prompt.
 *
 * Motivação (auditoria 30/08/2026 — M-08): `buildPromptBlock` injeta todo o
 * histórico do aluno. Somado ao esqueleto JSON, o prompt pode ultrapassar o
 * limite de 32.000 caracteres do Gateway → erro 400 e nenhum documento gerado.
 *
 * Estratégia: o bloco de CONTEXTO é recortado em SEÇÕES (marcadores `=== ... ===`,
 * `--- ... ---`, `═══`). Quando o contexto excede o orçamento, seções são
 * removidas INTEIRAS a partir do fim (as últimas em `buildPromptBlock` são as de
 * menor prioridade: histórico de atividades, estratégias, planos antigos,
 * perfil anterior, linha do tempo). Nunca corta no meio de uma seção nem de
 * uma estrutura JSON.
 *
 * MANTER EM SINCRONIA com supabase/functions/ai-gateway/_promptBudget.ts
 * (a Edge Function não pode importar de src/).
 *
 * Log: só métricas — nº de caracteres, nº de seções mantidas/omitidas e os
 * rótulos genéricos das seções omitidas. NUNCA conteúdo do aluno.
 */

export interface PromptBudgetMetrics {
  applied: boolean;
  charsBefore: number;
  charsAfter: number;
  sectionsTotal: number;
  sectionsKept: number;
  sectionsDropped: number;
  /** Rótulos genéricos (heading) das seções omitidas — sem conteúdo do aluno. */
  droppedHeadings: string[];
}

export interface PromptBudgetResult {
  text: string;
  metrics: PromptBudgetMetrics;
}

const OMISSION_NOTE =
  '\n[NOTA DO SISTEMA: parte do contexto histórico foi omitida para respeitar o ' +
  'limite de tamanho do prompt. Baseie-se apenas no contexto acima e sinalize ' +
  'lacunas quando uma informação essencial não estiver disponível.]\n';

/** Divide em seções por linha-marcador; a 1ª parte (antes de qualquer marcador) é mantida sempre. */
function splitSections(text: string): { head: string; sections: string[] } {
  const lines = text.split('\n');
  const sections: string[] = [];
  let head: string[] = [];
  let current: string[] | null = null;
  const isMarker = (l: string) => /^\s*(===|---|═══)/.test(l);

  for (const line of lines) {
    if (isMarker(line)) {
      if (current) sections.push(current.join('\n'));
      current = [line];
    } else if (current) {
      current.push(line);
    } else {
      head.push(line);
    }
  }
  if (current) sections.push(current.join('\n'));
  return { head: head.join('\n'), sections };
}

function headingOf(section: string): string {
  const first = section.split('\n', 1)[0] ?? '';
  return first.replace(/[=\-═]/g, '').trim().slice(0, 80) || '(seção)';
}

/**
 * Recorta `contextText` para caber em `maxChars`, removendo seções inteiras a
 * partir do fim. `contextText` deve ser SOMENTE o bloco de contexto — nunca a
 * instrução nem o esqueleto JSON.
 */
export function clampPromptContext(contextText: string, maxChars: number): PromptBudgetResult {
  const charsBefore = contextText.length;
  if (charsBefore <= maxChars || maxChars <= 0) {
    return {
      text: contextText,
      metrics: {
        applied: false, charsBefore, charsAfter: charsBefore,
        sectionsTotal: 0, sectionsKept: 0, sectionsDropped: 0, droppedHeadings: [],
      },
    };
  }

  const { head, sections } = splitSections(contextText);
  const droppedHeadings: string[] = [];
  let kept = [...sections];

  // Remove seções do fim até caber (reservando espaço para a nota).
  const budget = Math.max(0, maxChars - OMISSION_NOTE.length);
  const size = (arr: string[]) => head.length + arr.reduce((s, x) => s + x.length + 1, 0);

  while (kept.length > 0 && size(kept) > budget) {
    const removed = kept.pop()!;
    droppedHeadings.unshift(headingOf(removed));
  }

  let text = head + (kept.length ? '\n' + kept.join('\n') : '');
  if (droppedHeadings.length > 0) text += OMISSION_NOTE;

  // Salvaguarda final: se ainda estourar (head gigante, sem seções), corta o
  // texto num limite de linha — nunca no meio de uma linha JSON.
  if (text.length > maxChars) {
    const hardCut = text.slice(0, maxChars);
    const lastNl = hardCut.lastIndexOf('\n');
    text = (lastNl > 0 ? hardCut.slice(0, lastNl) : hardCut) + OMISSION_NOTE;
  }

  return {
    text,
    metrics: {
      applied: true,
      charsBefore,
      charsAfter: text.length,
      sectionsTotal: sections.length,
      sectionsKept: kept.length,
      sectionsDropped: droppedHeadings.length,
      droppedHeadings,
    },
  };
}

/** Loga apenas métricas (sem conteúdo do aluno). */
export function logPromptBudget(scope: string, m: PromptBudgetMetrics): void {
  if (!m.applied) return;
  // eslint-disable-next-line no-console
  console.info(
    `[promptBudget:${scope}] contexto recortado — ${m.charsBefore}→${m.charsAfter} chars | ` +
    `seções ${m.sectionsKept}/${m.sectionsTotal} mantidas | omitidas: ${m.droppedHeadings.join('; ') || '—'}`,
  );
}
