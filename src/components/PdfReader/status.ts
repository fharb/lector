import type { PdfStatus } from '@/types';

export function pdfInProgress(status: PdfStatus | null | undefined): boolean {
  return status === 'pending' || status === 'processing';
}

const LABELS: Partial<Record<PdfStatus, string>> = {
  pending: 'Waiting to read the PDF…',
  processing: 'Reading the PDF…',
  failed: 'PDF import failed',
};

export function pdfStatusLabel(status: PdfStatus | null | undefined): string {
  return (status && LABELS[status]) ?? '';
}
