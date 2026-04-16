/// <reference types="vite/client" />

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