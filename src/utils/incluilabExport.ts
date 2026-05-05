import { jsPDF } from 'jspdf';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PDF_PAGE_SELECTOR = '[data-incluilab-pdf-page="true"]';
const IMAGE_PAGE_SELECTOR = '[data-incluilab-image-page="true"]';

type ImageFormat = 'PNG' | 'JPEG';

function assertExportElement(element: HTMLElement | null | undefined): asserts element is HTMLElement {
  if (!element) {
    throw new Error('Nenhum conteudo foi encontrado para exportar.');
  }
  if (!element.isConnected) {
    throw new Error('O conteudo selecionado para exportar nao esta mais no DOM.');
  }
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    throw new Error('O conteudo selecionado para exportar esta sem tamanho visivel.');
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Erro desconhecido');
}

function waitForImage(image: HTMLImageElement, timeoutMs = 15000): Promise<void> {
  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout);
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
    };
    const onLoad = () => {
      cleanup();
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve();
      } else {
        reject(new Error('Imagem carregada sem dimensoes validas.'));
      }
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Falha ao carregar imagem para exportacao: ${image.currentSrc || image.src || 'sem-src'}`));
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Tempo esgotado ao carregar imagem para exportacao.'));
    }, timeoutMs);

    image.addEventListener('load', onLoad, { once: true });
    image.addEventListener('error', onError, { once: true });
  });
}

async function waitForImages(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll<HTMLImageElement>('img')).filter(image => image.src);
  await Promise.all(images.map(image => waitForImage(image)));
}

function getImageFormat(dataUrl: string): ImageFormat {
  return dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
}

function canvasToDataUrl(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number): string {
  try {
    return canvas.toDataURL(type, quality);
  } catch (error) {
    throw new Error(`Falha ao converter conteudo para imagem. ${getErrorMessage(error)}`);
  }
}

function getPrimaryImagePage(element: HTMLElement): HTMLImageElement | null {
  const page = element.matches(IMAGE_PAGE_SELECTOR)
    ? element
    : element.querySelector<HTMLElement>(IMAGE_PAGE_SELECTOR);
  if (!page) return null;

  const images = Array.from(page.querySelectorAll<HTMLImageElement>('img')).filter(image => image.src);
  return images.length === 1 ? images[0] : null;
}

function imageToPdfData(image: HTMLImageElement): { dataUrl: string; width: number; height: number; format: ImageFormat } {
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('Imagem sem dimensoes validas para exportacao.');
  }

  if (image.src.startsWith('data:image/png') || image.src.startsWith('data:image/jpeg') || image.src.startsWith('data:image/jpg')) {
    return {
      dataUrl: image.src,
      width: image.naturalWidth,
      height: image.naturalHeight,
      format: getImageFormat(image.src),
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponivel para exportar imagem.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);

  const dataUrl = canvasToDataUrl(canvas, 'image/jpeg', 0.95);
  return { dataUrl, width: canvas.width, height: canvas.height, format: 'JPEG' };
}

function fillPdfPageWhite(pdf: jsPDF): void {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, 'F');
}

function addImageCenteredOnA4(
  pdf: jsPDF,
  dataUrl: string,
  sourceWidth: number,
  sourceHeight: number,
  format: ImageFormat,
): void {
  fillPdfPageWhite(pdf);
  const scale = Math.min(A4_WIDTH_MM / sourceWidth, A4_HEIGHT_MM / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const left = (A4_WIDTH_MM - width) / 2;
  const top = (A4_HEIGHT_MM - height) / 2;
  pdf.addImage(dataUrl, format, left, top, width, height, undefined, 'FAST');
}

function getExplicitPdfPages(element: HTMLElement): HTMLElement[] {
  const pages: HTMLElement[] = [];
  if (element.matches(PDF_PAGE_SELECTOR)) pages.push(element);
  pages.push(...Array.from(element.querySelectorAll<HTMLElement>(PDF_PAGE_SELECTOR)));

  return pages.filter((page, index, all) => {
    if (all.indexOf(page) !== index) return false;
    const parentPage = page.parentElement?.closest(PDF_PAGE_SELECTOR);
    return !parentPage || parentPage === element;
  });
}

function applyPdfCloneStyles(doc: Document): void {
  doc.documentElement.style.background = '#ffffff';
  doc.body.style.background = '#ffffff';
  doc.querySelectorAll<HTMLElement>(`${PDF_PAGE_SELECTOR}, ${IMAGE_PAGE_SELECTOR}`).forEach(page => {
    page.style.boxShadow = 'none';
    page.style.borderRadius = '0';
    page.style.margin = '0';
    page.style.transform = 'none';
    page.style.background = '#ffffff';
  });
}

async function renderElement(element: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import('html2canvas');
  const rect = element.getBoundingClientRect();

  return html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: Math.ceil(Math.max(document.documentElement.scrollWidth, rect.width)),
    windowHeight: Math.ceil(Math.max(document.documentElement.scrollHeight, rect.height)),
    onclone: applyPdfCloneStyles,
  });
}

function getAvoidBreakRanges(element: HTMLElement, canvas: HTMLCanvasElement): Array<{ top: number; bottom: number }> {
  const elementRect = element.getBoundingClientRect();
  const ratio = canvas.height / Math.max(elementRect.height, 1);

  return Array.from(element.querySelectorAll<HTMLElement>('.incluilab-avoid-break'))
    .map(block => {
      const rect = block.getBoundingClientRect();
      return {
        top: Math.max(0, (rect.top - elementRect.top) * ratio),
        bottom: Math.min(canvas.height, (rect.bottom - elementRect.top) * ratio),
      };
    })
    .filter(range => range.bottom > range.top);
}

function buildPageSegments(element: HTMLElement, canvas: HTMLCanvasElement): Array<{ start: number; end: number }> {
  const maxSliceHeight = Math.floor((canvas.width * A4_HEIGHT_MM) / A4_WIDTH_MM);
  const minUsefulSlice = maxSliceHeight * 0.35;
  const avoidRanges = getAvoidBreakRanges(element, canvas);
  const segments: Array<{ start: number; end: number }> = [];
  let start = 0;

  while (start < canvas.height - 1) {
    let end = Math.min(canvas.height, start + maxSliceHeight);

    if (end < canvas.height) {
      const crossingBlock = avoidRanges.find(range =>
        range.top < end &&
        range.bottom > end &&
        range.top - start > minUsefulSlice
      );

      if (crossingBlock) {
        end = Math.max(start + 1, Math.floor(crossingBlock.top - 12));
      }
    }

    if (end <= start + 1) {
      end = Math.min(canvas.height, start + maxSliceHeight);
    }

    segments.push({ start, end });
    start = end;
  }

  return segments;
}

function addCanvasSliceToPdf(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  segment: { start: number; end: number },
  addPageBefore: boolean,
): void {
  if (addPageBefore) pdf.addPage();

  const sliceHeight = Math.max(1, Math.ceil(segment.end - segment.start));
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = canvas.width;
  pageCanvas.height = sliceHeight;
  const ctx = pageCanvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponivel para paginar PDF.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
  ctx.drawImage(
    canvas,
    0,
    Math.floor(segment.start),
    canvas.width,
    sliceHeight,
    0,
    0,
    canvas.width,
    sliceHeight,
  );

  fillPdfPageWhite(pdf);
  const dataUrl = canvasToDataUrl(pageCanvas, 'image/jpeg', 0.95);
  const heightMm = Math.min(A4_HEIGHT_MM, (sliceHeight * A4_WIDTH_MM) / canvas.width);
  pdf.addImage(dataUrl, 'JPEG', 0, 0, A4_WIDTH_MM, heightMm, undefined, 'FAST');
}

async function addHtmlElementToPdf(pdf: jsPDF, element: HTMLElement, addPageBefore: boolean): Promise<void> {
  const canvas = await renderElement(element, 2);
  if (!canvas.width || !canvas.height) {
    throw new Error('Canvas vazio ao renderizar conteudo para PDF.');
  }

  const segments = buildPageSegments(element, canvas);
  segments.forEach((segment, index) => {
    addCanvasSliceToPdf(pdf, canvas, segment, addPageBefore || index > 0);
  });
}

export async function exportAsPDF(element: HTMLElement, filename = 'atividade-incluilab.pdf'): Promise<void> {
  assertExportElement(element);
  await waitForImages(element);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const image = getPrimaryImagePage(element);

  if (image) {
    const { dataUrl, width, height, format } = imageToPdfData(image);
    addImageCenteredOnA4(pdf, dataUrl, width, height, format);
    pdf.save(filename);
    return;
  }

  const pages = getExplicitPdfPages(element);
  if (pages.length > 1) {
    for (let index = 0; index < pages.length; index++) {
      await addHtmlElementToPdf(pdf, pages[index], index > 0);
    }
  } else {
    await addHtmlElementToPdf(pdf, pages[0] || element, false);
  }

  pdf.save(filename);
}

export async function exportAsPNG(element: HTMLElement, filename = 'atividade-incluilab.png'): Promise<void> {
  assertExportElement(element);
  await waitForImages(element);

  const canvas = await renderElement(element, 3);
  if (!canvas.width || !canvas.height) {
    throw new Error('Canvas vazio ao renderizar conteudo para PNG.');
  }

  const dataUrl = canvasToDataUrl(canvas, 'image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
