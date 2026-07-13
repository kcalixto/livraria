import { describe, expect, it } from 'vitest';
import { formatOrderDate } from './order-status';

describe('formatOrderDate', () => {
  it('ano corrente: dd/mm · Hh', () => {
    const year = new Date().getFullYear();
    expect(formatOrderDate(`${year}-07-01T10:00:00.000Z`)).toMatch(
      /^01\/07 · \d{1,2}h$/,
    );
  });

  it('ano diferente do corrente inclui /aa (Vendas históricas sem ambiguidade)', () => {
    expect(formatOrderDate('2024-03-15T10:00:00.000Z')).toMatch(
      /^15\/03\/24 · \d{1,2}h$/,
    );
  });
});
