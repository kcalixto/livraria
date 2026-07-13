import { describe, expect, it } from 'vitest';
import { csvEscape } from './csv';

describe('csvEscape', () => {
  it('escapa separador, aspas e quebra de linha', () => {
    expect(csvEscape('a;b')).toBe('"a;b"');
    expect(csvEscape('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvEscape('a\nb')).toBe('"a\nb"');
    expect(csvEscape('simples')).toBe('simples');
  });

  it("neutraliza fórmulas do Excel (=, +, -, @) com apóstrofo", () => {
    expect(csvEscape('=cmd|calc!A1')).toBe("'=cmd|calc!A1");
    expect(csvEscape('+55 11 98888')).toBe("'+55 11 98888");
    expect(csvEscape('-2+3')).toBe("'-2+3");
    expect(csvEscape('@SUM(A1)')).toBe("'@SUM(A1)");
    // fórmula com separador: apóstrofo E aspas
    expect(csvEscape('=1;2')).toBe('"\'=1;2"');
  });
});
