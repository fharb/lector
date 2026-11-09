import { describe, expect, it } from 'vitest';
import { patchWordState, patchWordStates } from './optimistic-word-state';

describe('patchWordStates', () => {
  it('patches every word without changing the source map', () => {
    const source = new Map([['son', 'new' as const]]);
    const patch = patchWordStates(source, ['son', 'maan'], 'known');

    expect(source.get('son')).toBe('new');
    expect(patch.map.get('son')).toBe('known');
    expect(patch.map.get('maan')).toBe('known');
  });

  it('restores new rows and removes added rows after a failed write', () => {
    const patch = patchWordStates(new Map([['son', 'new' as const]]), ['son', 'maan'], 'known');
    const restored = patch.rollback(patch.map);

    expect(restored.get('son')).toBe('new');
    expect(restored.has('maan')).toBe(false);
  });

  it('keeps a word that changed after the patch', () => {
    const patch = patchWordStates(new Map(), ['son', 'maan'], 'known');
    const latest = patchWordState(patch.map, 'son', 'level2').map;
    const restored = patch.rollback(latest);

    expect(restored.get('son')).toBe('level2');
    expect(restored.has('maan')).toBe(false);
  });

  it('returns the same map when there is nothing to restore', () => {
    const patch = patchWordStates(new Map(), ['son'], 'known');
    const latest = patchWordState(patch.map, 'son', 'level2').map;

    expect(patch.rollback(latest)).toBe(latest);
  });
});

describe('patchWordState', () => {
  it('patches one word without changing the source map', () => {
    const source = new Map([['son', 'new' as const]]);
    const patch = patchWordState(source, 'son', 'known');

    expect(source.get('son')).toBe('new');
    expect(patch.map.get('son')).toBe('known');
  });

  it('restores the previous state after a failed write', () => {
    const patch = patchWordState(new Map([['son', 'level2' as const]]), 'son', 'ignored');

    expect(patch.rollback(patch.map).get('son')).toBe('level2');
  });

  it('removes a newly added state after a failed write', () => {
    const patch = patchWordState(new Map(), 'son', 'known');

    expect(patch.rollback(patch.map).has('son')).toBe(false);
  });

  it('does not let an older failure undo a newer choice', () => {
    const first = patchWordState(new Map(), 'son', 'level1');
    const second = patchWordState(first.map, 'son', 'level2');

    expect(first.rollback(second.map)).toBe(second.map);
    expect(first.rollback(second.map).get('son')).toBe('level2');
  });
});
