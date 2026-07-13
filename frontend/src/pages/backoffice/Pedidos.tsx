import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError, apiAuthPatch } from '../../api/client';
import { centsToText, formatPrice, textToCents } from '../../lib/format';
import {
  formatOrderDate,
  isDelivered,
  shortOrderId,
  STAGE_COUNT,
  STAGES,
} from '../../backoffice/order-status';
import type { Order, UnitItem } from '../../backoffice/order-status';
import { useOrders } from '../../backoffice/useOrders';
import { Toast } from '../../components/Toast';
import type { ToastData } from '../../components/Toast';
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
  const pillClass = stage.exceptional ? 'stage-pill--reserve' : `stage-pill--${stage.index}`;
  return (
    <span>
      <span className={`stage-pill ${pillClass}`}>{stage.label}</span>
      {item.picked_up && (
        <span className="badge badge--low unit-picked-badge">retirado sem pagamento</span>
      )}
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
  const [toast, setToast] = useState<ToastData | null>(null);
  const [payingUnitId, setPayingUnitId] = useState<string | null>(null);
  const [payText, setPayText] = useState('');
  const pending = orders.filter((o) => !isDelivered(o));

  if (unauthorized) return <Navigate to="/backoffice" replace />;

  async function patch(order: Order, item: UnitItem, body: Record<string, unknown>, doneLabel: string) {
        try {
      await apiAuthPatch(`/backoffice/pedidos/${order.id}/status`, {
        ...body,
        unit_id: item.unit_id,
      });
      const book = books.get(item.title_id);
      setToast({ kind: 'success', message: `✓ ${shortOrderId(order.id)} · ${book?.title ?? item.title_id} → ${doneLabel}` });
      setPayingUnitId(null);
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setToast({ kind: 'error', message: 'Sem estoque disponível na região para essa ação.' });
        return;
      }
      setToast({ kind: 'error', message: 'Não foi possível atualizar o status. Tente de novo.' });
    }
  }

  function openPayment(item: UnitItem) {
    const book = books.get(item.title_id);
    setPayText(book ? centsToText(book.price) : '');
    setPayingUnitId(item.unit_id);
      }

  async function confirmPayment(order: Order, item: UnitItem) {
    const cents = textToCents(payText);
    if (cents === null) {
      setToast({ kind: 'error', message: 'Informe um valor recebido válido (ex.: 42,00).' });
      return;
    }
    await patch(
      order,
      item,
      { status: 'payment-received', received_amount: cents },
      'Pagamento efetuado',
    );
  }

  function renderActions(order: Order, item: UnitItem) {
    if (payingUnitId === item.unit_id) {
      return (
        <span className="pay-inline">
          <input
            className="field-input pay-inline__input"
            aria-label="Valor recebido"
            value={payText}
            onChange={(e) => setPayText(e.target.value)}
          />
          <button className="stage-action" onClick={() => void confirmPayment(order, item)}>
            Confirmar
          </button>
          <button className="stage-action" onClick={() => setPayingUnitId(null)}>
            Cancelar
          </button>
        </span>
      );
    }

    if (item.picked_up) {
      return (
        <>
          <button className="stage-action" onClick={() => openPayment(item)}>
            Confirmar pagamento
          </button>
          <button
            className="stage-action"
            onClick={() => void patch(order, item, { picked_up: false }, 'Retirada desfeita')}
          >
            Desfazer retirado
          </button>
        </>
      );
    }

    switch (item.status) {
      case 'waiting-payment':
        return (
          <>
            <button
              className="stage-action"
              onClick={() => void patch(order, item, { status: 'in-reserve' }, 'Em Reserva')}
            >
              Reservar
            </button>
            <button className="stage-action" onClick={() => openPayment(item)}>
              Confirmar pagamento
            </button>
            <button
              className="stage-action"
              onClick={() =>
                void patch(order, item, { picked_up: true }, 'Retirado sem pagamento')
              }
            >
              Retirado s/ pagamento
            </button>
          </>
        );
      case 'in-reserve':
        return (
          <>
            <button className="stage-action" onClick={() => openPayment(item)}>
              Confirmar pagamento
            </button>
            <button
              className="stage-action"
              onClick={() =>
                void patch(order, item, { status: 'waiting-payment' }, 'Reserva liberada')
              }
            >
              Liberar reserva
            </button>
            <button
              className="stage-action"
              onClick={() =>
                void patch(order, item, { picked_up: true }, 'Retirado sem pagamento')
              }
            >
              Retirado s/ pagamento
            </button>
          </>
        );
      case 'payment-received':
        return (
          <button
            className="stage-action"
            onClick={() =>
              void patch(order, item, { status: 'sent-to-delivery' }, 'Enviado para entrega')
            }
          >
            Enviar p/ entrega
          </button>
        );
      case 'sent-to-delivery':
        return (
          <button
            className="stage-action"
            onClick={() => void patch(order, item, { status: 'received' }, 'Entregue')}
          >
            Marcar entregue
          </button>
        );
      default:
        return <span className="stage-action stage-action--done">Concluído</span>;
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
      {toast && <Toast toast={toast} onDone={() => setToast(null)} />}
      <div className="bo-toolbar">
        <button
          className="reload-btn"
          aria-label="Recarregar"
          title="Recarregar"
          onClick={() => void reload()}
        >
          ↻
        </button>
      </div>

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
            <span className="t-center">Disponível</span>
            <span>Valor</span>
            <span>Status</span>
            <span className="t-right">Ações</span>
          </div>
          {order.items.map((item) => {
            const book = books.get(item.title_id);
            return (
              <div key={item.unit_id} className="order-card__row">
                <span className="order-card__book">{book?.title ?? item.title_id}</span>
                <span className="t-center order-card__available">
                  {book ? book.amount : '—'}
                </span>
                <span className="order-card__price">
                  {item.received_amount !== undefined
                    ? formatPrice(item.received_amount)
                    : book
                      ? formatPrice(book.price)
                      : '—'}
                </span>
                <StatusCell item={item} />
                <span className="t-right order-card__actions">{renderActions(order, item)}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
