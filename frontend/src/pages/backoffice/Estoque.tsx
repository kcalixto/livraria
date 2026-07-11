import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError, apiAuthGet, apiGet } from '../../api/client';
import { clearToken } from '../../backoffice/auth';
import { ACTIVE_REGION } from '../../lib/region';
import type { Book } from '../../lib/types';

interface StockRow {
  book_id: string;
  acquired: number;
  reserved: number;
  picked_up: number;
  sold: number;
  available: number;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'unauthorized' }
  | { kind: 'ready'; rows: StockRow[]; titles: Map<string, string> };

function qtyClass(qty: number): string {
  if (qty === 0) return 'stock-qty--zero';
  if (qty <= 3) return 'stock-qty--low';
  return 'stock-qty--ok';
}

export function Estoque() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const [rows, livros] = await Promise.all([
        apiAuthGet<StockRow[]>('/backoffice/estoque'),
        apiGet<Book[]>('/livros'),
      ]);
      setState({
        kind: 'ready',
        rows,
        titles: new Map(livros.map((b) => [b.id, b.title])),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        setState({ kind: 'unauthorized' });
        return;
      }
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'unauthorized') return <Navigate to="/backoffice" replace />;
  if (state.kind === 'loading') return <div className="bo-loading">Carregando…</div>;
  if (state.kind === 'error') {
    return (
      <div className="bo-state">
        <div className="alert alert--error">Não foi possível carregar o estoque.</div>
        <button className="btn btn--secondary" onClick={() => void load()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="bo-content">
      <div className="stock-region">Saldo real · {ACTIVE_REGION}</div>
      {state.rows.length === 0 ? (
        <div className="bo-empty">
          <div className="bo-empty__title">Nenhum livro em estoque</div>
          <div className="bo-empty__sub">Registre um lote de aquisição na aba Lotes.</div>
        </div>
      ) : (
        <div className="stock-table">
          <div className="stock-table__cols">
            <span>Título</span>
            <span className="t-center">Adquirido</span>
            <span className="t-center">Reservado</span>
            <span className="t-center">Retirado</span>
            <span className="t-center">Vendido</span>
            <span className="t-right">Disponível</span>
          </div>
          {state.rows.map((row) => (
            <div key={row.book_id} className="stock-table__row">
              <span className="stock-table__title">
                {state.titles.get(row.book_id) ?? row.book_id}
              </span>
              <span className="t-center stock-qty">{row.acquired}</span>
              <span className="t-center stock-qty">{row.reserved}</span>
              <span className="t-center stock-qty">{row.picked_up}</span>
              <span className="t-center stock-qty">{row.sold}</span>
              <span className={`t-right stock-qty ${qtyClass(row.available)}`}>
                {row.available}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
