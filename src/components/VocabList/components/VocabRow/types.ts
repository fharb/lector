import { VocabEntry, WordState } from '@/types';

export interface VocabRowProps {
  entry: VocabEntry;
  bookTitle?: string;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onClick: (entry: VocabEntry) => void;
  onStateChange: (id: string, state: WordState) => Promise<void>;
}
