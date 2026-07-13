import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RedirectToLogin } from '../../components/RedirectToLogin';
import { ApiError, apiAuthGet, apiGet } from '../../api/client';
import { clearToken } from '../../backoffice/auth';
import { CoverThumb } from '../../components/CoverThumb';
import { csvEscape } from '../../lib/csv';
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

type SortKey = 'title' | 'reserved' | 'picked_up' | 'sold' | 'available';
interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}


function qtyClass(qty: number): string {
  if (qty === 0) return 'stock-qty--zero';
  if (qty <= 3) return 'stock-qty--low';
  return 'stock-qty--ok';
}

export function Estoque() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<Sort | null>(null);

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
  const titleOf = (row: StockRow) => state.titles.get(row.book_id) ?? row.book_id;
  const rows = state.rows
    .filter((row) => !query || normalize(titleOf(row)).includes(query))
    .sort((a, b) => {
      if (sort) {
        // ordenação explícita pedida pelo operador substitui zerados-primeiro
        const cmp =
          sort.key === 'title'
            ? titleOf(a).localeCompare(titleOf(b), 'pt-BR')
            : a[sort.key] - b[sort.key];
        return sort.dir === 'asc' ? cmp : -cmp;
      }
      // padrão: zerados no topo, são os que pedem ação (registrar lote)
      const az = a.available === 0 ? 0 : 1;
      const bz = b.available === 0 ? 0 : 1;
      return az - bz;
    });

  // 1º clique: numéricas desc, título asc; 2º clique inverte
  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (prev?.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: key === 'title' ? 'asc' : 'desc' };
    });
  }

  function exportCsv() {
    const header = 'titulo;reservado;retirado;vendido;disponivel';
    const lines = rows.map((row) =>
      [csvEscape(titleOf(row)), row.reserved, row.picked_up, row.sold, row.available].join(';'),
    );
    // BOM pro Excel pt-BR reconhecer UTF-8
    const blob = new Blob(['﻿' + [header, ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `estoque-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

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
      <div className="stock-toolbar">
        <input
          className="field-input stock-search"
          placeholder="Buscar por título…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn--secondary" onClick={exportCsv}>
          Exportar CSV
        </button>
      </div>
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
        <div className="stock-table" role="table" aria-label="Estoque por livro">
          <div className="stock-table__cols stock-table__cols--covers" role="row">
            <span role="columnheader">Capa</span>
            {(
              [
                ['title', 'Título', ''],
                ['reserved', 'Reservado', 't-center'],
                ['picked_up', 'Retirado', 't-center'],
                ['sold', 'Vendido', 't-center'],
                ['available', 'Disponível', 't-right'],
              ] as Array<[SortKey, string, string]>
            ).map(([key, label, align]) => (
              <span
                key={key}
                className={align}
                role="columnheader"
                aria-sort={
                  sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
                }
              >
                <button className="stock-sort-btn" onClick={() => toggleSort(key)}>
                  {label}
                  {sort?.key === key && (
                    <span aria-hidden="true"> {sort.dir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </button>
              </span>
            ))}
          </div>
          {rows.map((row) => (
            <div
              key={row.book_id}
              className="stock-table__row stock-table__row--covers"
              role="row"
            >
              <CoverThumb
                id={row.book_id}
                title={state.titles.get(row.book_id) ?? row.book_id}
                role="cell"
              />
              <span className="stock-table__title" role="cell">
                {state.titles.get(row.book_id) ?? row.book_id}
              </span>
              <span className="t-center stock-qty" role="cell">{row.reserved}</span>
              <span className="t-center stock-qty" role="cell">{row.picked_up}</span>
              <span className="t-center stock-qty" role="cell">{row.sold}</span>
              <span className={`t-right stock-qty ${qtyClass(row.available)}`} role="cell">
                {row.available}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
