/**
 * _promptBudget.ts — cópia Deno-safe de src/utils/promptBudget.ts.
 *
 * MANTER EM SINCRONIA com src/utils/promptBudget.ts. A Edge Function não pode
 * importar de src/; a lógica é idêntica. Função pura, sem imports.
 *
 * Uso no Gateway: recortar o CONTEXTO canônico montado pelo servidor
 * (`formatContextForPrompt`) antes de concatenar ao prompt, para o prompt
 * final nunca ultrapassar o limite aceito pelo provedor.
 *
 * Log: só métricas (chars, seções mantidas/omitidas, rótulos das seções).
 * Nunca conteúdo do aluno.
 */

export interface PromptBudgetMetrics {
  applied: boolean;
  charsBefore: number;
  charsAfter: number;
  sectionsTotal: number;
  sectionsKept: number;
  sectionsDropped: number;
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

function splitSections(text: string): { head: string; sections: string[] } {
  const lines = text.split('\n');
  const sections: string[] = [];
  const head: string[] = [];
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
  const kept = [...sections];

  const budget = Math.max(0, maxChars - OMISSION_NOTE.length);
  const size = (arr: string[]) => head.length + arr.reduce((s, x) => s + x.length + 1, 0);

  while (kept.length > 0 && size(kept) > budget) {
    const removed = kept.pop()!;
    droppedHeadings.unshift(headingOf(removed));
  }

  let text = head + (kept.length ? '\n' + kept.join('\n') : '');
  if (droppedHeadings.length > 0) text += OMISSION_NOTE;

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

export function logPromptBudget(scope: string, m: PromptBudgetMetrics): void {
  if (!m.applied) return;
  console.info(
    `[promptBudget:${scope}] contexto recortado — ${m.charsBefore}->${m.charsAfter} chars | ` +
    `secoes ${m.sectionsKept}/${m.sectionsTotal} mantidas | omitidas: ${m.droppedHeadings.join('; ') || '-'}`,
  );
}
