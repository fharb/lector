'use client';

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { ArrowLeft, LoaderCircle, Minus, Plus, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { lessonPdfUrl, updateLessonProgress } from '@/lib/data-layer';
import { lectorMode } from '@/lib/api-base';
import { makeWordSegmentation, type LanguageConfig, type WordSegmentation } from '@/lib/languages';
import { createTrailingThrottle } from '@/components/MarkdownReader/throttle';
import { parseSegmentWords } from '@/components/MarkdownReader/utils';
import SideGlosses from '@/components/MarkdownReader/SideGlosses';
import type { GlossMode } from '@/components/MarkdownReader/word-glosses';
import type { Lesson, PdfSourceMeta, WordState } from '@/types';
import { loadPdfjs, readOutline, type OutlineEntry } from './pdfjs';
import { PageJump, PdfContents } from './PdfNavigation';
import { layoutPage, toPageItems, type PageLayout } from './page-words';
import { pdfStatusLabel } from './status';
import WordOverlay from './WordOverlay';
import { pageSideGlosses, stackSideGlosses, type SideGloss } from './side-glosses';

const ZOOM_KEY = 'lector-pdf-zoom';
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.2;
const MAX_PAGE_WIDTH = 920;
const SIDE_WIDTH = 240;
const SIDE_GAP = 24;
/** One line of text-xs with leading-[18px]. */
const SIDE_ROW_PX = 18;
/** Side glosses go beside the page only when the page keeps at least this width. */
const MIN_PAGE_WITH_SIDE = 560;
const GUTTER = 32;
const NO_SIDE: SideGloss[] = [];

type Selection = { page: number; from: number; to: number } | null;

let measureContext: CanvasRenderingContext2D | null | undefined;
function measureText(text: string): number {
  if (measureContext === undefined) {
    measureContext = document.createElement('canvas').getContext('2d');
    if (measureContext) measureContext.font = '16px sans-serif';
  }
  return measureContext ? measureContext.measureText(text).width : text.length;
}

/** "3, 7 and 12", or "3, 7, 12 and 9 more" for a long list. */
function pageList(pages: number[]): string {
  const shown = pages.slice(0, 5);
  const rest = pages.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  return shown.length === 1
    ? String(shown[0])
    : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
}

function readZoom(): number {
  try {
    const saved = Number(localStorage.getItem(ZOOM_KEY));
    if (saved >= MIN_ZOOM && saved <= MAX_ZOOM) return saved;
  } catch {
    /* storage unavailable */
  }
  return 1;
}

export function parsePdfMeta(lesson: Pick<Lesson, 'sourceMeta'>): PdfSourceMeta | null {
  try {
    const parsed = lesson.sourceMeta ? JSON.parse(lesson.sourceMeta) : null;
    return parsed && typeof parsed === 'object' ? (parsed as PdfSourceMeta) : null;
  } catch {
    return null;
  }
}

/** The screen while the PDF job runs or after it failed. */
export function PdfStatusScreen({
  lesson,
  onRetry,
  onBack,
}: {
  lesson: Lesson;
  onRetry: () => void;
  onBack: () => void;
}) {
  if (lesson.pdfStatus === 'failed') {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-card p-8"
        data-testid="pdf-failed"
      >
        <div className="text-xl text-destructive">The PDF could not be read</div>
        {lesson.pdfError && (
          <p className="max-w-md text-center text-sm text-muted-foreground">{lesson.pdfError}</p>
        )}
        <div className="flex gap-2">
          <Button onClick={onRetry} data-testid="retry-pdf">
            Retry
          </Button>
          <Button variant="secondary" onClick={onBack}>
            Back to Library
          </Button>
        </div>
      </div>
    );
  }
  const textMode = parsePdfMeta(lesson)?.mode === 'text';
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-card p-8"
      data-testid="pdf-pending"
    >
      <LoaderCircle className="h-8 w-8 animate-spin text-muted-foreground" />
      <div className="text-xl text-foreground" data-testid="pdf-status">
        {pdfStatusLabel(lesson.pdfStatus)}
      </div>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        &ldquo;{lesson.title}&rdquo; is being prepared on the server.{' '}
        {textMode
          ? 'Its text becomes normal lessons when it is ready.'
          : 'The pages open automatically when they are ready.'}
      </p>
      <Button variant="secondary" onClick={onBack}>
        Back to Library
      </Button>
    </div>
  );
}

interface PdfPageProps {
  doc: PDFDocumentProxy;
  page: number;
  width: number;
  fallbackRatio: number;
  near: boolean;
  layout: PageLayout | undefined;
  pack: LanguageConfig;
  segmentation: WordSegmentation | null;
  knownWordsMap: Map<string, WordState>;
  hoverGlosses: Map<string, string> | null;
  selection: Selection;
  sideItems: SideGloss[];
  sideBeside: boolean;
  onLayout: (page: number, layout: PageLayout) => void;
  onWordClick: (word: string, sentence: string) => void;
  onSelect: (selection: Selection) => void;
  onDismiss: () => void;
}

const PdfPage = memo(function PdfPage({
  doc,
  page,
  width,
  fallbackRatio,
  near,
  layout,
  pack,
  segmentation,
  knownWordsMap,
  hoverGlosses,
  selection,
  sideItems,
  sideBeside,
  onLayout,
  onWordClick,
  onSelect,
  onDismiss,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const hasLayoutRef = useRef(layout !== undefined);
  useLayoutEffect(() => {
    hasLayoutRef.current = layout !== undefined;
  }, [layout]);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    void (async () => {
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      if (!hasLayoutRef.current) {
        const content = await pdfPage.getTextContent();
        if (cancelled) return;
        const items = toPageItems(
          content.items,
          base.transform,
          (font) => (font && content.styles[font]?.ascent) || 0.8,
        );
        onLayout(page, layoutPage(items, base, pack, { measure: measureText, segmentation }));
      }
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: (width / base.width) * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      renderTask = pdfPage.render({ canvas, viewport });
      await renderTask.promise;
    })().catch((err: unknown) => {
      if (cancelled || (err instanceof Error && err.name === 'RenderingCancelledException')) return;
      console.error(`PDF page ${page} failed to render`, err);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, near, onLayout, pack, page, segmentation, width]);

  const height = width * (ratio ?? fallbackRatio);
  const side =
    sideItems.length === 0 ? null : sideBeside ? (
      <aside
        className="absolute top-0 border-l-2 border-[var(--clay)]/40 font-sans"
        style={{ left: `calc(100% + ${SIDE_GAP}px)`, width: SIDE_WIDTH, height }}
        data-testid={`pdf-side-glosses-${page}`}
      >
        <ul>
          {stackSideGlosses(sideItems, height, SIDE_ROW_PX).map((item) => (
            <li
              key={item.key}
              data-testid="side-gloss"
              title={`${item.word} ${item.gloss}`}
              className="absolute right-0 left-0 truncate pl-3 text-xs leading-[18px]"
              style={{ top: item.top, height: SIDE_ROW_PX }}
            >
              <span lang={pack.script.bcp47} className="font-semibold text-foreground">
                {item.word}
              </span>{' '}
              <span className="text-muted-foreground">{item.gloss}</span>
            </li>
          ))}
        </ul>
      </aside>
    ) : (
      <aside
        className="mt-2 w-full"
        style={{ maxWidth: width }}
        data-testid={`pdf-side-glosses-${page}`}
      >
        <SideGlosses items={sideItems} pack={pack} beside={false} />
      </aside>
    );

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex flex-col items-center">
        <div
          data-pdf-page={page}
          data-testid={`pdf-page-${page}`}
          className="relative bg-white shadow-sm ring-1 ring-border"
          style={{ width, height }}
        >
          {near && <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />}
          {near && layout && (
            <WordOverlay
              page={page}
              words={layout.words}
              pack={pack}
              knownWordsMap={knownWordsMap}
              hoverGlosses={hoverGlosses}
              selection={selection}
              onWordClick={onWordClick}
              onSelect={onSelect}
              onDismiss={onDismiss}
            />
          )}
        </div>
        <div className="py-1 text-xs text-muted-foreground">{page}</div>
        {sideBeside && side}
      </div>
      {!sideBeside && side}
    </div>
  );
});

export interface PdfReaderProps {
  lesson: Lesson;
  pack: LanguageConfig;
  knownWordsMap: Map<string, WordState>;
  glosses: Map<string, string> | null;
  glossMode: GlossMode;
  wordPanelOpen: boolean;
  onWordClick: (word: string, sentence: string) => void;
  onClose: () => void;
  /** A plain click between words: ends the marking or picks and closes the drawer. */
  onDismissSelection: () => void;
  headerAction?: ReactNode;
  /** Header controls for the page being read. `words` is null until that page has been read. */
  pageAction?: (page: number, words: string[] | null) => ReactNode;
}

export default function PdfReader({
  lesson,
  pack,
  knownWordsMap,
  glosses,
  glossMode,
  wordPanelOpen,
  onWordClick,
  onClose,
  onDismissSelection,
  headerAction,
  pageAction,
}: PdfReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ratio, setRatio] = useState(Math.SQRT2);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(readZoom);
  const [near, setNear] = useState<Set<number>>(() => new Set([1]));
  const [currentPage, setCurrentPage] = useState(() =>
    Math.max(1, lesson.progress_scrollPosition || 1),
  );
  const [layouts, setLayouts] = useState<Map<number, PageLayout>>(() => new Map());
  const [selection, setSelection] = useState<Selection>(null);
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const meta = useMemo(() => parsePdfMeta(lesson), [lesson]);
  const segmentation = useMemo(
    () => makeWordSegmentation(parseSegmentWords(lesson.segmentWords)),
    [lesson.segmentWords],
  );
  const pageCount = doc?.numPages ?? meta?.pageCount ?? 0;

  const changeZoom = useCallback((factor: number | null) => {
    setZoom((current) => {
      const next =
        factor === null
          ? 1
          : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(current * factor * 100) / 100));
      try {
        localStorage.setItem(ZOOM_KEY, String(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    loadPdfjs()
      .then(async (pdfjs) => {
        if (cancelled) return;
        const task = pdfjs.getDocument({
          url: lessonPdfUrl(lesson.id),
          withCredentials: lectorMode() === 'cloud',
          disableAutoFetch: true,
          disableStream: true,
          rangeChunkSize: 256 * 1024,
        });
        destroy = () => void task.destroy();
        const loaded = await task.promise;
        const first = await loaded.getPage(1);
        if (cancelled) return;
        const viewport = first.getViewport({ scale: 1 });
        setRatio(viewport.height / viewport.width);
        setDoc(loaded);
        const entries = await readOutline(loaded, 2);
        if (!cancelled) setOutline(entries);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('PDF failed to load', err);
          setLoadError('The PDF could not be opened.');
        }
      });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [lesson.id]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => setContainerWidth(container.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const wantsSide = glossMode === 'side' && glosses !== null;
  const available = Math.max(0, containerWidth - GUTTER);
  // The page stays centred, so the column beside it needs the same room on both sides.
  const roomBeside = available - 2 * (SIDE_WIDTH + SIDE_GAP);
  const sideBeside = wantsSide && roomBeside >= MIN_PAGE_WITH_SIDE;
  const fitWidth = Math.min(MAX_PAGE_WIDTH, sideBeside ? roomBeside : available);
  const pageWidth = Math.max(200, Math.round(fitWidth * zoom));

  useEffect(() => {
    const container = containerRef.current;
    if (!doc || !container) return;
    const elements = [...container.querySelectorAll<HTMLElement>('[data-pdf-page]')];
    const pageOf = (element: Element) => Number((element as HTMLElement).dataset.pdfPage);

    const nearObserver = new IntersectionObserver(
      (entries) => {
        setNear((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            if (entry.isIntersecting) next.add(pageOf(entry.target));
            else next.delete(pageOf(entry.target));
          }
          return next;
        });
      },
      { root: container, rootMargin: '150% 0px' },
    );
    const ratios = new Map<number, number>();
    const currentObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) ratios.set(pageOf(entry.target), entry.intersectionRatio);
        let best = 0;
        let bestRatio = 0;
        for (const [page, value] of ratios) {
          if (value > bestRatio || (value === bestRatio && value > 0 && page < best)) {
            best = page;
            bestRatio = value;
          }
        }
        if (best > 0) setCurrentPage(best);
      },
      { root: container, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    );
    for (const element of elements) {
      nearObserver.observe(element);
      currentObserver.observe(element);
    }
    return () => {
      nearObserver.disconnect();
      currentObserver.disconnect();
    };
  }, [doc, pageCount]);

  const scrollToPage = useCallback((page: number) => {
    const element = containerRef.current?.querySelector<HTMLElement>(`[data-pdf-page="${page}"]`);
    const container = containerRef.current;
    if (!element || !container) return;
    container.scrollTop =
      element.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      16;
  }, []);

  const restored = useRef(false);
  const currentPageRef = useRef(currentPage);
  useLayoutEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useLayoutEffect(() => {
    if (!doc || containerWidth === 0 || restored.current) return;
    restored.current = true;
    const saved = Math.min(Math.max(1, lesson.progress_scrollPosition || 1), doc.numPages);
    if (saved > 1) scrollToPage(saved);
  }, [containerWidth, doc, lesson.progress_scrollPosition, scrollToPage]);

  const lastWidth = useRef(pageWidth);
  useLayoutEffect(() => {
    if (lastWidth.current === pageWidth) return;
    lastWidth.current = pageWidth;
    if (restored.current) scrollToPage(currentPageRef.current);
  }, [pageWidth, scrollToPage]);

  const progressWriter = useMemo(
    () =>
      createTrailingThrottle((page: number, percent: number) => {
        void updateLessonProgress(lesson.id, { scrollPosition: page, percentComplete: percent });
      }, 1000),
    [lesson.id],
  );
  useEffect(() => () => progressWriter.flush(), [progressWriter]);
  useEffect(() => {
    if (!restored.current || pageCount === 0) return;
    progressWriter(currentPage, Math.round((currentPage / pageCount) * 100));
  }, [currentPage, pageCount, progressWriter]);

  const shownSelection = wordPanelOpen ? selection : null;

  const handleLayout = useCallback((page: number, layout: PageLayout) => {
    setLayouts((previous) => new Map(previous).set(page, layout));
  }, []);

  const hoverGlosses = glossMode === 'above' ? glosses : null;
  const sideItemsByPage = useMemo(() => {
    const result = new Map<number, SideGloss[]>();
    if (!wantsSide || !glosses) return result;
    for (const [page, layout] of layouts) {
      result.set(page, pageSideGlosses(layout.words, glosses, pack));
    }
    return result;
  }, [glosses, layouts, pack, wantsSide]);

  const pages = useMemo(() => Array.from({ length: pageCount }, (_, i) => i + 1), [pageCount]);
  const currentLayout = layouts.get(currentPage);
  const currentWords = useMemo(
    () => currentLayout?.words.map((word) => word.text) ?? null,
    [currentLayout],
  );

  return (
    <div className="flex h-full flex-col bg-card" data-testid="pdf-reader">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <button
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden sm:inline">Back</span>
        </button>
        <h1 className="mx-2 min-w-0 flex-1 truncate text-center text-sm font-medium text-foreground sm:text-lg">
          {lesson.title}
        </h1>
        <div className="flex items-center gap-1 sm:gap-2">
          <PageJump currentPage={currentPage} pageCount={pageCount} onGoToPage={scrollToPage} />
          <PdfContents entries={outline} currentPage={currentPage} onGoToPage={scrollToPage} />
          <div className="flex items-center">
            <button
              onClick={() => changeZoom(1 / ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
              title="Zoom out"
              data-testid="pdf-zoom-out"
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent disabled:opacity-40"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={() => changeZoom(null)}
              title="Fit the page width"
              data-testid="pdf-zoom-reset"
              className="hidden min-w-[3.5em] rounded-lg px-1 py-2 text-xs text-muted-foreground hover:bg-accent sm:block"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => changeZoom(ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
              title="Zoom in"
              data-testid="pdf-zoom-in"
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {pageAction?.(currentPage, currentWords)}
          {headerAction}
        </div>
      </header>

      {meta?.emptyPages && meta.emptyPages.length > 0 && (
        <p
          className="flex items-center gap-2 border-b border-border bg-muted px-4 py-1.5 text-xs text-muted-foreground"
          data-testid="pdf-empty-pages"
        >
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {meta.emptyPages.length === 1
            ? `Page ${pageList(meta.emptyPages)} has no text, so its words are not clickable.`
            : `Pages ${pageList(meta.emptyPages)} have no text, so their words are not clickable.`}
        </p>
      )}

      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-muted/40 px-4 py-4"
        data-testid="pdf-scroll"
      >
        {loadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-destructive" data-testid="pdf-load-error">
              {loadError}
            </p>
            <p className="text-sm text-muted-foreground">
              Check that the server is reachable, then reload.
            </p>
          </div>
        ) : !doc ? (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin" /> Opening the PDF…
          </div>
        ) : (
          <div className="mx-auto flex w-max min-w-full flex-col items-center gap-4">
            {pages.map((page) => (
              <PdfPage
                key={page}
                doc={doc}
                page={page}
                width={pageWidth}
                fallbackRatio={ratio}
                near={near.has(page)}
                layout={layouts.get(page)}
                pack={pack}
                segmentation={segmentation}
                knownWordsMap={knownWordsMap}
                hoverGlosses={hoverGlosses}
                selection={shownSelection?.page === page ? shownSelection : null}
                sideItems={sideItemsByPage.get(page) ?? NO_SIDE}
                sideBeside={sideBeside}
                onLayout={handleLayout}
                onWordClick={onWordClick}
                onSelect={setSelection}
                onDismiss={onDismissSelection}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
