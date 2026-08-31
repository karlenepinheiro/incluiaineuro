import React from 'react';

/**
 * Ícone "G" do Google — reprodução padrão do logomark multicolorido oficial
 * (mesmas 4 cores e proporções usadas em botões "Continuar com o Google" e
 * afins em todo o ecossistema web), usado aqui só para indicar visualmente o
 * destino da ação "Abrir no Google Docs". Não é o logotipo completo do Google
 * Docs nem uma marca registrada de terceiro incorporada via CDN — é um SVG
 * local, nas cores e no traçado oficiais, sem recolorir/distorcer, seguindo a
 * orientação de marca de não alterar o logomark. Dimensionado com a mesma
 * prop `size` usada pelos ícones `lucide-react` já existentes no painel de
 * ações (`Download`, `FileOutput`, `Printer`), para manter o alinhamento
 * visual entre os botões.
 */
export interface GoogleGIconProps {
  size?: number;
  className?: string;
}

export const GoogleGIcon: React.FC<GoogleGIconProps> = ({ size = 15, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    className={className}
    role="img"
    aria-hidden="true"
    focusable="false"
  >
    <path
      fill="#FFC107"
      d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.5 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
    />
    <path
      fill="#FF3D00"
      d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.5 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.3 35.5 26.8 36 24 36c-5.2 0-9.6-3.1-11.3-7.5l-6.5 5C9.6 39.6 16.3 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.6 20.5H42V20H24v8h11.3c-0.8 2.3-2.3 4.3-4.2 5.7l6.3 5.3C39.9 36.6 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z"
    />
  </svg>
);

export default GoogleGIcon;
