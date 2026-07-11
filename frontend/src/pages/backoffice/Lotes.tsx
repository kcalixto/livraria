import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError, apiAuthGet } from '../../api/client';
import { clearToken } from '../../backoffice/auth';
import { formatLoteDate } from '../../backoffice/lotes';
import type { Lote } from '../../backoffice/lotes';
import { formatPrice } from '../../lib/format';

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'unauthorized' }
  | { kind: 'ready'; lotes: Lote[] };

export function Lotes() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const lotes = await apiAuthGet<Lote[]>('/backoffice/lotes');
      setState({ kind: 'ready', lotes });
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
        <div className="alert alert--error">Não foi possível carregar os lotes.</div>
        <button className="btn btn--secondary" onClick={() => void load()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="bo-content">
      <div className="bo-livros__toolbar">
        <Link to="/backoffice/lotes/novo" className="btn btn--primary">
          Novo lote
        </Link>
      </div>

      {state.lotes.length === 0 ? (
        <div className="bo-empty">
          <div className="bo-empty__title">Nenhum lote registrado</div>
          <div className="bo-empty__sub">Registre a primeira compra em "Novo lote".</div>
        </div>
      ) : (
        <div className="lotes-table">
          <div className="lotes-table__cols">
            <span>Data</span>
            <span>Região</span>
            <span className="t-center">Livros</span>
            <span>Gasto</span>
            <span>Vendido</span>
            <span className="t-right">Saldo</span>
          </div>
          {state.lotes.map((lote) => {
            const sold = lote.sold_value ?? 0;
            const saldo = sold - lote.total_cost;
            return (
              <Link
                key={lote.id}
                to={`/backoffice/lotes/${lote.id}`}
                className="lotes-table__row"
              >
                <span className="lotes-table__date">{formatLoteDate(lote.date)}</span>
                <span className="lotes-table__region">{lote.region}</span>
                <span className="t-center lotes-table__count">{lote.total_books ?? 0}</span>
                <span className="lotes-table__cost">{formatPrice(lote.total_cost)}</span>
                <span className="lotes-table__sold">{formatPrice(sold)}</span>
                <span
                  className={`t-right lotes-table__saldo${saldo >= 0 ? ' lotes-table__saldo--positive' : ''}`}
                >
                  {formatPrice(saldo)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
