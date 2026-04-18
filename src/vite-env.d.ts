/// <reference types="vite/client" />

// Permite importar arquivos .md como string com o sufixo ?raw (suporte nativo do Vite)
declare module '*.md?raw' {
  const content: string;
  export default content;
}

// @types/qrcode não está publicado — declaração manual para suprimir TS7016
declare module 'qrcode' {
  interface QRCodeToDataURLOptions {
    margin?: number;
    width?: number;
    color?: { dark?: string; light?: string };
  }
  function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  export { toDataURL };
}