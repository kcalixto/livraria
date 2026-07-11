import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ApiError, apiAuthGet, apiGet } from '../../api/client';
import { clearToken } from '../../backoffice/auth';
import { formatLoteDate } from '../../backoffice/lotes';
import type { LoteDetailData } from '../../backoffice/lotes';
import { formatPrice } from '../../lib/format';
import type { Book } from '../../lib/types';

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'unauthorized' }
  | { kind: 'ready'; lote: LoteDetailData; titles: Map<string, string> };

export function LoteDetail() {
  const { id } = useParams();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const [lote, livros] = await Promise.all([
        apiAuthGet<LoteDetailData>(`/backoffice/lotes/${id}`),
        apiGet<Book[]>('/livros'),
      ]);
      setState({
        kind: 'ready',
        lote,
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
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'unauthorized') return <Navigate to="/backoffice" replace />;
  if (state.kind === 'loading') return <div className="bo-loading">Carregando…</div>;
  if (state.kind === 'error') {
    return (
      <div className="bo-state">
        <div className="alert alert--error">Não foi possível carregar o lote.</div>
        <button className="btn btn--secondary" onClick={() => void load()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  const { lote, titles } = state;
  const saldo = lote.sold_value - lote.total_cost;

  return (
    <div className="bo-content">
      <div className="livro-form__header">
        <Link to="/backoffice/lotes">← Voltar pros lotes</Link>
        <span className="livro-form__title">Lote de {formatLoteDate(lote.date)}</span>
      </div>

      <div className="lote-detail__summary">
        <div>
          <span className="lote-detail__label">Região</span>
          <span>{lote.region}</span>
        </div>
        <div>
          <span className="lote-detail__label">Gasto</span>
          <span className="lotes-table__cost">{formatPrice(lote.total_cost)}</span>
        </div>
        <div>
          <span className="lote-detail__label">Vendido</span>
          <span className="lotes-table__sold">{formatPrice(lote.sold_value)}</span>
        </div>
        <div>
          <span className="lote-detail__label">Saldo</span>
          <span
            className={`lotes-table__saldo${saldo >= 0 ? ' lotes-table__saldo--positive' : ''}`}
          >
            {formatPrice(saldo)}
          </span>
        </div>
      </div>

      <div className="lote-detail__cols">
        <span>Livro</span>
        <span className="t-center">Adquirido</span>
        <span className="t-center">Reservado</span>
        <span className="t-center">Retirado</span>
        <span className="t-center">Vendido</span>
        <span className="t-center">Restante</span>
      </div>
      {lote.books.map((book) => (
        <div key={book.book_id} className="lote-detail__row">
          <span className="lote-detail__title">{titles.get(book.book_id) ?? book.book_id}</span>
          <span className="t-center">{book.acquired}</span>
          <span className="t-center">{book.reserved}</span>
          <span className="t-center">{book.picked_up}</span>
          <span className="t-center">{book.sold}</span>
          <span className={`t-center lote-detail__remaining${book.remaining === 0 ? ' lote-detail__remaining--zero' : ''}`}>
            {book.remaining}
          </span>
        </div>
      ))}
    </div>
  );
}
