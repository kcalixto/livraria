import { describe, expect, it } from 'vitest';
import { BOOK_STATUS_AVAILABLE, mockAmount } from './stock-mock';

describe('mockAmount', () => {
  it('retorna inteiro entre 0 e 10', () => {
    for (let i = 0; i < 200; i++) {
      const n = mockAmount();
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(10);
    }
  });

  it('produz valores variados (0 e >0) ao longo de muitas chamadas', () => {
    const values = new Set<number>();
    for (let i = 0; i < 500; i++) values.add(mockAmount());
    expect(values.has(0)).toBe(true);
    expect([...values].some((v) => v > 0)).toBe(true);
  });
});

describe('BOOK_STATUS_AVAILABLE', () => {
  it('é a string "disponível"', () => {
    expect(BOOK_STATUS_AVAILABLE).toBe('disponível');
  });
});
