'use client';

import AnkiStatus from '@/components/AnkiStatus';
import StateIndicator from '@/components/StateIndicator';
import type { WordState } from '@/types';
import { stateMenuOptions } from '../../constants';
import { VocabRowProps } from './types';

export default function VocabRow({
  entry,
  bookTitle,
  isSelected,
  onSelect,
  onClick,
  onStateChange,
}: VocabRowProps) {
  const formattedDate = new Date(entry.createdAt).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <tr
      className="cursor-pointer border-b border-border transition-colors hover:bg-accent"
      onClick={() => onClick(entry)}
    >
      {/* Checkbox */}
      <td className="w-12 px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(entry.id, e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
        />
      </td>

      {/* Word/Phrase */}
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{entry.text}</span>
          {entry.type === 'phrase' && <span className="text-xs text-muted-foreground">phrase</span>}
        </div>
      </td>

      {/* Translation */}
      <td className="max-w-xs px-4 py-3">
        <span className="line-clamp-2 text-muted-foreground">{entry.translation}</span>
      </td>

      {/* State */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-2">
          <StateIndicator state={entry.state} />
          <select
            value={entry.state}
            aria-label={`State of ${entry.text}`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              void onStateChange(entry.id, e.target.value as WordState);
            }}
            className="rounded border border-input bg-background px-1 py-0.5 text-xs text-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
          >
            {stateMenuOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </td>

      <td className="max-w-[150px] px-4 py-3">
        <span className="line-clamp-1 text-sm text-muted-foreground">{bookTitle || '-'}</span>
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap text-muted-foreground">
        {entry.knownOnly ? '-' : formattedDate}
      </td>
      <td className="px-4 py-3">
        <AnkiStatus pushedToAnki={entry.pushedToAnki} ankiNoteId={entry.ankiNoteId} />
      </td>
    </tr>
  );
}
