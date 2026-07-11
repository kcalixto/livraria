import { describe, expect, it } from 'vitest';
import { bookCoverPath } from './covers';

describe('bookCoverPath', () => {
  it('monta o caminho relativo da capa por id', () => {
    expect(bookCoverPath('47aeb72f-5448-4859-b6b0-13b7079e095f')).toBe(
      '/images/47aeb72f-5448-4859-b6b0-13b7079e095f.jpg',
    );
  });
});
