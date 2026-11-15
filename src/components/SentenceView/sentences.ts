import { fromMarkdown } from 'mdast-util-from-markdown';
import { splitSentences, type LanguageConfig } from '@/lib/languages';

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
}

const TEXT_BLOCKS = new Set(['paragraph', 'heading', 'tableCell']);

function blockText(node: MarkdownNode): string {
  if (typeof node.value === 'string') return node.value;
  return node.children?.map(blockText).join('') ?? '';
}

/** The lesson's sentences in reading order. Code blocks and markup stay out. */
export function lessonSentences(markdown: string, pack: LanguageConfig): string[] {
  const sentences: string[] = [];
  const visit = (node: MarkdownNode) => {
    if (!TEXT_BLOCKS.has(node.type)) {
      node.children?.forEach(visit);
      return;
    }
    const text = blockText(node).replace(/\s+/g, ' ');
    for (const sentence of splitSentences(text, pack)) {
      if (sentence.trim()) sentences.push(sentence.trim());
    }
  };
  visit(fromMarkdown(markdown));
  return sentences;
}
