export interface Book {
  id: string;
  slug?: string; // nome do arquivo da capa; ausente só em dado pré-migração
  title: string;
  description?: string;
  price: number; // centavos
  social_price?: number; // centavos; ausência só em dado legado pré-migração
  author?: string;
  pages?: number;
  edition?: string;
  year?: number;
  format?: string;
  amount: number;
}

// defesa residual pra livro legado sem o campo (migração grava social = price)
export function socialPriceOf(book: Pick<Book, 'price' | 'social_price'>): number {
  return book.social_price ?? book.price;
}

export interface CartItem {
  book_id: string;
  slug?: string; // carrinho salvo antes da migração não tem
  title: string;
  price: number; // centavos
  amount: number;
}
