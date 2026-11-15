'use client';

import { useState } from 'react';
import { ListTree } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { OutlineEntry } from './pdfjs';

/** The entry the reader is in: the last one that starts on or before `page`. */
export function currentEntryIndex(entries: OutlineEntry[], page: number): number {
  let current = -1;
  entries.forEach((entry, index) => {
    if (entry.page <= page) current = index;
  });
  return current;
}

/** The PDF's bookmarks; picking one jumps to its page. Hidden when the PDF has none. */
export function PdfContents({
  entries,
  currentPage,
  onGoToPage,
}: {
  entries: OutlineEntry[];
  currentPage: number;
  onGoToPage: (page: number) => void;
}) {
  if (entries.length === 0) return null;
  const current = currentEntryIndex(entries, currentPage);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="Contents"
        aria-label="Contents"
        data-testid="pdf-contents"
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent"
      >
        <ListTree className="h-5 w-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-80 overflow-y-auto">
        {entries.map((entry, index) => (
          <DropdownMenuItem
            key={`${index}-${entry.page}`}
            onClick={() => onGoToPage(entry.page)}
            data-testid="pdf-contents-item"
            aria-current={index === current ? 'location' : undefined}
            className={index === current ? 'font-semibold text-foreground' : undefined}
            style={{ paddingLeft: `${0.5 + (entry.level ?? 0) * 0.875}rem` }}
          >
            <span className="min-w-0 flex-1 truncate">{entry.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {entry.page}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "3 / 120"; a click turns it into a field for a page number. */
export function PageJump({
  currentPage,
  pageCount,
  onGoToPage,
}: {
  currentPage: number;
  pageCount: number;
  onGoToPage: (page: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (pageCount === 0) return null;

  if (draft === null) {
    return (
      <button
        onClick={() => setDraft(String(currentPage))}
        title="Go to page"
        data-testid="pdf-page-indicator"
        className="rounded-lg px-1.5 py-1 text-sm whitespace-nowrap text-muted-foreground hover:bg-accent"
      >
        {currentPage} / {pageCount}
      </button>
    );
  }

  const submit = () => {
    const page = Math.trunc(Number(draft));
    setDraft(null);
    if (Number.isFinite(page) && page >= 1) onGoToPage(Math.min(page, pageCount));
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex items-center gap-1 text-sm text-muted-foreground"
    >
      <input
        autoFocus
        type="number"
        min={1}
        max={pageCount}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDraft(null);
        }}
        onFocus={(event) => event.target.select()}
        aria-label={`Page number, 1 to ${pageCount}`}
        data-testid="pdf-page-input"
        className="w-16 rounded-md border border-input bg-background px-1.5 py-0.5 text-right text-foreground"
      />
      <span className="whitespace-nowrap">/ {pageCount}</span>
    </form>
  );
}
