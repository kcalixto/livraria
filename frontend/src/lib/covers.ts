const STAGE = import.meta.env.VITE_STAGE as string;

export function bookCoverPath(bookId: string): string {
  return `/images/${bookId}.jpg`;
}
