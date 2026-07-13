import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RedirectToLogin } from '../../components/RedirectToLogin';
import { ApiError, apiAuthGet, apiGet } from '../../api/client';
import { clearToken } from '../../backoffice/auth';
import { CoverThumb } from '../../components/CoverThumb';
import { ACTIVE_REGION } from '../../lib/region';
import type { Book } from '../../lib/types';

const SEARCH_DEBOUNCE_MS = 200;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

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
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // debounce: atualiza a filtragem só depois de 200ms sem digitação
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

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

  if (state.kind === 'unauthorized') return <RedirectToLogin />;
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

  const query = normalize(debouncedSearch.trim());
  const rows = state.rows
    .filter((row) => {
      if (!query) return true;
      const title = state.titles.get(row.book_id) ?? row.book_id;
      return normalize(title).includes(query);
    })
    // zerados no topo: são os que pedem ação (registrar lote)
    .sort((a, b) => {
      const az = a.available === 0 ? 0 : 1;
      const bz = b.available === 0 ? 0 : 1;
      return az - bz;
    });

  const zeroed = state.rows.filter((r) => r.available === 0).length;
  const low = state.rows.filter((r) => r.available > 0 && r.available <= 3).length;

  return (
    <div className="bo-content">
      <div className="stock-region">Saldo real · {ACTIVE_REGION}</div>
      {(zeroed > 0 || low > 0) && (
        <div className="stock-counters">
          {zeroed > 0 && (
            <span className="stock-counters__zeroed">
              {zeroed} zerado{zeroed === 1 ? '' : 's'}
            </span>
          )}
          {zeroed > 0 && low > 0 && ' · '}
          {low > 0 && (
            <span className="stock-counters__low">
              {low} baixo{low === 1 ? '' : 's'}
            </span>
          )}
          {zeroed > 0 && (
            <Link to="/backoffice/lotes/novo" className="stock-counters__link">
              Registrar lote
            </Link>
          )}
        </div>
      )}
      <input
        className="field-input stock-search"
        placeholder="Buscar por título…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {rows.length === 0 ? (
        <div className="bo-empty">
          <div className="bo-empty__title">Nenhum livro encontrado</div>
          <div className="bo-empty__sub">
            {state.rows.length === 0
              ? 'Registre um lote de aquisição na aba Lotes.'
              : 'Ajuste a busca por título.'}
          </div>
        </div>
      ) : (
        <div className="stock-table">
          <div className="stock-table__cols stock-table__cols--covers">
            <span>Capa</span>
            <span>Título</span>
            <span className="t-center">Reservado</span>
            <span className="t-center">Retirado</span>
            <span className="t-center">Vendido</span>
            <span className="t-right">Disponível</span>
          </div>
          {rows.map((row) => (
            <div key={row.book_id} className="stock-table__row stock-table__row--covers">
              <CoverThumb id={row.book_id} title={state.titles.get(row.book_id) ?? row.book_id} />
              <span className="stock-table__title">
                {state.titles.get(row.book_id) ?? row.book_id}
              </span>
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
