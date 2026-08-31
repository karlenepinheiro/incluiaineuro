/**
 * pdfjsCompat.ts
 *
 * Corrige a incompatibilidade real que quebra a prévia A4 em Safari/WebKit
 * (iPad/iPhone e navegadores baseados em WebKit no geral).
 *
 * CAUSA RAIZ (confirmada por reprodução real em navegador — ver
 * auditorias/2026-08-26_fase-2-preview-a4-tablet-e-plano-google-docs.html):
 *   A partir da versão instalada de `pdfjs-dist` (5.7.284), o próprio código
 *   da biblioteca usa `Map.prototype.getOrInsertComputed(...)` — um método
 *   nativo do proposal TC39 "Map/Set Upsert", já disponível no V8/Chromium
 *   mas AINDA NÃO implementado no motor JavaScript do Safari/WebKit em uso
 *   nos iPads no momento desta correção. Isso derruba `PDFPageProxy.render()`
 *   (via `WorkerTransport.getOptionalContentConfig()`, no thread principal,
 *   não no worker) com o erro exato relatado:
 *   "TypeError: ...getOrInsertComputed is not a function".
 *
 *   A geração do PDF em si (jsPDF, em `PDFGenerator`) não usa `pdfjs-dist` e
 *   por isso continua funcionando normalmente — só a PRÉVIA em tela (que usa
 *   `pdfjs-dist` para transformar o PDF gerado em imagens A4 na tela) quebra.
 *
 * CORREÇÃO: um polyfill mínimo, sem dependências novas, que implementa a
 * mesma semântica do método nativo quando ele não existe. Idempotente e sem
 * efeito quando o motor já suporta o método nativamente (Chrome/Chromium,
 * Firefox recente, e futuras versões do Safari).
 *
 * Escopo desta correção: só o thread principal (onde `PDFPageProxy.render()`
 * roda e onde o erro relatado foi reproduzido). O worker interno do pdfjs-dist
 * (`pdf.worker.min.mjs`) roda em sua própria realm JS e não é afetado por
 * este polyfill — não há evidência de que o erro relatado ocorra lá; se isso
 * vier a acontecer, o fallback amigável em FormalPdfPreview/EstudoCasoPdfPreview
 * cobre o caso sem nunca expor um erro técnico à professora.
 */

function polyfillGetOrInsertComputed(proto: { prototype: any } | undefined): void {
  if (!proto || !proto.prototype) return;
  if (typeof proto.prototype.getOrInsertComputed === 'function') return;
  Object.defineProperty(proto.prototype, 'getOrInsertComputed', {
    value(this: Map<unknown, unknown> | WeakMap<object, unknown>, key: unknown, callbackFn: (key: unknown) => unknown) {
      if (this.has(key as any)) return this.get(key as any);
      const value = callbackFn(key);
      this.set(key as any, value);
      return value;
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/**
 * Aplica o polyfill de `Map.prototype.getOrInsertComputed` /
 * `WeakMap.prototype.getOrInsertComputed` no thread principal, se o motor do
 * navegador ainda não os tiver nativamente. Seguro para chamar mais de uma
 * vez (idempotente via checagem do próprio protótipo — não depende de um
 * flag em memória) e em qualquer navegador (não faz nada quando o método já
 * existe nativamente).
 *
 * Deve ser chamada ANTES de qualquer uso de `pdfjs-dist` (`getDocument`,
 * `page.render()`, etc.) — por isso é chamada no topo dos componentes de
 * prévia A4, antes do próprio import de `pdfjs-dist` ser usado.
 */
export function ensurePdfjsMapUpsertCompat(): void {
  try {
    polyfillGetOrInsertComputed(typeof Map !== 'undefined' ? Map : undefined);
    polyfillGetOrInsertComputed(typeof WeakMap !== 'undefined' ? WeakMap : undefined);
  } catch (e) {
    // Nunca deixa o polyfill em si quebrar a aplicação — na pior hipótese,
    // o fallback amigável do componente de prévia ainda cobre o erro real.
    console.warn('[pdfjsCompat] Falha ao aplicar polyfill de compatibilidade:', e);
  }
}
