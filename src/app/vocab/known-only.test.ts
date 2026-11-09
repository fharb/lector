import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLanguageConfig } from '@/lib/languages';
import type { VocabEntry, WordState } from '@/types';

const api = vi.hoisted(() => ({
  bulkUpdateWordStates: vi.fn(async () => {}),
  getVocabMeanings: vi.fn(async () => new Map([['дом', 'house']])),
  removeKnownWords: vi.fn(async () => {}),
  saveVocab: vi.fn(async (): Promise<string | null> => 'id'),
  updateVocabState: vi.fn(async () => true),
}));
vi.mock('@/lib/data-layer', () => api);

const { setListEntriesState, withKnownOnlyEntries } = await import('./known-only');

const ru = getLanguageConfig('ru');
const entry = (text: string, extra: Partial<VocabEntry> = {}): VocabEntry => ({
  id: text,
  text,
  type: 'word',
  sentence: '',
  translation: '',
  state: 'known',
  stateUpdatedAt: new Date(0),
  reviewCount: 0,
  createdAt: new Date(0),
  pushedToAnki: false,
  ...extra,
});
const states = (pairs: Array<[string, WordState]>) => new Map(pairs);

describe('withKnownOnlyEntries', () => {
  it('adds a row for a rated word without a vocab entry', () => {
    const rows = withKnownOnlyEntries([], states([['дом', 'known']]), ru);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ text: 'дом', state: 'known', knownOnly: true });
  });

  it('does not repeat a word that already has an entry', () => {
    const rows = withKnownOnlyEntries([entry('Дом')], states([['дом', 'known']]), ru);
    expect(rows).toHaveLength(1);
    expect(rows[0].knownOnly).toBeUndefined();
  });

  it('leaves out a number', () => {
    expect(withKnownOnlyEntries([], states([['2018', 'known']]), ru)).toEqual([]);
  });

  it('leaves out a word in the new state', () => {
    expect(withKnownOnlyEntries([], states([['дом', 'new']]), ru)).toEqual([]);
  });
});

describe('setListEntriesState', () => {
  const knownOnly = entry('дом', { id: 'known-only:дом', knownOnly: true });

  beforeEach(() => vi.clearAllMocks());

  it('updates a saved entry by its id', async () => {
    await setListEntriesState([entry('кот')], 'level2');
    expect(api.updateVocabState).toHaveBeenCalledWith('кот', 'level2');
    expect(api.saveVocab).not.toHaveBeenCalled();
  });

  it('removes a known-only word when it becomes unknown', async () => {
    await setListEntriesState([knownOnly], 'new');
    expect(api.removeKnownWords).toHaveBeenCalledWith(['дом']);
  });

  it('creates an entry with the dictionary meaning when it becomes learning', async () => {
    await setListEntriesState([knownOnly], 'level1');
    expect(api.saveVocab).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'дом', translation: 'house', state: 'level1' }),
    );
  });

  it('keeps a known-only word in the small table when it stays known or ignored', async () => {
    await setListEntriesState([knownOnly], 'ignored');
    expect(api.bulkUpdateWordStates).toHaveBeenCalledWith([{ word: 'дом', state: 'ignored' }]);
    expect(api.saveVocab).not.toHaveBeenCalled();
  });

  it('reports a failed save', async () => {
    api.saveVocab.mockResolvedValueOnce(null);
    await expect(setListEntriesState([knownOnly], 'level1')).rejects.toThrow('дом');
  });
});
