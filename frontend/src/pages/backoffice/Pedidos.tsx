import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { apiAuthPatch } from '../../api/client';
import { formatPrice } from '../../lib/format';
import {
  formatOrderDate,
  isDelivered,
  shortOrderId,
  STAGES,
} from '../../backoffice/order-status';
import type { OrderGroup, OrderLine } from '../../backoffice/order-status';
import { useOrders } from '../../backoffice/useOrders';
import type { BookInfo } from '../../backoffice/useOrders';

function orderTotal(group: OrderGroup, books: Map<string, BookInfo>): string {
  let total = 0;
  for (const line of group.lines) {
    const book = books.get(line.book_id);
    if (!book) return '—';
    total += book.price * line.amount;
  }
  return formatPrice(total);
}

function StatusCell({ line }: { line: OrderLine }) {
  const stage = STAGES[line.status];
  return (
    <span>
      <span className={`stage-pill stage-pill--${stage.index}`}>{stage.label}</span>
      <span className="stage-segs">
        {[0, 1, 2, 3].map((i) => (
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
  const { loading, error, unauthorized, groups, books, reload } = useOrders();
  const [lastAction, setLastAction] = useState('');
  const pending = groups.filter((g) => !isDelivered(g));

  if (unauthorized) return <Navigate to="/backoffice" replace />;

  async function advance(line: OrderLine) {
    const stage = STAGES[line.status];
    if (!stage.next) return;
    await apiAuthPatch(`/backoffice/pedidos/${line.id}/status`, {
      status: stage.next,
      book_id: line.book_id,
    });
    const book = books.get(line.book_id);
    setLastAction(
      `✓ ${shortOrderId(line.id)} · ${book?.title ?? line.book_id} → ${STAGES[stage.next].label}`,
    );
    await reload();
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

      {pending.length === 0 && (
        <div className="bo-empty">
          <div className="bo-empty__title">Nenhum pedido pendente</div>
          <div className="bo-empty__sub">Tudo em dia por aqui.</div>
        </div>
      )}

      {pending.map((group) => (
        <div key={group.id} className="order-card">
          <div className="order-card__header">
            <span className="order-card__id">{shortOrderId(group.id)}</span>
            <span className="order-card__name">{group.name}</span>
            <span className="order-card__contact">{group.contact}</span>
            <span className="order-card__date">{formatOrderDate(group.created_at)}</span>
            <span className="order-card__total">{orderTotal(group, books)}</span>
          </div>
          <div className="order-card__cols">
            <span>Livro</span>
            <span className="t-center">Qtd</span>
            <span>Valor</span>
            <span>Status</span>
            <span className="t-right">Ação</span>
          </div>
          {group.lines.map((line) => {
            const book = books.get(line.book_id);
            const stage = STAGES[line.status];
            return (
              <div key={line.book_id} className="order-card__row">
                <span className="order-card__book">{book?.title ?? line.book_id}</span>
                <span className="t-center order-card__qty">{line.amount}</span>
                <span className="order-card__price">
                  {book ? formatPrice(book.price * line.amount) : '—'}
                </span>
                <StatusCell line={line} />
                <span className="t-right">
                  {stage.nextLabel ? (
                    <button className="stage-action" onClick={() => void advance(line)}>
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
