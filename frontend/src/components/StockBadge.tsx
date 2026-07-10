const LOW_STOCK_MAX = 3;

export function StockBadge({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  if (amount <= LOW_STOCK_MAX) {
    return <span className="badge badge--low">Últimas {amount} na Zona Sul</span>;
  }
  return <span className="badge badge--ok">{amount} na Zona Sul</span>;
}
