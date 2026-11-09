import fs from 'fs';
import path from 'path';

const LANGUAGES_DIR = path.resolve(import.meta.dir, '../../../languages');
const loaded = new Map<string, Map<string, string>>();

export function basePreferencesPath(language: string): string {
  return path.join(LANGUAGES_DIR, language, 'content', 'base-preferences.json');
}

function preferencesFor(language: string): Map<string, string> {
  const cached = loaded.get(language);
  if (cached) return cached;
  let preferences = new Map<string, string>();
  try {
    const stored = JSON.parse(fs.readFileSync(basePreferencesPath(language), 'utf-8'));
    preferences = new Map(Object.entries(stored as Record<string, string>));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[dictionary] base preferences unreadable for ${language}:`, err);
    }
  }
  loaded.set(language, preferences);
  return preferences;
}

/** The base word to offer first for an ambiguous form, when one has been chosen in advance. */
export function preferredBase(language: string, form: string): string | undefined {
  return preferencesFor(language).get(form);
}
