import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { apiAuthPatch } from '../../api/client';
import { formatPrice } from '../../lib/format';
import {
  formatOrderDate,
  isDelivered,
  shortOrderId,
  STAGE_COUNT,
  STAGES,
} from '../../backoffice/order-status';
import type { Order, UnitItem } from '../../backoffice/order-status';
import { useOrders } from '../../backoffice/useOrders';
import type { BookInfo } from '../../backoffice/useOrders';

function orderTotal(order: Order, books: Map<string, BookInfo>): string {
  let total = 0;
  for (const item of order.items) {
    const book = books.get(item.title_id);
    if (!book) return '—';
    total += book.price;
  }
  return formatPrice(total);
}

function StatusCell({ item }: { item: UnitItem }) {
  const stage = STAGES[item.status];
  return (
    <span>
      <span className={`stage-pill stage-pill--${stage.index}`}>{stage.label}</span>
      <span className="stage-segs">
        {Array.from({ length: STAGE_COUNT }, (_, i) => (
          <span
            key={i}
            className={`stage-seg${i <= stage.index ? ` stage-seg--on-${stage.index}` : ''}`}
          />
        ))}
      </span>
    </span>
  );
}

export function Pedidos() {
  const { loading, error, unauthorized, orders, books, reload } = useOrders();
  const [lastAction, setLastAction] = useState('');
  const [actionError, setActionError] = useState('');
  const pending = orders.filter((o) => !isDelivered(o));

  if (unauthorized) return <Navigate to="/backoffice" replace />;

  async function advance(order: Order, item: UnitItem) {
    const stage = STAGES[item.status];
    if (!stage.next) return;
    setActionError('');
    try {
      await apiAuthPatch(`/backoffice/pedidos/${order.id}/status`, {
        status: stage.next,
        unit_id: item.unit_id,
      });
      const book = books.get(item.title_id);
      setLastAction(
        `✓ ${shortOrderId(order.id)} · ${book?.title ?? item.title_id} → ${STAGES[stage.next].label}`,
      );
      await reload();
    } catch {
      setActionError('Não foi possível atualizar o status. Tente de novo.');
    }
  }

  if (loading) return <div className="bo-loading">Carregando…</div>;
  if (error) {
    return (
      <div className="bo-state">
        <div className="alert alert--error">Não foi possível carregar os pedidos.</div>
        <button className="btn btn--secondary" onClick={() => void reload()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="bo-content">
      {lastAction && <div className="alert alert--success bo-last-action">{lastAction}</div>}
      {actionError && <div className="alert alert--error bo-last-action">{actionError}</div>}

      {pending.length === 0 && (
        <div className="bo-empty">
          <div className="bo-empty__title">Nenhum pedido pendente</div>
          <div className="bo-empty__sub">Tudo em dia por aqui.</div>
        </div>
      )}

      {pending.map((order) => (
        <div key={order.id} className="order-card">
          <div className="order-card__header">
            <span className="order-card__id">{shortOrderId(order.id)}</span>
            <span className="order-card__name">{order.name}</span>
            <span className="order-card__contact">{order.contact}</span>
            <span className="order-card__date">{formatOrderDate(order.created_at)}</span>
            <span className="order-card__total">{orderTotal(order, books)}</span>
          </div>
          <div className="order-card__cols">
            <span>Livro</span>
            <span>Valor</span>
            <span>Status</span>
            <span className="t-right">Ação</span>
          </div>
          {order.items.map((item) => {
            const book = books.get(item.title_id);
            const stage = STAGES[item.status];
            return (
              <div key={item.unit_id} className="order-card__row">
                <span className="order-card__book">{book?.title ?? item.title_id}</span>
                <span className="order-card__price">
                  {book ? formatPrice(book.price) : '—'}
                </span>
                <StatusCell item={item} />
                <span className="t-right">
                  {stage.nextLabel ? (
                    <button className="stage-action" onClick={() => void advance(order, item)}>
                      {stage.nextLabel}
                    </button>
                  ) : (
                    <span className="stage-action stage-action--done">Concluído</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
