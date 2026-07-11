// Capas moram em frontend/public/images/<stage>/<id>.jpg e são servidas
// junto do site (mesma origem) — sem bucket de assets.
export const STAGE = import.meta.env.VITE_STAGE as string;

export function bookCoverPath(stage: string, bookId: string): string {
  return `/images/${stage}/${bookId}.jpg`;
}
