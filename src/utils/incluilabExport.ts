import { jsPDF } from 'jspdf';

export async function exportAsPDF(element: HTMLElement, filename = 'atividade-incluilab.pdf'): Promise<void> {
  const { default: html2canvas } = await import('html2canvas');

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    onclone: (doc) => {
      doc.querySelectorAll<HTMLElement>('[data-incluilab-pdf-page="true"]').forEach(page => {
        page.style.boxShadow = 'none';
        page.style.borderRadius = '0';
        page.style.margin = '0';
        page.style.transform = 'none';
      });
    },
  });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = 210;
  const pageHeight = 297;
  const imgData = canvas.toDataURL('image/jpeg', 1);
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  let remaining = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight, undefined, 'FAST');
  remaining -= pageHeight;

  while (remaining > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight, undefined, 'FAST');
    remaining -= pageHeight;
  }

  pdf.save(filename);
}

export async function exportAsPNG(element: HTMLElement, filename = 'atividade-incluilab.png'): Promise<void> {
  const { default: html2canvas } = await import('html2canvas');

  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
