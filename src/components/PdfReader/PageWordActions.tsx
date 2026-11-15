'use client';

import { useState } from 'react';
import { FileCheck } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MarkRemainingDialog, type BulkWordTarget } from '@/components/MarkRemainingKnown';

/** Mark or ignore the new words of the page being read. `count` is null while the page loads. */
export default function PageWordActions({
  page,
  count,
  onConfirm,
}: {
  page: number;
  count: number | null;
  onConfirm: (target: BulkWordTarget) => void;
}) {
  const [target, setTarget] = useState<BulkWordTarget | null>(null);
  const disabled = !count;
  const label = `New words on page ${page}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          title={label}
          aria-label={label}
          data-testid="pdf-page-words"
          className="flex items-center gap-1 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <FileCheck className="h-5 w-5" />
          {count !== null && count > 0 && <span className="text-xs">{count}</span>}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onClick={() => setTarget('known')} data-testid="pdf-page-known">
            Mark new words on page {page} as known
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTarget('ignored')} data-testid="pdf-page-ignore">
            Ignore new words on page {page}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MarkRemainingDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        count={count ?? 0}
        target={target ?? 'known'}
        where={`on page ${page}`}
        testId="pdf-page-words-dialog"
        onConfirm={() => {
          if (target) onConfirm(target);
        }}
      />
    </>
  );
}
