const LOW_STOCK_MAX = 3;

// "região" genérico de propósito: a região ativa já aparece no topo do
// catálogo, e o nome inteiro ("SP, Capital — Zona Sul") não cabe numa badge.
export function StockBadge({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  if (amount === 1) {
    return <span className="badge badge--low">Último disponível na região</span>;
  }
  if (amount <= LOW_STOCK_MAX) {
    return <span className="badge badge--low">Últimas {amount} na região</span>;
  }
  return <span className="badge badge--ok">{amount} na região</span>;
}
