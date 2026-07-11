export interface Book {
  id: string;
  title: string;
  description?: string;
  price: number; // centavos
  author?: string;
  pages?: number;
  edition?: string;
  year?: number;
  format?: string;
  amount: number;
  status: string;
}

export interface CartItem {
  book_id: string;
  title: string;
  price: number; // centavos
  amount: number;
}
