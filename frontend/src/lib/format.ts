const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatPrice(cents: number): string {
  // Intl usa espaço não separável (U+00A0/U+202F); normaliza para espaço comum
  return brl.format(cents / 100).replace(/[\u00a0\u202f]/g, ' ');
}

export function splitParagraphs(description: string): string[] {
  return description
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function buildMeta(book: {
  format?: string;
  edition?: string;
  year?: number;
  pages?: number;
}): string {
  const parts = [
    book.format,
    book.edition,
    book.year !== undefined ? String(book.year) : undefined,
    book.pages !== undefined ? `${book.pages} págs` : undefined,
  ];
  return parts.filter(Boolean).join(' · ');
}
