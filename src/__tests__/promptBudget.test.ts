/**
 * promptBudget.test.ts — orçamento determinístico de tamanho de prompt (M-08).
 */
import { describe, expect, it } from 'vitest';
import { clampPromptContext } from '../utils/promptBudget';

function section(heading: string, body: string): string {
  return `=== ${heading} ===\n${body}`;
}

describe('clampPromptContext', () => {
  it('abaixo do orçamento → texto inalterado, applied:false', () => {
    const ctx = section('A', 'linha 1\nlinha 2');
    const r = clampPromptContext(ctx, 10_000);
    expect(r.text).toBe(ctx);
    expect(r.metrics.applied).toBe(false);
    expect(r.metrics.sectionsDropped).toBe(0);
  });

  it('acima do orçamento → remove seções inteiras a partir do fim', () => {
    const big = 'x'.repeat(2_000);
    const ctx = [
      section('PERFIL COGNITIVO', big),
      section('LAUDOS CLINICOS', big),
      section('HISTORICO DE ATIVIDADES', big),
      section('ESTRATEGIAS QUE FUNCIONARAM', big),
    ].join('\n');
    const r = clampPromptContext(ctx, 5_000);
    expect(r.metrics.applied).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(5_000);
    // mantém as primeiras (maior prioridade), corta as últimas
    expect(r.text).toContain('PERFIL COGNITIVO');
    expect(r.text).not.toContain('ESTRATEGIAS QUE FUNCIONARAM');
    expect(r.metrics.droppedHeadings).toContain('ESTRATEGIAS QUE FUNCIONARAM');
    expect(r.metrics.sectionsKept + r.metrics.sectionsDropped).toBe(4);
  });

  it('nunca corta no meio de uma linha (só em fronteira de seção/linha)', () => {
    const jsonish = section('DADOS', '{ "a": 1, "b": [1,2,3], "c": "texto longo aqui" }\n'.repeat(50));
    const ctx = [section('MANTER', 'ok'), jsonish, section('CORTAR', 'z'.repeat(3000))].join('\n');
    const r = clampPromptContext(ctx, 300);
    // a nota de omissão termina o texto; nada de "{ \"a\": 1, \"b\": [1,2" cortado no meio
    const withoutNote = r.text.replace(/\n\[NOTA DO SISTEMA:[\s\S]*$/, '');
    // toda linha do resultado (sem a nota) é uma linha completa do original
    const origLines = new Set(ctx.split('\n'));
    for (const line of withoutNote.split('\n')) {
      expect(origLines.has(line) || line === '' || line.startsWith('===')).toBe(true);
    }
  });

  it('inclui a NOTA DO SISTEMA quando algo foi omitido', () => {
    const ctx = [section('A', 'a'.repeat(3000)), section('B', 'b'.repeat(3000))].join('\n');
    const r = clampPromptContext(ctx, 3_200);
    expect(r.text).toContain('[NOTA DO SISTEMA:');
    expect(r.text).toContain('omitida');
  });

  it('métricas não expõem conteúdo — só rótulos de seção', () => {
    const ctx = [
      section('PERFIL COGNITIVO', 'Atencao Sustentada 2/5 — dado sensível do aluno ' + 'y'.repeat(3000)),
      section('LAUDOS', 'CID e nome do aluno aqui ' + 'z'.repeat(3000)),
    ].join('\n');
    const r = clampPromptContext(ctx, 3_100);
    const metricsDump = JSON.stringify(r.metrics);
    expect(metricsDump).not.toContain('Atencao Sustentada 2/5');
    expect(metricsDump).not.toContain('CID e nome');
    expect(r.metrics.droppedHeadings.every(h => h.length <= 80)).toBe(true);
  });

  it('orçamento 0 ou negativo → não altera (fail-safe)', () => {
    const ctx = section('A', 'conteúdo');
    expect(clampPromptContext(ctx, 0).text).toBe(ctx);
    expect(clampPromptContext(ctx, -5).text).toBe(ctx);
  });
});
