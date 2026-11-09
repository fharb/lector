'use client';

import { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const LABEL = 'Mark remaining as known';

export default function MarkRemainingKnown({
  count,
  onConfirm,
}: {
  count: number;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        disabled={count === 0}
        onClick={() => setOpen(true)}
        title={LABEL}
        aria-label={LABEL}
        data-testid="mark-remaining-known"
        className="size-9 rounded-lg text-muted-foreground"
      >
        <CheckCheck className="h-5 w-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-xl p-6">
          <DialogTitle className="mb-1">{LABEL}?</DialogTitle>
          <DialogDescription className="mb-5" data-testid="mark-remaining-known-description">
            {count} new {count === 1 ? 'word' : 'words'} in this lesson will become known. Words
            that you are learning or have ignored do not change. You cannot undo this action.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              data-testid="mark-remaining-known-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              data-testid="mark-remaining-known-confirm"
            >
              Mark as known
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
