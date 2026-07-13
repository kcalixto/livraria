import { Fragment, useState } from 'react';
import { RedirectToLogin } from '../../components/RedirectToLogin';
import { ApiError, apiAuthPatch } from '../../api/client';
import { centsToText, formatPrice, normalizeText, textToCents } from '../../lib/format';
import { socialPriceOf } from '../../lib/types';
import {
  formatOrderDate,
  isDelivered,
  shortOrderId,
  STAGE_COUNT,
  STAGES,
} from '../../backoffice/order-status';
import type { Order, UnitItem } from '../../backoffice/order-status';
import { useOrders } from '../../backoffice/useOrders';
import { ClampedText } from '../../components/ClampedText';
import { ContactLink } from '../../components/ContactLink';
import { Toast } from '../../components/Toast';
import type { ToastData } from '../../components/Toast';
import type { BookInfo } from '../../backoffice/useOrders';

// doações já registradas entram pelo valor recebido, não pelo preço de tabela
function orderTotal(order: Order, books: Map<string, BookInfo>): string {
  let total = 0;
  for (const item of order.items) {
    const book = books.get(item.title_id);
    if (item.received_amount === undefined && !book) return '—';
    total += item.received_amount ?? book!.price;
  }
  return formatPrice(total);
}

function StatusCell({ item }: { item: UnitItem }) {
  const stage = STAGES[item.status];
  const pillClass = stage.exceptional ? 'stage-pill--reserve' : `stage-pill--${stage.index}`;
  return (
    <span role="cell">
      <span className={`stage-pill ${pillClass}`}>{stage.label}</span>
      {item.picked_up && (
        <span className="badge badge--low unit-picked-badge">retirado sem pagamento</span>
      )}
      <span className="stage-segs" aria-hidden="true">
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
  const { loading, refreshing, error, unauthorized, orders, books, reload } = useOrders();
  const [toast, setToast] = useState<ToastData | null>(null);
  const [payingUnitId, setPayingUnitId] = useState<string | null>(null);
  const [confirmingUnitId, setConfirmingUnitId] = useState<string | null>(null);
  const [obsUnitId, setObsUnitId] = useState<string | null>(null);
  const [obsText, setObsText] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [payText, setPayText] = useState('');
  const [paySocial, setPaySocial] = useState(false);
  // busca por código/nome/contato/título + chip de status
  const query = normalizeText(search.trim());
  const queryId = search.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const pending = orders
    .filter((o) => !isDelivered(o))
    .filter((o) => {
      if (statusFilter && !o.items.some((i) => i.status === statusFilter)) return false;
      if (!query) return true;
      if (queryId && o.id.toUpperCase().includes(queryId)) return true;
      if (normalizeText(o.name).includes(query)) return true;
      if (normalizeText(o.contact).includes(query)) return true;
      return o.items.some((i) =>
        normalizeText(books.get(i.title_id)?.title ?? '').includes(query),
      );
    })
    // fila de atendimento: o pedido mais antigo primeiro
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (unauthorized) return <RedirectToLogin />;

  async function patch(order: Order, item: UnitItem, body: Record<string, unknown>, doneLabel: string) {
        try {
      await apiAuthPatch(`/backoffice/pedidos/${order.id}/status`, {
        ...body,
        unit_id: item.unit_id,
      });
      const book = books.get(item.title_id);
      setToast({ kind: 'success', message: `✓ ${shortOrderId(order.id)} · ${book?.title ?? item.title_id} → ${doneLabel}` });
      setPayingUnitId(null);
      setConfirmingUnitId(null);
      setObsUnitId(null);
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setToast({ kind: 'error', message: 'Sem estoque disponível na região para essa ação.' });
        return;
      }
      setToast({ kind: 'error', message: 'Não foi possível atualizar o status. Tente de novo.' });
    }
  }

  function openObservation(item: UnitItem) {
    setObsText(item.observation ?? '');
    setObsUnitId(item.unit_id);
  }

  function openPayment(item: UnitItem) {
    const book = books.get(item.title_id);
    setPaySocial(false);
    setPayText(book ? centsToText(book.price) : '');
    setPayingUnitId(item.unit_id);
  }

  // atalho de digitação + rastro: preenche com o preço social e marca a venda
  function toggleSocial(item: UnitItem, checked: boolean) {
    const book = books.get(item.title_id);
    setPaySocial(checked);
    if (book) setPayText(centsToText(checked ? socialPriceOf(book) : book.price));
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
      {
        status: 'payment-received',
        received_amount: cents,
        ...(paySocial && { social_price: true }),
      },
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
            autoFocus
            inputMode="decimal"
            value={payText}
            onChange={(e) => setPayText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void confirmPayment(order, item);
              }
              if (e.key === 'Escape') setPayingUnitId(null);
            }}
          />
          <label className="pay-inline__social">
            <input
              type="checkbox"
              checked={paySocial}
              onChange={(e) => toggleSocial(item, e.target.checked)}
            />
            Preço social
          </label>
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
        // única transição irreversível — confirma inline antes do PATCH
        if (confirmingUnitId === item.unit_id) {
          return (
            <span className="pay-inline">
              <span className="confirm-inline__hint">Entrega não pode ser desfeita.</span>
              <button
                className="stage-action stage-action--danger"
                onClick={() => void patch(order, item, { status: 'received' }, 'Entregue')}
              >
                Confirmar
              </button>
              <button className="stage-action" onClick={() => setConfirmingUnitId(null)}>
                Cancelar
              </button>
            </span>
          );
        }
        return (
          <button className="stage-action" onClick={() => setConfirmingUnitId(item.unit_id)}>
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
      <div className="bo-toolbar bo-toolbar--filters">
        <input
          className="field-input pedidos-search"
          placeholder="Buscar por código, cliente, contato ou título…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="status-chips">
          {[
            { label: 'Todos', value: null },
            { label: 'Esperando', value: 'waiting-payment' },
            { label: 'Reserva', value: 'in-reserve' },
            { label: 'Pagos', value: 'payment-received' },
            { label: 'Entrega', value: 'sent-to-delivery' },
          ].map(({ label, value }) => (
            <button
              key={label}
              className={`status-chip${statusFilter === value ? ' status-chip--active' : ''}`}
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className={`reload-btn${refreshing ? ' reload-btn--spinning' : ''}`}
          aria-label="Recarregar"
          title="Recarregar"
          onClick={() => void reload()}
        >
          ↻
        </button>
      </div>

      {pending.length === 0 ? (
        <div className="bo-empty">
          <div className="bo-empty__title">Nenhum pedido pendente</div>
          <div className="bo-empty__sub">Tudo em dia por aqui.</div>
        </div>
      ) : (
        <div className="pending-count">
          {pending.length} pedido{pending.length === 1 ? '' : 's'} pendente
          {pending.length === 1 ? '' : 's'}
        </div>
      )}

      {pending.map((order) => (
        <div
          key={order.id}
          className="order-card"
          role="table"
          aria-label={`Pedido ${shortOrderId(order.id)}`}
        >
          <div className="order-card__header" role="row">
            <span className="order-card__id" role="cell">{shortOrderId(order.id)}</span>
            <span className="order-card__name" role="cell">{order.name}</span>
            <span className="order-card__contact" role="cell">
              <ContactLink contact={order.contact} />
            </span>
            <span className="order-card__date" role="cell">{formatOrderDate(order.created_at)}</span>
            <span className="order-card__total" role="cell">{orderTotal(order, books)}</span>
          </div>
          <div className="order-card__cols" role="row">
            <span role="columnheader">Livro</span>
            <span className="t-center" role="columnheader">Disponível</span>
            <span role="columnheader">Valor</span>
            <span role="columnheader">Status</span>
            <span className="t-right" role="columnheader">Ações</span>
          </div>
          {order.items.map((item) => {
            const book = books.get(item.title_id);
            return (
              <Fragment key={item.unit_id}>
              <div className="order-card__row" role="row">
                <span className="order-card__book" role="cell">
                  {book?.title ?? item.title_id}
                  {book?.amount === 0 && item.status === 'waiting-payment' && !item.picked_up && (
                    <span className="badge unit-no-stock-badge">sem estoque</span>
                  )}
                </span>
                <span
                  role="cell"
                  className={`t-center order-card__available${
                    book && book.amount === 0
                      ? ' order-card__available--zero'
                      : book && book.amount <= 3
                        ? ' order-card__available--low'
                        : ''
                  }`}
                >
                  {book ? book.amount : '—'}
                </span>
                <span className="order-card__price" role="cell">
                  {item.received_amount !== undefined
                    ? formatPrice(item.received_amount)
                    : book
                      ? formatPrice(book.price)
                      : '—'}
                </span>
                <StatusCell item={item} />
                <span className="t-right order-card__actions" role="cell">
                  {renderActions(order, item)}
                  {obsUnitId !== item.unit_id && (
                    <button className="stage-action" onClick={() => openObservation(item)}>
                      {item.observation ? 'Editar observação' : 'Adicionar observação'}
                    </button>
                  )}
                </span>
              </div>
              {obsUnitId === item.unit_id ? (
                <div className="order-card__obs" role="row">
                  <span className="order-card__obs-cell" role="cell">
                    <textarea
                      className="field-input obs-textarea"
                      aria-label="Observação"
                      rows={3}
                      autoFocus
                      value={obsText}
                      onChange={(e) => setObsText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setObsUnitId(null);
                      }}
                    />
                    <span className="pay-inline">
                      <button
                        className="stage-action"
                        onClick={() =>
                          void patch(
                            order,
                            item,
                            { observation: obsText.trim() },
                            'Observação salva',
                          )
                        }
                      >
                        Salvar
                      </button>
                      <button className="stage-action" onClick={() => setObsUnitId(null)}>
                        Cancelar
                      </button>
                    </span>
                  </span>
                </div>
              ) : item.observation ? (
                <div className="order-card__obs" role="row">
                  <span className="order-card__obs-cell" role="cell">
                    <ClampedText
                      text={item.observation}
                      limit={200}
                      className="order-card__obs-text"
                    />
                  </span>
                </div>
              ) : null}
              </Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
}
