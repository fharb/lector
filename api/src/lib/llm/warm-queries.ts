import { startup, type Options, type WarmQuery } from '@anthropic-ai/claude-agent-sdk';

const WARM_IDLE_MS = 5 * 60_000;

interface WarmEntry {
  warm: Promise<WarmQuery | null>;
  idleTimer: ReturnType<typeof setTimeout>;
}

const entries = new Map<string, WarmEntry>();

async function closeWhenStarted(warm: Promise<WarmQuery | null>): Promise<void> {
  (await warm)?.close();
}

function startWarmQuery(key: string, options: Options): void {
  const warm = startup({ options }).catch((err) => {
    console.warn('Could not start a Claude Code process in advance:', err);
    return null;
  });
  const idleTimer = setTimeout(() => {
    if (entries.get(key)?.warm === warm) entries.delete(key);
    void closeWhenStarted(warm);
  }, WARM_IDLE_MS);
  idleTimer.unref?.();
  entries.set(key, { warm, idleTimer });
}

/**
 * Hands over the ready process for these options, if there is one, and starts its
 * replacement. A WarmQuery runs one prompt, so the caller must not reuse it.
 */
export async function takeWarmQuery(options: Options): Promise<WarmQuery | null> {
  if (process.env.LLM_WARM_PROCESS === '0') return null;
  const key = JSON.stringify([
    options.model,
    options.thinking,
    options.env?.CLAUDE_CODE_OAUTH_TOKEN,
  ]);
  const entry = entries.get(key);
  if (entry) clearTimeout(entry.idleTimer);
  startWarmQuery(key, options);
  return entry ? entry.warm : null;
}

export async function closeWarmQueries(): Promise<void> {
  const closing = [...entries.values()].map((entry) => {
    clearTimeout(entry.idleTimer);
    return closeWhenStarted(entry.warm);
  });
  entries.clear();
  await Promise.all(closing);
}
