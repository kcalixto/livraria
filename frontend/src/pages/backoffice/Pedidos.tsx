import { Fragment, useState } from 'react';
import { RedirectToLogin } from '../../components/RedirectToLogin';
import { ApiError, apiAuthPatch } from '../../api/client';
import { centsToText, formatPrice, normalizeText, textToCents } from '../../lib/format';
import { socialPriceOf } from '../../lib/types';
import {
  formatOrderDate,
  isUnitClosed,
  shortOrderId,
  STAGE_COUNT,
  STAGES,
} from '../../backoffice/order-status';
import type { Order, UnitItem } from '../../backoffice/order-status';
import { useOrders } from '../../backoffice/useOrders';
import { ActionIcon } from '../../components/ActionIcon';
import { ClampedText } from '../../components/ClampedText';
import { ContactLink } from '../../components/ContactLink';
import { OrderSummaryModal } from '../../components/OrderSummaryModal';
import { Toast } from '../../components/Toast';
import type { ToastData } from '../../components/Toast';
import type { BookInfo } from '../../backoffice/useOrders';

// doações já registradas entram pelo valor recebido, não pelo preço de tabela;
// unidades canceladas ficam fora do total
function orderTotal(order: Order, books: Map<string, BookInfo>): string {
  let total = 0;
  for (const item of order.items) {
    if (item.status === 'cancelled') continue;
    const book = books.get(item.title_id);
    if (item.received_amount === undefined && !book) return '—';
    total += item.received_amount ?? book!.price;
  }
  return formatPrice(total);
}

function StatusCell({ item }: { item: UnitItem }) {
  const stage = STAGES[item.status];
  const pillClass = stage.pill
    ? `stage-pill--${stage.pill}`
    : stage.exceptional
      ? 'stage-pill--reserve'
      : `stage-pill--${stage.index}`;
  return (
    <span role="cell">
      <span className={`stage-pill ${pillClass}`}>{stage.label}</span>
      {item.picked_up && (
        <span className="badge badge--low unit-picked-badge">retirado sem pagamento</span>
      )}
      {item.cancel_requested && item.status !== 'cancelled' && (
        <span className="badge badge--zero unit-cancel-badge">cancelamento solicitado</span>
      )}
      {item.status !== 'cancelled' && (
        <span className="stage-segs" aria-hidden="true">
          {Array.from({ length: STAGE_COUNT }, (_, i) => (
            <span
              key={i}
              className={`stage-seg${i <= stage.index ? ` stage-seg--on-${stage.index}` : ''}`}
            />
          ))}
        </span>
      )}
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
  const [cancellingUnitId, setCancellingUnitId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [pickingUpOrderId, setPickingUpOrderId] = useState<string | null>(null);
  const [summaryOrderId, setSummaryOrderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [payText, setPayText] = useState('');
  const [paySocial, setPaySocial] = useState(false);
  // busca por código/nome/contato/título + chip de status
  const query = normalizeText(search.trim());
  const queryId = search.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const pending = orders
    // sai da fila quando TODAS as unidades fecharam (venda concluída ou cancelada)
    .filter((o) => !o.items.every(isUnitClosed))
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

  function resetInlineStates() {
    setPayingUnitId(null);
    setConfirmingUnitId(null);
    setObsUnitId(null);
    setCancellingUnitId(null);
    setCancellingOrderId(null);
    setPickingUpOrderId(null);
  }

  async function patchRaw(
    orderId: string,
    body: Record<string, unknown>,
    doneMessage: string,
    badRequestMessage = 'Sem estoque disponível na região para essa ação.',
  ) {
    try {
      await apiAuthPatch(`/backoffice/pedidos/${orderId}/status`, body);
      setToast({ kind: 'success', message: doneMessage });
      resetInlineStates();
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setToast({ kind: 'error', message: badRequestMessage });
        return;
      }
      setToast({ kind: 'error', message: 'Não foi possível atualizar o status. Tente de novo.' });
    }
  }

  async function patch(order: Order, item: UnitItem, body: Record<string, unknown>, doneLabel: string) {
    const book = books.get(item.title_id);
    await patchRaw(
      order.id,
      { ...body, unit_id: item.unit_id },
      `✓ ${shortOrderId(order.id)} · ${book?.title ?? item.title_id} → ${doneLabel}`,
    );
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
          <ActionIcon icon="done" variant="green" label="Confirmar" onClick={() => void confirmPayment(order, item)} />
          <ActionIcon icon="cancel" variant="gray" label="Cancelar" onClick={() => setPayingUnitId(null)} />
        </span>
      );
    }

    if (item.status === 'cancelled') return null;

    if (item.picked_up) {
      return (
        <>
          <ActionIcon icon="pay" variant="green" label="Confirmar pagamento" onClick={() => openPayment(item)} />
          <ActionIcon
            icon="undo"
            variant="gray"
            label="Desfazer retirado"
            onClick={() => void patch(order, item, { picked_up: false }, 'Retirada desfeita')}
          />
        </>
      );
    }

    switch (item.status) {
      case 'waiting-payment':
        return (
          <>
            <ActionIcon
              icon="reserve"
              variant="teal"
              label="Reservar"
              onClick={() => void patch(order, item, { status: 'in-reserve' }, 'Em Reserva')}
            />
            <ActionIcon icon="pay" variant="green" label="Confirmar pagamento" onClick={() => openPayment(item)} />
            <ActionIcon
              icon="pickup"
              variant="amber"
              label="Retirado s/ pagamento"
              onClick={() =>
                void patch(order, item, { picked_up: true }, 'Retirado sem pagamento')
              }
            />
          </>
        );
      case 'in-reserve':
        return (
          <>
            <ActionIcon icon="pay" variant="green" label="Confirmar pagamento" onClick={() => openPayment(item)} />
            <ActionIcon
              icon="release"
              variant="gray"
              label="Liberar reserva"
              onClick={() =>
                void patch(order, item, { status: 'waiting-payment' }, 'Reserva liberada')
              }
            />
            <ActionIcon
              icon="pickup"
              variant="amber"
              label="Retirado s/ pagamento"
              onClick={() =>
                void patch(order, item, { picked_up: true }, 'Retirado sem pagamento')
              }
            />
          </>
        );
      case 'payment-received':
        return (
          <ActionIcon
            icon="deliver"
            variant="blue"
            label="Enviar p/ entrega"
            onClick={() =>
              void patch(order, item, { status: 'sent-to-delivery' }, 'Enviado para entrega')
            }
          />
        );
      case 'sent-to-delivery':
        // única transição irreversível — confirma inline antes do PATCH
        if (confirmingUnitId === item.unit_id) {
          return (
            <span className="pay-inline">
              <span className="confirm-inline__hint">Entrega não pode ser desfeita.</span>
              <ActionIcon icon="done" variant="red" label="Confirmar" onClick={() => void patch(order, item, { status: 'received' }, 'Entregue')} />
              <ActionIcon icon="cancel" variant="gray" label="Cancelar" onClick={() => setConfirmingUnitId(null)} />
            </span>
          );
        }
        return (
          <ActionIcon
            icon="done"
            variant="forest"
            label="Marcar entregue"
            onClick={() => setConfirmingUnitId(item.unit_id)}
          />
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
            <span className="order-card__order-actions" role="cell">
              {cancellingOrderId === order.id ? (
                <span className="pay-inline">
                  <span className="confirm-inline__hint">
                    Cancela todas as unidades não finalizadas — não pode ser desfeito.
                  </span>
                  <ActionIcon
                    icon="done"
                    variant="red"
                    label="Confirmar"
                    onClick={() =>
                      void patchRaw(
                        order.id,
                        { cancel: true },
                        `✓ ${shortOrderId(order.id)} → itens cancelados`,
                        'Nenhuma unidade cancelável nesse pedido.',
                      )
                    }
                  />
                  <ActionIcon icon="cancel" variant="gray" label="Cancelar" onClick={() => setCancellingOrderId(null)} />
                </span>
              ) : pickingUpOrderId === order.id ? (
                <span className="pay-inline">
                  <span className="confirm-inline__hint">
                    Isso muda o status de TODOS os itens do pedido.
                  </span>
                  <ActionIcon
                    icon="done"
                    variant="green"
                    label="Confirmar"
                    onClick={() =>
                      void patchRaw(
                        order.id,
                        { picked_up: true },
                        `✓ ${shortOrderId(order.id)} → itens retirados sem pagamento`,
                      )
                    }
                  />
                  <ActionIcon icon="cancel" variant="gray" label="Cancelar" onClick={() => setPickingUpOrderId(null)} />
                </span>
              ) : (
                <>
                  <ActionIcon
                    icon="summary"
                    variant="ink"
                    label="Verificar resumo"
                    onClick={() => setSummaryOrderId(order.id)}
                  />
                  {order.items.some(
                    (i) =>
                      !i.picked_up &&
                      (i.status === 'waiting-payment' || i.status === 'in-reserve'),
                  ) && (
                    <ActionIcon
                      icon="pickup"
                      variant="amber"
                      label="Retirado s/ pagamento (todos)"
                      onClick={() => setPickingUpOrderId(order.id)}
                    />
                  )}
                  {order.items.some(
                    (i) => i.picked_up && i.status === 'waiting-payment',
                  ) && (
                    <ActionIcon
                      icon="undo"
                      variant="gray"
                      label="Desfazer retirada (todos)"
                      onClick={() =>
                        void patchRaw(
                          order.id,
                          { picked_up: false },
                          `✓ ${shortOrderId(order.id)} → retiradas desfeitas`,
                        )
                      }
                    />
                  )}
                  <ActionIcon
                    icon="cancel"
                    variant="red"
                    label="Cancelar itens do pedido"
                    onClick={() => setCancellingOrderId(order.id)}
                  />
                </>
              )}
            </span>
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
                  {cancellingUnitId === item.unit_id ? (
                    <span className="pay-inline">
                      <span className="confirm-inline__hint">
                        Cancelamento não pode ser desfeito.
                      </span>
                      <ActionIcon icon="done" variant="red" label="Confirmar" onClick={() => void patch(order, item, { cancel: true }, 'Cancelado')} />
                      <ActionIcon icon="cancel" variant="gray" label="Cancelar" onClick={() => setCancellingUnitId(null)} />
                    </span>
                  ) : (
                    <>
                      {renderActions(order, item)}
                      {item.status !== 'cancelled' && obsUnitId !== item.unit_id && (
                        <ActionIcon
                          icon="note"
                          variant="gray"
                          filled={Boolean(item.observation)}
                          label={item.observation ? 'Editar observação' : 'Adicionar observação'}
                          onClick={() => openObservation(item)}
                        />
                      )}
                      {!isUnitClosed(item) && payingUnitId !== item.unit_id && (
                        <ActionIcon
                          icon="cancel"
                          variant="red"
                          label="Cancelar item"
                          onClick={() => setCancellingUnitId(item.unit_id)}
                        />
                      )}
                    </>
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
                      <ActionIcon
                        icon="done"
                        variant="green"
                        label="Salvar"
                        onClick={() =>
                          void patch(
                            order,
                            item,
                            { observation: obsText.trim() },
                            'Observação salva',
                          )
                        }
                      />
                      <ActionIcon icon="cancel" variant="gray" label="Cancelar" onClick={() => setObsUnitId(null)} />
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

      {summaryOrderId &&
        (() => {
          const order = orders.find((o) => o.id === summaryOrderId);
          return order ? (
            <OrderSummaryModal
              order={order}
              books={books}
              onClose={() => setSummaryOrderId(null)}
            />
          ) : null;
        })()}
    </div>
  );
}
