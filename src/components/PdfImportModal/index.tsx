'use client';

import { FileText, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { importPdf, type PdfImportMode } from '@/lib/data-layer';
import { inspectPdf } from '@/components/PdfReader/pdfjs';

export interface PdfImportModalProps {
  isOpen: boolean;
  groupId?: string | null;
  onClose: () => void;
  onImported: (result: { collectionId: string; lessonId: string; mode: PdfImportMode }) => void;
}

const MAX_BYTES = 500 * 1024 * 1024;

const MODES: { mode: PdfImportMode; title: string; description: string }[] = [
  {
    mode: 'pages',
    title: 'Keep the PDF pages',
    description:
      'Read the original pages, with tables and figures. Words on the page are clickable.',
  },
  {
    mode: 'text',
    title: 'Extract the text',
    description: 'Save only the text, as normal lessons split by chapter. The PDF is not kept.',
  },
];

export default function PdfImportModal({
  isOpen,
  groupId = null,
  onClose,
  onImported,
}: PdfImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<PdfImportMode>('pages');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const uploading = progress !== null || checking;

  /* eslint-disable react-hooks/set-state-in-effect -- reset on open */
  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setTitle('');
    setMode('pages');
    setProgress(null);
    setChecking(false);
    setError(null);
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function chooseFile(chosen: File | undefined) {
    setError(null);
    if (!chosen) return;
    if (!chosen.name.toLowerCase().endsWith('.pdf')) {
      setError('Choose a .pdf file.');
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setError('The PDF is too large (max 500 MB).');
      return;
    }
    setFile(chosen);
    setTitle(chosen.name.replace(/\.pdf$/i, ''));
  }

  async function handleImport() {
    if (!file) return;
    setError(null);
    setChecking(true);
    const inspection = await inspectPdf(file);
    setChecking(false);
    if (!inspection.readable) {
      setError('The file could not be opened as a PDF.');
      return;
    }
    if (!inspection.hasText) {
      setError(
        'This PDF has no text, so it cannot be imported. It is probably a scan: run it through OCR first, then import it again.',
      );
      return;
    }
    setProgress(0);
    try {
      const outline = mode === 'text' ? inspection.outline : [];
      const result = await importPdf(file, {
        mode,
        title: title.trim() || undefined,
        groupId,
        outline,
        onProgress: setProgress,
      });
      toast.success(
        mode === 'text'
          ? `"${result.title}" uploaded. The text is being extracted.`
          : `"${result.title}" uploaded. The pages are being prepared.`,
      );
      onImported(result);
    } catch (err) {
      setProgress(null);
      setError(err instanceof Error ? err.message : 'Failed to import the PDF.');
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !uploading && onClose()}>
      <DialogContent
        className="flex max-h-[85vh] max-w-lg flex-col overflow-hidden"
        data-testid="pdf-import-modal"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <DialogTitle>Import PDF</DialogTitle>
          <DialogClose
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
            aria-label="Close"
            disabled={uploading}
          >
            <X className="h-5 w-5" />
          </DialogClose>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              data-testid="pdf-file-input"
              onChange={(event) => {
                chooseFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              data-testid="pdf-choose-file"
            >
              <FileText className="h-4 w-4" />
              <span className="truncate">{file ? file.name : 'Choose a PDF file'}</span>
            </Button>
            {file && (
              <p className="mt-1 text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            )}
          </div>

          {file && (
            <div>
              <label htmlFor="pdf-title" className="mb-2 block text-sm font-medium text-foreground">
                Title
              </label>
              <input
                id="pdf-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={uploading}
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none disabled:opacity-50"
              />
            </div>
          )}

          <fieldset className="space-y-2" disabled={uploading}>
            <legend className="mb-2 text-sm font-medium text-foreground">How to import</legend>
            {MODES.map((option) => (
              <label
                key={option.mode}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                  mode === option.mode
                    ? 'border-primary bg-[var(--primary-soft)]'
                    : 'border-border hover:bg-accent'
                }`}
              >
                <input
                  type="radio"
                  name="pdf-mode"
                  value={option.mode}
                  checked={mode === option.mode}
                  onChange={() => setMode(option.mode)}
                  className="mt-1"
                  data-testid={`pdf-mode-${option.mode}`}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{option.title}</span>
                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {mode === 'text' && (
            <p
              className="rounded-lg border border-[var(--clay)]/40 bg-muted px-3 py-2 text-xs text-muted-foreground"
              data-testid="pdf-text-warning"
            >
              Tables and figures are lost in this mode, and their text can come out in the wrong
              order.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            The PDF must contain text. A scan without OCR cannot be imported.
          </p>

          {progress !== null && (
            <div data-testid="pdf-upload-progress">
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Uploading… {Math.round(progress * 100)}%
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert" data-testid="pdf-import-error">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border bg-muted px-6 py-4">
          <DialogClose className={buttonVariants({ variant: 'ghost' })} disabled={uploading}>
            Cancel
          </DialogClose>
          <Button
            onClick={handleImport}
            disabled={!file || uploading}
            data-testid="pdf-import-submit"
          >
            {checking ? 'Checking…' : uploading ? 'Uploading…' : 'Import'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
