export interface Book {
  id: string;
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
  status: string;
}

// defesa residual pra livro legado sem o campo (migração grava social = price)
export function socialPriceOf(book: Pick<Book, 'price' | 'social_price'>): number {
  return book.social_price ?? book.price;
}

export interface CartItem {
  book_id: string;
  title: string;
  price: number; // centavos
  amount: number;
}
