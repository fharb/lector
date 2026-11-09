'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const LABEL = 'Mark known words as unknown';

export default function MarkKnownUnknown({
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
        data-testid="mark-known-unknown"
        className="size-9 rounded-lg text-muted-foreground"
      >
        <RotateCcw className="h-5 w-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-xl p-6">
          <DialogTitle className="mb-1">{LABEL}?</DialogTitle>
          <DialogDescription className="mb-5" data-testid="mark-known-unknown-description">
            {count} known {count === 1 ? 'word' : 'words'} in this lesson will become unknown,
            everywhere in the app. Words that you are learning or have ignored do not change. You
            cannot undo this action.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              data-testid="mark-known-unknown-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              data-testid="mark-known-unknown-confirm"
            >
              Mark as unknown
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
