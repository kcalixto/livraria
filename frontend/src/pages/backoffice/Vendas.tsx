import { Navigate } from 'react-router-dom';
import { formatPrice } from '../../lib/format';
import { formatOrderDate, isUnitFinalized, shortOrderId } from '../../backoffice/order-status';
import type { Order, UnitItem } from '../../backoffice/order-status';
import { useOrders } from '../../backoffice/useOrders';
import type { BookInfo } from '../../backoffice/useOrders';

interface SaleRow {
  order: Order;
  item: UnitItem;
}

function saleValue(row: SaleRow, books: Map<string, BookInfo>): string {
  if (row.item.received_amount !== undefined) return formatPrice(row.item.received_amount);
  const book = books.get(row.item.title_id);
  return book ? formatPrice(book.price) : '—';
}

export function Vendas() {
  const { loading, error, unauthorized, orders, books, reload } = useOrders();

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

  // uma linha por UNIDADE finalizada (venda é por título, não por pedido)
  const sales: SaleRow[] = orders.flatMap((order) =>
    order.items.filter(isUnitFinalized).map((item) => ({ order, item })),
  );

  return (
    <div className="bo-content">
      {sales.length === 0 ? (
        <div className="bo-empty">
          <div className="bo-empty__title">Nenhuma venda finalizada</div>
          <div className="bo-empty__sub">Unidades entregues ou pagas aparecem aqui.</div>
        </div>
      ) : (
        <div className="sales-table">
          <div className="sales-table__cols">
            <span>Pedido</span>
            <span>Cliente</span>
            <span>Livro</span>
            <span>Valor</span>
            <span>Data</span>
            <span className="t-right">Status</span>
          </div>
          {sales.map(({ order, item }) => (
            <div key={item.unit_id} className="sales-table__row">
              <span className="sales-table__order-id">{shortOrderId(order.id)}</span>
              <span className="sales-table__name">{order.name}</span>
              <span className="sales-table__books">
                {books.get(item.title_id)?.title ?? item.title_id}
              </span>
              <span className="sales-table__total">{saleValue({ order, item }, books)}</span>
              <span className="sales-table__date">{formatOrderDate(order.created_at)}</span>
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
