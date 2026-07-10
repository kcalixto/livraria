import { Navigate } from 'react-router-dom';
import { formatPrice } from '../../lib/format';
import { formatOrderDate, isDelivered } from '../../backoffice/order-status';
import type { OrderGroup } from '../../backoffice/order-status';
import { useOrders } from '../../backoffice/useOrders';
import type { BookInfo } from '../../backoffice/useOrders';

function booksLabel(group: OrderGroup, books: Map<string, BookInfo>): string {
  return group.lines
    .map((l) => {
      const title = books.get(l.book_id)?.title ?? l.book_id;
      return l.amount > 1 ? `${title} ×${l.amount}` : title;
    })
    .join(' · ');
}

function orderTotal(group: OrderGroup, books: Map<string, BookInfo>): string {
  let total = 0;
  for (const line of group.lines) {
    const book = books.get(line.book_id);
    if (!book) return '—';
    total += book.price * line.amount;
  }
  return formatPrice(total);
}

export function Vendas() {
  const { loading, error, unauthorized, groups, books, reload } = useOrders();
  const delivered = groups.filter(isDelivered);

  if (unauthorized) return <Navigate to="/backoffice" replace />;

  if (loading) return <div className="bo-loading">Carregando…</div>;
  if (error) {
    return (
      <div className="bo-state">
        <div className="alert alert--error">Não foi possível carregar as vendas.</div>
        <button className="btn btn--secondary" onClick={() => void reload()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="bo-content">
      {delivered.length === 0 ? (
        <div className="bo-empty">
          <div className="bo-empty__title">Nenhuma venda finalizada</div>
          <div className="bo-empty__sub">Pedidos entregues aparecem aqui.</div>
        </div>
      ) : (
        <div className="sales-table">
          <div className="sales-table__cols">
            <span>Cliente</span>
            <span>Contato</span>
            <span>Livros</span>
            <span>Valor</span>
            <span>Data</span>
            <span className="t-right">Status</span>
          </div>
          {delivered.map((group) => (
            <div key={group.id} className="sales-table__row">
              <span className="sales-table__name">{group.name}</span>
              <span className="sales-table__contact">{group.contact}</span>
              <span className="sales-table__books">{booksLabel(group, books)}</span>
              <span className="sales-table__total">{orderTotal(group, books)}</span>
              <span className="sales-table__date">{formatOrderDate(group.created_at)}</span>
              <span className="t-right">
                <span className="badge badge--ok sales-table__status">Concluído</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
