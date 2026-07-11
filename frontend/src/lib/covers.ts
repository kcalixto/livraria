// Capas moram em frontend/public/images/<id>.jpg e são servidas junto do
// site (mesma origem) — sem bucket de assets.
export function bookCoverPath(bookId: string): string {
  return `/images/${bookId}.jpg`;
}
