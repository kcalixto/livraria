import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Loading } from '../../components/Loading';
import { RedirectToLogin } from '../../components/RedirectToLogin';
import { ApiError, apiAuthGet } from '../../api/client';
import { canWrite, clearToken } from '../../backoffice/auth';
import { Toast } from '../../components/Toast';
import type { ToastData } from '../../components/Toast';
import { formatLoteDate } from '../../backoffice/lotes';
import type { Lote } from '../../backoffice/lotes';
import { formatPrice } from '../../lib/format';

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'unauthorized' }
  | { kind: 'ready'; lotes: Lote[] };

export function Lotes() {
  const location = useLocation();
  const [state, setState] = useState<State>({ kind: 'loading' });
  // "Lote registrado" vindo do form via navigation state
  const [toast, setToast] = useState<ToastData | null>(() => {
    const message = (location.state as { toast?: string } | null)?.toast;
    return message ? { kind: 'success', message } : null;
  });

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

  if (state.kind === 'unauthorized') return <RedirectToLogin />;
  if (state.kind === 'loading') return <Loading />;
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
      {toast && <Toast toast={toast} onDone={() => setToast(null)} />}
      <div className="bo-livros__toolbar">
        {canWrite() && (
          <Link to="/backoffice/lotes/novo" className="btn btn--primary">
            Novo lote
          </Link>
        )}
      </div>

      {state.lotes.length === 0 ? (
        <div className="bo-empty">
          <div className="bo-empty__title">Nenhum lote registrado</div>
          <div className="bo-empty__sub">Registre a primeira compra em "Novo lote".</div>
        </div>
      ) : (
        // linhas são links pro detalhe — mantêm role de link, sem roles de célula
        <div className="lotes-table" aria-label="Lotes de aquisição">
          <div className="lotes-table__cols">
            <span>Data</span>
            <span>Região</span>
            <span className="t-center">Livros</span>
            <span className="t-center">Restante</span>
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
                <span className="t-center">
                  {lote.total_remaining === 0 ? (
                    <span className="badge badge--zero">Esgotado</span>
                  ) : (
                    <span className="lotes-table__remaining">{lote.total_remaining ?? '—'}</span>
                  )}
                </span>
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
          {(() => {
            const sum = (fn: (l: Lote) => number) =>
              state.lotes.reduce((acc, l) => acc + fn(l), 0);
            const totalSold = sum((l) => l.sold_value ?? 0);
            const totalCost = sum((l) => l.total_cost);
            const totalSaldo = totalSold - totalCost;
            return (
              <div className="lotes-table__totals">
                <span className="lotes-table__totals-label">Total</span>
                <span />
                <span className="t-center">{sum((l) => l.total_books ?? 0)}</span>
                <span className="t-center">{sum((l) => l.total_remaining ?? 0)}</span>
                <span className="lotes-table__cost">{formatPrice(totalCost)}</span>
                <span className="lotes-table__sold">{formatPrice(totalSold)}</span>
                <span
                  className={`t-right lotes-table__saldo${totalSaldo >= 0 ? ' lotes-table__saldo--positive' : ''}`}
                >
                  {formatPrice(totalSaldo)}
                </span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
