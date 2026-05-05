import { exportAsPDF } from './incluilabExport';

export async function downloadElementAsA4Pdf(element: HTMLElement, filename: string): Promise<void> {
  await exportAsPDF(element, filename);
}
