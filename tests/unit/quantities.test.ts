import { describe, expect, it } from 'vitest';
import { describePieces, toPieces } from '../../src/shared/quantities';

describe('quantity conversion', () => {
  it('keeps piece entry as whole pieces', () => {
    expect(toPieces(7, 'piece', 66)).toBe(7);
  });
  it('converts whole and decimal pack entries exactly', () => {
    expect(toPieces(2, 'pack', 66)).toBe(132);
    expect(toPieces(0.5, 'pack', 66)).toBe(33);
    expect(toPieces(1.25, 'pack', 8)).toBe(10);
  });
  it('rejects pack quantities that produce a fraction of a piece', () => {
    expect(() => toPieces(0.1, 'pack', 3)).toThrow(/whole piece/i);
  });
  it('rejects zero, negative, non-finite, and unsafe quantities', () => {
    for (const quantity of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => toPieces(quantity, 'piece', 66)).toThrow();
    }
    expect(() => toPieces(Number.MAX_SAFE_INTEGER, 'pack', 66)).toThrow();
  });
  it('describes whole packs and the remaining pieces', () => {
    expect(describePieces(137, 66)).toEqual({ packs: 2, remainingPieces: 5 });
  });
  it('requires non-negative whole stock and a positive pack size to describe it', () => {
    expect(() => describePieces(-1, 66)).toThrow();
    expect(() => describePieces(1.5, 66)).toThrow();
    expect(() => describePieces(1, 0)).toThrow();
  });
});
