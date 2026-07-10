import { describe, expect, it } from 'vitest';
import { buildMeta, formatOrderCode, formatPrice, splitParagraphs } from './format';

describe('formatPrice', () => {
  it('formata centavos como R$ pt-BR', () => {
    expect(formatPrice(4200)).toBe('R$ 42,00');
    expect(formatPrice(4990)).toBe('R$ 49,90');
    expect(formatPrice(0)).toBe('R$ 0,00');
  });
});

describe('formatOrderCode', () => {
  it('apresenta código de 6 caracteres com hífen no meio', () => {
    expect(formatOrderCode('AJ3C9K')).toBe('AJ3-C9K');
  });

  it('mantém códigos fora do padrão (ex.: uuid antigo) como estão', () => {
    expect(formatOrderCode('bd1ef38d-f45e-472e-8964-0a561811b45d')).toBe(
      'bd1ef38d-f45e-472e-8964-0a561811b45d',
    );
  });
});

describe('splitParagraphs', () => {
  it('divide a descrição em parágrafos por linha em branco', () => {
    expect(splitParagraphs('Par 1.\n\nPar 2.\n\nPar 3.')).toEqual([
      'Par 1.',
      'Par 2.',
      'Par 3.',
    ]);
  });

  it('ignora espaços extras e parágrafos vazios', () => {
    expect(splitParagraphs('A.\n\n\n\n B. ')).toEqual(['A.', 'B.']);
  });
});

describe('buildMeta', () => {
  it('monta a linha de metadados com os campos presentes', () => {
    expect(
      buildMeta({ format: 'Ensaio', edition: '2ª edição', year: 2023, pages: 288 }),
    ).toBe('Ensaio · 2ª edição · 2023 · 288 págs');
  });

  it('omite campos ausentes', () => {
    expect(buildMeta({ year: 2024 })).toBe('2024');
    expect(buildMeta({})).toBe('');
  });
});
