import type { LanguageConfig } from '@/lib/languages';

/**
 * The translations of a paragraph's learning words. `beside` draws them in the right margin,
 * out of flow, so the text keeps its place. The scroll container sets `--side-gloss-width`.
 */
export default function SideGlosses({
  items,
  pack,
  beside,
}: {
  items: { key: string; word: string; gloss: string }[];
  pack: LanguageConfig;
  beside: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul
      data-testid="side-glosses"
      className={`space-y-1 border-l-2 border-[var(--clay)]/40 pl-3 font-sans text-[0.8em] leading-snug ${
        beside
          ? 'absolute top-0 bottom-0 left-full ml-6 w-[var(--side-gloss-width)] overflow-y-auto'
          : 'mt-2 mb-4'
      }`}
    >
      {items.map((item) => (
        <li key={item.key} data-testid="side-gloss">
          <span lang={pack.script.bcp47} className="font-semibold text-foreground">
            {item.word}
          </span>{' '}
          <span className="text-muted-foreground">{item.gloss}</span>
        </li>
      ))}
    </ul>
  );
}
