export const WHATSAPP_SUPPORT_NUMBER = '5599984167490';
export const WHATSAPP_SUPPORT_DISPLAY = '(99) 98416-7490';

export const DEFAULT_WA_MESSAGE = 'Olá! Gostaria de falar com o suporte do IncluiAI.';

export function waUrl(message?: string): string {
  const text = encodeURIComponent(message ?? DEFAULT_WA_MESSAGE);
  return `https://wa.me/${WHATSAPP_SUPPORT_NUMBER}?text=${text}`;
}
