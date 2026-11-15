'use client';

import { useState, type ReactNode } from 'react';
import { CheckCheck, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export type BulkWordTarget = 'known' | 'ignored';

const ACTION: Record<BulkWordTarget, { label: string; confirm: string; result: string }> = {
  known: { label: 'Mark remaining as known', confirm: 'Mark as known', result: 'become known' },
  ignored: { label: 'Ignore remaining words', confirm: 'Ignore', result: 'be ignored' },
};

/** A confirm dialog that moves the new words of a lesson or a page to one state. */
export function MarkRemainingDialog({
  open,
  onOpenChange,
  count,
  target,
  where,
  testId,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  target: BulkWordTarget;
  /** For example "in this lesson" or "on page 12". */
  where: string;
  testId: string;
  onConfirm: () => void;
}) {
  const action = ACTION[target];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl p-6">
        <DialogTitle className="mb-1">{action.label}?</DialogTitle>
        <DialogDescription className="mb-5" data-testid={`${testId}-description`}>
          {count} new {count === 1 ? 'word' : 'words'} {where} will {action.result}. Words that you
          are learning or have ignored do not change. You cannot undo this action.
        </DialogDescription>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid={`${testId}-cancel`}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
            data-testid={`${testId}-confirm`}
          >
            {action.confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ICONS: Record<BulkWordTarget, ReactNode> = {
  known: <CheckCheck className="h-5 w-5" />,
  ignored: <EyeOff className="h-5 w-5" />,
};

export default function MarkRemainingKnown({
  count,
  onConfirm,
  target = 'known',
}: {
  count: number;
  onConfirm: () => void;
  target?: BulkWordTarget;
}) {
  const [open, setOpen] = useState(false);
  const label = ACTION[target].label;
  const testId = target === 'known' ? 'mark-remaining-known' : 'ignore-remaining';

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        disabled={count === 0}
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
        data-testid={testId}
        className="size-9 rounded-lg text-muted-foreground"
      >
        {ICONS[target]}
      </Button>
      <MarkRemainingDialog
        open={open}
        onOpenChange={setOpen}
        count={count}
        target={target}
        where="in this lesson"
        testId={testId}
        onConfirm={onConfirm}
      />
    </>
  );
}
