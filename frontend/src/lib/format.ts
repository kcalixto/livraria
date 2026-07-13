const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatPrice(cents: number): string {
  // Intl usa espaço não separável (U+00A0/U+202F); normaliza para espaço comum
  return brl.format(cents / 100).replace(/[\u00a0\u202f]/g, ' ');
}

// busca acento-insensível (reusada nas telas do backoffice)
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function centsToText(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function textToCents(text: string): number | null {
  let normalized = text.trim();
  if (!normalized) return null;
  // com vírgula, pontos são separador de milhar; sem vírgula, ponto é decimal
  if (normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}

// Código de pedido de 6 alfanuméricos vira "AJ3-C9K" pra leitura; outros
// formatos (ex.: uuid de pedidos antigos) passam intactos.
export function formatOrderCode(code: string): string {
  if (!/^[A-Z0-9]{6}$/.test(code)) return code;
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function splitParagraphs(description: string): string[] {
  if (!description) return [];
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
