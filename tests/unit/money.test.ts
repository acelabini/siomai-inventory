import { describe, expect, it } from 'vitest';
import { centavosToPesos, pesosToCentavos } from '../../src/main/domain/money';

describe('PHP money conversion', () => {
  it('parses peso strings directly into integer centavos', () => {
    expect(pesosToCentavos('0')).toBe(0);
    expect(pesosToCentavos('66')).toBe(6600);
    expect(pesosToCentavos('66.6')).toBe(6660);
    expect(pesosToCentavos('66.66')).toBe(6666);
  });
  it('formats centavo rounding boundaries as two decimal places', () => {
    expect(centavosToPesos(0)).toBe('0.00');
    expect(centavosToPesos(1)).toBe('0.01');
    expect(centavosToPesos(99)).toBe('0.99');
    expect(centavosToPesos(100)).toBe('1.00');
  });
  it('rejects input with more than two currency decimals', () => {
    expect(() => pesosToCentavos('1.005')).toThrow(/two decimal/i);
  });
  it('rejects malformed, negative, and unsafe money values', () => {
    for (const value of ['-1.00', '1.', '.50', '1e2', 'NaN', '90071992547409.92']) {
      expect(() => pesosToCentavos(value)).toThrow();
    }
    expect(() => centavosToPesos(-1)).toThrow();
    expect(() => centavosToPesos(1.5)).toThrow();
  });
});
