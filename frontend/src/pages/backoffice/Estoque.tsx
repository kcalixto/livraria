import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import type { Book } from '../../lib/types';

const REGIONS = ['Zona Sul', 'Zona Norte', 'Centro', 'ABC'] as const;

// Estoque MOCKADO (área a ser aprofundada): números pseudo-aleatórios
// determinísticos derivados do id do livro, estáveis entre renders.
function mockQty(bookId: string, region: string): number {
  let hash = 0;
  for (const ch of `${bookId}:${region}`) {
    hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % 15;
}

function qtyClass(qty: number): string {
  if (qty === 0) return 'stock-qty--zero';
  if (qty <= 3) return 'stock-qty--low';
  return 'stock-qty--ok';
}

export function Estoque() {
  const [books, setBooks] = useState<Book[] | null>(null);

  useEffect(() => {
    apiGet<Book[]>('/livros')
      .then(setBooks)
      .catch(() => setBooks([]));
  }, []);

  if (!books) return <div className="bo-loading">Carregando…</div>;

  return (
    <div className="bo-content">
      <div className="stock-banner">↯ Área a ser aprofundada — números fictícios (mock)</div>
      <div className="stock-table">
        <div className="stock-table__cols">
          <span>Título</span>
          {REGIONS.map((r) => (
            <span key={r} className="t-center">
              {r}
            </span>
          ))}
          <span className="t-right">Total</span>
        </div>
        {books.map((book) => {
          const quantities = REGIONS.map((r) => mockQty(book.id, r));
          const total = quantities.reduce((a, b) => a + b, 0);
          return (
            <div key={book.id} className="stock-table__row">
              <span className="stock-table__title">{book.title}</span>
              {quantities.map((qty, i) => (
                <span key={REGIONS[i]} className={`t-center stock-qty ${qtyClass(qty)}`}>
                  {qty}
                </span>
              ))}
              <span className="t-right stock-table__total">{total}</span>
            </div>
          );
        })}
      </div>
      <p className="stock-note">
        Placeholder de profundidade: entradas por lote, alertas de estoque baixo, histórico de
        reposição e edição inline ainda serão especificados.
      </p>
    </div>
  );
}
