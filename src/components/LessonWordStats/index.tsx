import {
  wordStatPercents,
  type LessonWordStats as Stats,
} from '@/components/MarkdownReader/remaining-words';

/** The share of the lesson's different words that are known, learning and new. */
export default function LessonWordStats({ stats }: { stats: Stats }) {
  if (stats.total === 0) return null;
  const percents = wordStatPercents(stats);
  const summary = `${stats.known} known, ${stats.learning} learning, ${stats.new} new of ${stats.total} different words`;
  return (
    <div
      data-testid="lesson-word-stats"
      title={summary}
      className="flex items-center gap-1 px-1 text-xs whitespace-nowrap text-muted-foreground"
    >
      <span className="tabular-nums" data-testid="lesson-known-percent">
        {percents.known}% known
      </span>
      <span className="hidden tabular-nums lg:inline">
        · {percents.learning}% learning · {percents.new}% new
      </span>
    </div>
  );
}
