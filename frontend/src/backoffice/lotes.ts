export interface LoteBook {
  book_id: string;
  amount: number;
}

export interface Lote {
  id: string;
  date: string; // YYYY-MM-DD
  region: string;
  books: LoteBook[];
  total_cost: number; // centavos
  total_books?: number;
  total_remaining?: number; // Σ restante dos livros do lote
  sold_value?: number; // centavos (Σ received_amount das unidades do lote)
}

export interface LoteDetailBook {
  book_id: string;
  acquired: number;
  reserved: number;
  picked_up: number;
  sold: number;
  remaining: number;
}

export interface LoteTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  recipient: string;
  amount: number; // centavos com sinal: negativo = doação/perda, positivo = contribuição
  receipt_key?: string;
  created_at: string;
}

export interface LoteDetailData {
  id: string;
  date: string;
  region: string;
  total_cost: number;
  sold_value: number;
  transactions: LoteTransaction[];
  transactions_total: number;
  books: LoteDetailBook[];
}

export function formatLoteDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
