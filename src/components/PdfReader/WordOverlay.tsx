'use client';

import { memo, useCallback, useRef, useState } from 'react';
import { lookupByVocabKeys, type LanguageConfig } from '@/lib/languages';
import { stateClasses } from '@/components/MarkdownReader/theme';
import type { WordState } from '@/types';
import type { PageWord } from './page-words';

/** The state colours without the text colour: the overlay draws no text. */
const OVERLAY_CLASSES = Object.fromEntries(
  Object.entries(stateClasses).map(([state, classes]) => [
    state,
    classes
      .split(' ')
      .filter((name) => !name.startsWith('text-') && !name.startsWith('opacity-'))
      .join(' '),
  ]),
) as Record<WordState, string>;

export interface WordOverlayProps {
  page: number;
  words: PageWord[];
  pack: LanguageConfig;
  knownWordsMap: Map<string, WordState>;
  /** Glosses shown on hover. Null when off. */
  hoverGlosses: Map<string, string> | null;
  selection: { page: number; from: number; to: number } | null;
  onWordClick: (word: string, sentence: string) => void;
  onSelect: (selection: { page: number; from: number; to: number } | null) => void;
  /** A click between words: ends the selection. */
  onDismiss: () => void;
}

/** The word index under the point, only when that word belongs to `overlay`. */
function indexAt(overlay: HTMLElement | null, x: number, y: number): number | null {
  const element = document.elementFromPoint(x, y);
  if (!(element instanceof HTMLElement) || !overlay?.contains(element)) return null;
  const value = element.dataset.pdfWord;
  return value === undefined ? null : Number(value);
}

function WordOverlay({
  page,
  words,
  pack,
  knownWordsMap,
  hoverGlosses,
  selection,
  onWordClick,
  onSelect,
  onDismiss,
}: WordOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  /** `anchor` is null while a drag that began between words has not reached a word yet. */
  const drag = useRef<{ anchor: number | null; last: number; moved: boolean } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const joiner = pack.script.kind === 'cjk-unspaced' ? '' : ' ';

  const finish = useCallback(
    (from: number, to: number) => {
      const [start, end] = from <= to ? [from, to] : [to, from];
      onSelect({ page, from: start, to: end });
      const phrase = words
        .slice(start, end + 1)
        .map((word) => word.text)
        .join(joiner);
      const head = words[start].sentence;
      const tail = words[end].sentence;
      onWordClick(phrase, head === tail ? head : `${head} ${tail}`);
    },
    [joiner, onSelect, onWordClick, page, words],
  );

  const hoveredWord = hovered !== null ? words[hovered] : undefined;
  const hoveredText =
    hoveredWord && hoverGlosses
      ? lookupByVocabKeys(hoverGlosses, hoveredWord.text, pack)
      : undefined;
  const hoveredGloss =
    hoveredWord && hoveredText && hoveredWord.rects[0]
      ? { gloss: hoveredText, rect: hoveredWord.rects[0] }
      : null;

  const selected = (index: number) =>
    selection !== null &&
    selection.page === page &&
    index >= selection.from &&
    index <= selection.to;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 cursor-text select-none"
      data-testid={`pdf-word-overlay-${page}`}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.button !== 0 || event.pointerType === 'touch') return;
        if (event.ctrlKey || event.metaKey) return;
        drag.current = { anchor: null, last: -1, moved: true };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const state = drag.current;
        if (!state || event.pointerType === 'touch') return;
        const index = indexAt(overlayRef.current, event.clientX, event.clientY);
        if (index === null) return;
        if (state.anchor === null) state.anchor = index;
        if (index === state.last) return;
        state.last = index;
        if (index !== state.anchor) state.moved = true;
        const [from, to] = index < state.anchor ? [index, state.anchor] : [state.anchor, index];
        onSelect({ page, from, to });
      }}
      onPointerUp={(event) => {
        const state = drag.current;
        drag.current = null;
        if (!state) return;
        if (state.anchor === null) {
          onDismiss();
          return;
        }
        const index = state.moved
          ? indexAt(overlayRef.current, event.clientX, event.clientY)
          : state.anchor;
        finish(state.anchor, index ?? (state.last >= 0 ? state.last : state.anchor));
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onPointerLeave={() => {
        setHovered(null);
      }}
    >
      {words.map((word, index) => {
        const state = lookupByVocabKeys(knownWordsMap, word.text, pack) ?? 'new';
        const isSelected = selected(index);
        return word.rects.map((rect, part) => (
          <span
            key={`${index}-${part}`}
            role={part === 0 ? 'button' : undefined}
            tabIndex={part === 0 ? 0 : -1}
            aria-label={part === 0 ? `Look up ${word.text}` : undefined}
            data-pdf-word={index}
            data-testid={part === 0 ? 'pdf-word' : undefined}
            data-reader-word={word.text}
            data-word-state={state}
            data-selected={isSelected || undefined}
            onPointerDown={(event) => {
              if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
              drag.current = { anchor: index, last: index, moved: false };
              if (event.pointerType !== 'touch') {
                overlayRef.current?.setPointerCapture(event.pointerId);
              }
            }}
            onPointerEnter={hoverGlosses ? () => setHovered(index) : undefined}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              finish(index, index);
            }}
            className={`absolute cursor-pointer rounded-[3px] mix-blend-multiply dark:opacity-45 dark:mix-blend-normal ${
              OVERLAY_CLASSES[state]
            } ${isSelected ? 'ring-2 ring-ring' : 'hover:ring-2 hover:ring-ring/50'}`}
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
            }}
          />
        ));
      })}
      {hoveredGloss && (
        <span
          data-testid="pdf-hover-gloss"
          className="pointer-events-none absolute z-20 -translate-y-full rounded-md border border-border bg-popover px-2 py-0.5 font-sans text-xs whitespace-nowrap text-popover-foreground shadow-md"
          style={{
            left: `${hoveredGloss.rect.x * 100}%`,
            top: `calc(${hoveredGloss.rect.y * 100}% - 4px)`,
          }}
        >
          {hoveredGloss.gloss}
        </span>
      )}
    </div>
  );
}

export default memo(WordOverlay);
