import { describe, expect, it } from 'vitest';
import { MAX_SLUG_LENGTH, slugify } from './slug';

describe('slugify', () => {
  it('remove acentos e cedilha, mantendo a palavra legível', () => {
    expect(slugify('Educação e Ação')).toBe('educacao-e-acao');
    expect(slugify('Ação, Coração & Açúcar')).toBe('acao-coracao-acucar');
    expect(slugify('Café/Chá')).toBe('cafe-cha');
  });

  it('baixa a caixa e troca pontuação e símbolos por hífen', () => {
    expect(slugify('MARX — O CAPITAL')).toBe('marx-o-capital');
    expect(slugify('“Aspas curvas” e ‘simples’')).toBe('aspas-curvas-e-simples');
    expect(slugify('O Capital, Vol. II (1867)')).toBe('o-capital-vol-ii-1867');
  });

  it('colapsa espaços repetidos e apara hífens das bordas', () => {
    expect(slugify('  espaços   demais  ')).toBe('espacos-demais');
    expect(slugify('-- bordas --')).toBe('bordas');
  });

  it('preserva dígitos', () => {
    expect(slugify('Livro 2')).toBe('livro-2');
  });

  it('cai no fallback quando não sobra nada aproveitável', () => {
    expect(slugify('!!!???')).toBe('livro');
    expect(slugify('   ')).toBe('livro');
  });

  it('trunca no teto cortando em palavra inteira', () => {
    const longo =
      'Manifesto do Partido Comunista seguido da Crítica da Economia Política e outros ensaios';
    const slug = slugify(longo);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug).toBe('manifesto-do-partido-comunista-seguido-da-critica-da');
    expect(slug.endsWith('-')).toBe(false);
  });

  it('trunca no teto mesmo sem espaço onde cortar', () => {
    const slug = slugify('a'.repeat(73));
    expect(slug).toHaveLength(MAX_SLUG_LENGTH);
  });

  it('é idempotente: reslugificar não muda o resultado', () => {
    for (const title of ['Educação e Ação', 'O Capital, Vol. II (1867)', '!!!???']) {
      expect(slugify(slugify(title))).toBe(slugify(title));
    }
  });

  // limitação conhecida: ß/æ/ø não decompõem em NFD e viram hífen. Aceitável em
  // pt-BR; o dia que doer, é um mapa de substituição de poucas linhas.
  it('documenta que letras sem decomposição NFD caem no fallback', () => {
    expect(slugify('ß æ ø')).toBe('livro');
  });

  // o script de migração é .mjs e não consegue importar este módulo TS, então
  // carrega uma cópia da função. Este teste é o que impede as duas de divergirem.
  it('a cópia dentro de scripts/backfill-slug.mjs produz o mesmo resultado', async () => {
    // @ts-expect-error script .mjs de migração não tem tipos — é justamente a cópia sob teste
    const { slugify: copia } = await import('../../scripts/backfill-slug.mjs');
    const titulos = [
      'Educação e Ação',
      'O Capital, Vol. II (1867)',
      '“Aspas curvas” e ‘simples’',
      '  espaços   demais  ',
      '!!!???',
      'Manifesto do Partido Comunista seguido da Crítica da Economia Política e outros ensaios',
      'a'.repeat(73),
    ];
    for (const titulo of titulos) {
      expect(copia(titulo)).toBe(slugify(titulo));
    }
  });
});
