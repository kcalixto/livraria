import { useState } from 'react';
import { ApiError, apiGet } from '../api/client';
import { isUnitFinalized, STAGES } from '../backoffice/order-status';
import type { OrderStatus, UnitItem } from '../backoffice/order-status';
import { ClampedText } from '../components/ClampedText';
import { Header } from '../components/Header';
import { formatOrderCode } from '../lib/format';
import type { Book } from '../lib/types';

const OBSERVATION_CLAMP = 200;

// resposta pública: sem name/contact/valores (o código é a única credencial)
interface PublicUnit {
  title_id: string;
  status: OrderStatus;
  picked_up?: boolean;
  observation?: string;
}

interface PublicOrder {
  id: string;
  created_at: string;
  items: PublicUnit[];
}

function statusLabel(item: PublicUnit): string {
  if (isUnitFinalized(item as UnitItem)) return 'Entregue';
  return STAGES[item.status].label;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

type Result =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'notfound' }
  | { kind: 'error' }
  | { kind: 'found'; order: PublicOrder; titles: Map<string, string> };

export function ConsultarPedido() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Result>({ kind: 'idle' });

  async function consult(e: { preventDefault: () => void }) {
    e.preventDefault();
    const normalized = code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!normalized) return;

    setResult({ kind: 'loading' });
    try {
      const [order, livros] = await Promise.all([
        apiGet<PublicOrder>(`/pedidos/${normalized}`),
        apiGet<Book[]>('/livros'),
      ]);
      setResult({
        kind: 'found',
        order,
        titles: new Map(livros.map((b) => [b.id, b.title])),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setResult({ kind: 'notfound' });
        return;
      }
      setResult({ kind: 'error' });
    }
  }

  return (
    <div className="page">
      <Header />
      <div className="consulta">
        <h1 className="consulta__title">Consultar pedido</h1>
        <p className="consulta__sub">
          Digite o código que você recebeu ao finalizar o pedido (ex.: AJ3-C9K).
        </p>

        <form className="consulta__form" onSubmit={(e) => void consult(e)}>
          <div className="consulta__field">
            <label className="field-label" htmlFor="consulta-codigo">
              Código do pedido
            </label>
            <input
              id="consulta-codigo"
              className="field-input"
              autoFocus
              placeholder="AJ3-C9K"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <button
            className="btn btn--primary"
            type="submit"
            disabled={result.kind === 'loading'}
          >
            {result.kind === 'loading' ? 'Consultando…' : 'Consultar'}
          </button>
        </form>

        {result.kind === 'notfound' && (
          <div className="alert alert--error consulta__alert" role="alert">
            Pedido não encontrado — confira o código.
          </div>
        )}
        {result.kind === 'error' && (
          <div className="alert alert--error consulta__alert" role="alert">
            Não foi possível consultar agora. Tente de novo.
          </div>
        )}

        {result.kind === 'found' && (
          <div className="consulta__result">
            <div className="consulta__order-head">
              <span className="consulta__order-id">
                #{formatOrderCode(result.order.id)}
              </span>
              <span className="consulta__order-date">
                feito em {formatDate(result.order.created_at)}
              </span>
            </div>
            {result.order.items.map((item, i) => (
              <div key={i} className="consulta__unit">
                <div className="consulta__unit-head">
                  <span className="consulta__unit-title">
                    {result.titles.get(item.title_id) ?? 'Livro'}
                  </span>
                  <span className="consulta__unit-status">{statusLabel(item)}</span>
                </div>
                {item.observation && (
                  <ClampedText
                    text={item.observation}
                    limit={OBSERVATION_CLAMP}
                    className="consulta__unit-obs"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
