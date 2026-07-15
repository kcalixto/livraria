import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiAuthDelete, apiAuthPut } from '../../api/client';
import { CoverThumb } from '../../components/CoverThumb';
import { DangerConfirmModal } from '../../components/DangerConfirmModal';
import { Loading } from '../../components/Loading';
import { RedirectToLogin } from '../../components/RedirectToLogin';
import { centsToText, textToCents } from '../../lib/format';
import {
  STAGES,
  finalizedAtOf,
  formatOrderDate,
  orderedAt,
  shortOrderId,
} from '../../backoffice/order-status';
import type { OrderStatus } from '../../backoffice/order-status';
import { useOrders } from '../../backoffice/useOrders';

// Correção administrativa da unidade: rota de "set direto" no back — mexe em
// received_amount/finalized_at/status/social_price/observation sem a matriz
// de transição (os efeitos de estoque continuam valendo lá).
export function PedidoItemEdit() {
  const { id, unitId } = useParams();
  const navigate = useNavigate();
  const { loading, error, unauthorized, orders, books } = useOrders();

  // edições pendentes; null = ainda mostra o valor carregado
  const [valorEdit, setValorEdit] = useState<string | null>(null);
  const [dateEdit, setDateEdit] = useState<string | null>(null);
  const [statusEdit, setStatusEdit] = useState<OrderStatus | null>(null);
  const [socialEdit, setSocialEdit] = useState<boolean | null>(null);
  const [obsEdit, setObsEdit] = useState<string | null>(null);
  const [valorError, setValorError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const order = orders.find((o) => o.id === id);
  const item = order?.items.find((i) => i.unit_id === unitId);

  if (unauthorized || sessionExpired) return <RedirectToLogin />;
  if (loading) return <Loading />;
  if (error || !order || !item) {
    return (
      <div className="bo-state">
        <div className="alert alert--error">Não foi possível carregar o item.</div>
        <Link className="btn btn--secondary" to="/backoffice/pedidos">
          Voltar pra lista
        </Link>
      </div>
    );
  }

  const bookTitle = books.get(item.title_id)?.title ?? item.title_id;
  const valor =
    valorEdit ?? (item.received_amount !== undefined ? centsToText(item.received_amount) : '');
  const finalizedDate = dateEdit ?? finalizedAtOf(item)?.slice(0, 10) ?? '';
  const status = statusEdit ?? item.status;
  const social = socialEdit ?? item.social_price === true;
  const observation = obsEdit ?? item.observation ?? '';
  const backTo = `/backoffice/pedidos/${order.id}/editar`;

  function fail(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      setSessionExpired(true);
      return;
    }
    setApiError(true);
  }

  async function save(e: { preventDefault: () => void }) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      status,
      social_price: social,
      observation, // vazia = backend remove o atributo
    };
    if (valor.trim()) {
      const cents = textToCents(valor);
      if (cents === null) {
        setValorError(true);
        return;
      }
      body.received_amount = cents;
    }
    setValorError(false);
    if (finalizedDate) body.finalized_at = finalizedDate;

    setSaving(true);
    setApiError(false);
    try {
      await apiAuthPut(`/backoffice/pedidos/${order!.id}/unidades/${item!.unit_id}`, body);
      navigate(backTo, { state: { toast: 'Item atualizado' } });
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem() {
    setSaving(true);
    setApiError(false);
    try {
      await apiAuthDelete(`/backoffice/pedidos/${order!.id}/unidades/${item!.unit_id}`);
      navigate(backTo, { state: { toast: 'Item deletado' } });
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
        <Link to={backTo}>← Voltar pro pedido</Link>
        <span className="livro-form__title">Editar item</span>
      </div>

      {/* contexto do pedido: só leitura — edita na tela do pedido */}
      <div className="pedido-edit__meta">
        <CoverThumb id={item.title_id} title={bookTitle} />
        <dl>
          <div>
            <dt>Pedido</dt>
            <dd>{shortOrderId(order.id)}</dd>
          </div>
          <div>
            <dt>Cliente</dt>
            <dd>{order.name}</dd>
          </div>
          <div>
            <dt>Livro</dt>
            <dd>{bookTitle}</dd>
          </div>
          <div>
            <dt>Pedido em</dt>
            <dd>{formatOrderDate(orderedAt(order))}</dd>
          </div>
        </dl>
      </div>

      <form className="livro-form" onSubmit={(e) => void save(e)}>
        <label className="field-label" htmlFor="item-valor">
          Valor pago (R$)
        </label>
        <input
          id="item-valor"
          className={`field-input${valorError ? ' field-input--error' : ''}`}
          inputMode="decimal"
          placeholder="20,00"
          value={valor}
          onChange={(e) => setValorEdit(e.target.value)}
        />
        {valorError && <div className="field-error">Informe um valor válido (ex.: 20,00).</div>}

        <label className="field-label" htmlFor="item-finalizado">
          Finalizado em
        </label>
        <input
          id="item-finalizado"
          type="date"
          className="field-input pedido-edit__date"
          value={finalizedDate}
          onChange={(e) => setDateEdit(e.target.value)}
        />

        <label className="field-label" htmlFor="item-status">
          Status
        </label>
        <select
          id="item-status"
          className="field-input"
          value={status}
          onChange={(e) => setStatusEdit(e.target.value as OrderStatus)}
        >
          {(Object.keys(STAGES) as OrderStatus[]).map((value) => (
            <option key={value} value={value}>
              {STAGES[value].label}
            </option>
          ))}
        </select>

        <label className="pedido-edit__check">
          <input
            type="checkbox"
            checked={social}
            onChange={(e) => setSocialEdit(e.target.checked)}
          />
          Preço social
        </label>

        <label className="field-label" htmlFor="item-obs">
          Observação
        </label>
        <textarea
          id="item-obs"
          rows={4}
          maxLength={1000}
          className="field-input livro-form__textarea"
          value={observation}
          onChange={(e) => setObsEdit(e.target.value)}
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

      <button
        className="btn btn--danger pedido-edit__delete"
        type="button"
        onClick={() => setConfirmingDelete(true)}
      >
        Deletar item
      </button>

      {confirmingDelete && (
        <DangerConfirmModal
          title="Deletar item"
          description={`Apaga a unidade de "${bookTitle}" do pedido ${shortOrderId(order.id)} — a operação NÃO é reversível e não devolve registros de venda.`}
          busy={saving}
          onConfirm={() => void deleteItem()}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
