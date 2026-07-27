import { describe, expect, it } from 'vitest';
import { SITE_PATH, siteBasename } from './basename';

describe('siteBasename', () => {
  it('usa o caminho do coletivo quando a URL está sob ele', () => {
    expect(siteBasename('/manoel-lisboa')).toBe(SITE_PATH);
    expect(siteBasename('/manoel-lisboa/')).toBe(SITE_PATH);
    expect(siteBasename('/manoel-lisboa/carrinho')).toBe(SITE_PATH);
    expect(siteBasename('/manoel-lisboa/backoffice/pedidos')).toBe(SITE_PATH);
  });

  it('serve na raiz fora do caminho (S3 legado e dev local)', () => {
    expect(siteBasename('/')).toBe('/');
    expect(siteBasename('/carrinho')).toBe('/');
    expect(siteBasename('/backoffice/pedidos')).toBe('/');
  });

  it('não confunde caminho que só começa parecido', () => {
    expect(siteBasename('/manoel-lisboa-velho')).toBe('/');
  });
});
