import { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiAuthDelete, apiAuthPut } from '../../api/client';
import { CoverThumb } from '../../components/CoverThumb';
import { DangerConfirmModal } from '../../components/DangerConfirmModal';
import { Loading } from '../../components/Loading';
import { RedirectToLogin } from '../../components/RedirectToLogin';
import { Toast } from '../../components/Toast';
import type { ToastData } from '../../components/Toast';
import { formatPrice } from '../../lib/format';
import { STAGES, orderedAt, shortOrderId } from '../../backoffice/order-status';
import type { UnitItem } from '../../backoffice/order-status';
import { useOrders } from '../../backoffice/useOrders';
import type { BookInfo } from '../../backoffice/useOrders';

function stagePillClass(item: UnitItem): string {
  const stage = STAGES[item.status];
  if (stage.pill) return `stage-pill--${stage.pill}`;
  if (stage.exceptional) return 'stage-pill--reserve';
  return `stage-pill--${stage.index}`;
}

function unitValue(item: UnitItem, books: Map<string, BookInfo>): string {
  if (item.status === 'cancelled') return '—';
  if (item.received_amount !== undefined) return formatPrice(item.received_amount);
  const book = books.get(item.title_id);
  return book ? formatPrice(book.price) : '—';
}

// Correção administrativa do pedido: mexe nas colunas editáveis
// (name/ordered_at) — created_at/updated_at são só do sistema.
export function PedidoEdit() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { loading, error, unauthorized, orders, books } = useOrders();

  // "Item atualizado/deletado" vindo da tela do item via navigation state
  const [toast, setToast] = useState<ToastData | null>(() => {
    const message = (location.state as { toast?: string } | null)?.toast;
    return message ? { kind: 'success', message } : null;
  });
  const clearToast = useCallback(() => setToast(null), []);

  // edições pendentes; null = ainda mostra o valor carregado
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [dateEdit, setDateEdit] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const order = orders.find((o) => o.id === id);

  if (unauthorized || sessionExpired) return <RedirectToLogin />;
  if (loading) return <Loading />;
  if (error || !order) {
    return (
      <div className="bo-state">
        <div className="alert alert--error">Não foi possível carregar o pedido.</div>
        <Link className="btn btn--secondary" to="/backoffice/pedidos">
          Voltar pra lista
        </Link>
      </div>
    );
  }

  const name = nameEdit ?? order.name;
  const orderedDate = dateEdit ?? orderedAt(order).slice(0, 10);

  function fail(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      setSessionExpired(true);
      return;
    }
    setApiError(true);
  }

  async function save(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setSaving(true);
    setApiError(false);
    try {
      await apiAuthPut(`/backoffice/pedidos/${order!.id}`, {
        name: name.trim(),
        ordered_at: orderedDate,
      });
      navigate('/backoffice/pedidos', { state: { toast: 'Pedido atualizado' } });
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrder() {
    setSaving(true);
    setApiError(false);
    try {
      await apiAuthDelete(`/backoffice/pedidos/${order!.id}`);
      navigate('/backoffice/pedidos', { state: { toast: 'Pedido deletado' } });
    } catch (err) {
      setConfirmingDelete(false);
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bo-content">
      <div className="livro-form__header">
        <Link to="/backoffice/pedidos">← Voltar pra lista</Link>
        <span className="livro-form__title">Editar pedido {shortOrderId(order.id)}</span>
      </div>

      <form className="livro-form" onSubmit={(e) => void save(e)}>
        <label className="field-label" htmlFor="pedido-cliente">
          Cliente
        </label>
        <input
          id="pedido-cliente"
          className={`field-input${nameError ? ' field-input--error' : ''}`}
          maxLength={80}
          value={name}
          onChange={(e) => setNameEdit(e.target.value)}
        />
        {nameError && <div className="field-error">Informe o nome do cliente.</div>}

        <label className="field-label" htmlFor="pedido-em">
          Pedido em
        </label>
        <input
          id="pedido-em"
          type="date"
          className="field-input pedido-edit__date"
          value={orderedDate}
          onChange={(e) => setDateEdit(e.target.value)}
        />

        {apiError && (
          <div className="alert alert--error livro-form__api-error">
            Não foi possível salvar. Tente de novo.
          </div>
        )}

        <button className="btn btn--primary btn--block" type="submit" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </form>

      <div className="pedido-edit__items-title">Itens do pedido</div>
      <div className="pedido-edit__items">
        {order.items.map((item) => (
          <button
            key={item.unit_id}
            type="button"
            className="pedido-edit__item"
            onClick={() =>
              navigate(`/backoffice/pedidos/${order.id}/itens/${item.unit_id}/editar`)
            }
          >
            <CoverThumb
              id={item.title_id}
              title={books.get(item.title_id)?.title ?? item.title_id}
            />
            <span className="pedido-edit__item-title">
              {books.get(item.title_id)?.title ?? item.title_id}
            </span>
            <span className="pedido-edit__item-value">{unitValue(item, books)}</span>
            <span className={`stage-pill ${stagePillClass(item)}`}>
              {STAGES[item.status].label}
            </span>
          </button>
        ))}
      </div>

      <button
        className="btn btn--danger pedido-edit__delete"
        type="button"
        onClick={() => setConfirmingDelete(true)}
      >
        Deletar pedido
      </button>

      {confirmingDelete && (
        <DangerConfirmModal
          title="Deletar pedido"
          description={`Apaga o pedido ${shortOrderId(order.id)} e todas as unidades da base — a operação NÃO é reversível e não devolve registros de venda.`}
          busy={saving}
          onConfirm={() => void deleteOrder()}
          onClose={() => setConfirmingDelete(false)}
        />
      )}

      {toast && <Toast toast={toast} onDone={clearToast} />}
    </div>
  );
}
