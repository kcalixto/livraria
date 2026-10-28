// Slug do livro: nome do arquivo da capa (public/images/<stage>/<slug>.jpg) e
// identificador legível na listagem do backoffice. Charset restrito a
// [a-z0-9-] de propósito — vira chave de S3 e path de CloudFront sem encoding.
export const MAX_SLUG_LENGTH = 60;
const FALLBACK_SLUG = 'livro';
export function slugify(text) {
    const base = text
        .normalize('NFD') // ç -> c + cedilha combinante; ã -> a + til
        .replace(/[̀-ͯ]/g, '') // remove os diacríticos soltos
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') // pontuação, aspas, espaços e símbolos
        .replace(/^-+|-+$/g, '');
    if (!base)
        return FALLBACK_SLUG; // título só com símbolos/emoji
    if (base.length <= MAX_SLUG_LENGTH)
        return base;
    // corta na última palavra inteira que cabe (evita "...economia-politic")
    const cut = base.slice(0, MAX_SLUG_LENGTH + 1);
    const lastDash = cut.lastIndexOf('-');
    const truncated = lastDash > 0 ? cut.slice(0, lastDash) : base.slice(0, MAX_SLUG_LENGTH);
    return truncated.replace(/-+$/, '');
}
