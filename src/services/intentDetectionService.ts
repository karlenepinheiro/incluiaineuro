/**
 * intentDetectionService.ts
 *
 * Detecta automaticamente a intenção do usuário a partir do texto e contexto.
 * Separa system prompt do user prompt — o modelo nunca vê as instruções internas misturadas.
 *
 * Tipos de intenção:
 *   generate_activity    — gerar atividade pedagógica em texto
 *   generate_image       — gerar atividade em formato visual/imagem A4
 *   adapt_image          — adaptar imagem existente enviada pelo usuário
 *   generate_report_simple — gerar relatório simples do aluno
 *   generate_report_full   — gerar relatório completo do aluno
 */

import systemBase from '../prompts/system-base.md?raw';
import generateActivity from '../prompts/generate-activity.md?raw';
import generateImage from '../prompts/generate-image.md?raw';
import adaptImage from '../prompts/adapt-image.md?raw';
import generateReportSimple from '../prompts/generate-report-simple.md?raw';
import generateReportFull from '../prompts/generate-report-full.md?raw';

export type AIIntent =
  | 'generate_activity'
  | 'generate_image'
  | 'adapt_image'
  | 'generate_report_simple'
  | 'generate_report_full';

export interface IntentResult {
  intent: AIIntent;
  systemPrompt: string;
  /** Idioma detectado no texto do usuário (sempre força pt-BR no system) */
  forcedLocale: 'pt-BR';
}

// Termos que indicam geração visual/imagem
const IMAGE_KEYWORDS = [
  'imagem', 'figura', 'visual', 'a4', 'png', 'jpeg', 'jpg', 'cartaz',
  'ilustração', 'folha', 'impresso', 'imprimível', 'imprimir', 'pictograma',
  'desenho', 'picture', 'image',
];

// Termos que indicam relatório simples
const REPORT_SIMPLE_KEYWORDS = [
  'relatório simples', 'relatorio simples', 'relatório resumido',
  'relatório objetivo', 'relatório breve', 'relatório básico',
  'inss', 'assistência social', 'requerimento',
];

// Termos que indicam relatório completo
const REPORT_FULL_KEYWORDS = [
  'relatório completo', 'relatorio completo', 'relatório detalhado',
  'relatório aprofundado', 'relatório técnico', 'laudo completo',
  'relatório com gráfico', 'relatório full',
];

/**
 * Detecta a intenção a partir do texto e contexto.
 * @param userText   Texto digitado pelo usuário
 * @param hasImage   true se o usuário anexou uma imagem
 * @param context    Contexto da tela atual ('student_profile' | 'incluilab' | 'activities' | etc.)
 */
export function detectIntent(
  userText: string,
  hasImage: boolean,
  context?: string,
): IntentResult {
  const text = userText.toLowerCase();

  // 1. Imagem anexada → adaptar imagem (prioridade máxima)
  if (hasImage) {
    return build('adapt_image', systemBase + '\n\n' + adaptImage);
  }

  // 2. Relatório completo (verificar antes do simples)
  if (context === 'student_profile' && REPORT_FULL_KEYWORDS.some(k => text.includes(k))) {
    return build('generate_report_full', systemBase + '\n\n' + generateReportFull);
  }

  // 3. Relatório simples
  if (context === 'student_profile' && REPORT_SIMPLE_KEYWORDS.some(k => text.includes(k))) {
    return build('generate_report_simple', systemBase + '\n\n' + generateReportSimple);
  }

  // 4. Geração de imagem/visual A4
  if (IMAGE_KEYWORDS.some(k => text.includes(k))) {
    return build('generate_image', systemBase + '\n\n' + generateImage);
  }

  // 5. Padrão → gerar atividade
  return build('generate_activity', systemBase + '\n\n' + generateActivity);
}

/**
 * Retorna o system prompt correto para um tipo de relatório (usado pela ficha do aluno).
 */
export function getReportSystemPrompt(type: 'simple' | 'full'): string {
  return type === 'full'
    ? systemBase + '\n\n' + generateReportFull
    : systemBase + '\n\n' + generateReportSimple;
}

function build(intent: AIIntent, systemPrompt: string): IntentResult {
  return { intent, systemPrompt, forcedLocale: 'pt-BR' };
}
