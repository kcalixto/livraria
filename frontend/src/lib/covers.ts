const STAGE = import.meta.env.VITE_STAGE as string;

// A capa é nomeada pelo slug do livro (não pelo id): arquivo legível no repo.
// Quem não tem slug (livro ainda não migrado, item de carrinho antigo) não
// monta caminho nenhum — o CoverThumb mostra o placeholder listrado.
export function bookCoverPath(slug: string): string {
  return `/images/${STAGE}/${slug}.jpg`;
}
