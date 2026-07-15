import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import { Header } from '../components/Header';
import { LivroEntry } from '../components/LivroEntry';
import { normalizeText } from '../lib/format';
import { ACTIVE_REGION } from '../lib/region';
import type { Book } from '../lib/types';

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; books: Book[] };

function LoadingSkeleton() {
  return (
    <div className="skeleton" aria-label="Carregando catálogo">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton__entry">
          <div className="skeleton__cover" />
          <div className="skeleton__lines">
            <div className="skeleton__line skeleton__line--title" />
            <div className="skeleton__line" />
            <div className="skeleton__line" />
            <div className="skeleton__line skeleton__line--short" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Catalogo() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const books = await apiGet<Book[]>('/livros');
      setState({ kind: 'ready', books });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page">
      <Header />
      <main className="catalog">
        <div className="catalog__intro">
          <div className="catalog__kicker">Catálogo · {ACTIVE_REGION}</div>
          <p>
            Edições disponíveis para retirada e entrega na sua região. Estoque atualizado
            por ponto de distribuição.
          </p>
        </div>

        {state.kind === 'ready' && state.books.length > 0 && (
          <input
            className="field-input catalog__search"
            type="search"
            placeholder="Buscar por título…"
            aria-label="Buscar por título"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}

        {state.kind === 'loading' && <LoadingSkeleton />}

        {state.kind === 'error' && (
          <div className="catalog__error">
            <div className="alert alert--error">Não foi possível carregar o catálogo.</div>
            <button className="btn btn--secondary" onClick={() => void load()}>
              Tentar de novo
            </button>
          </div>
        )}

        {state.kind === 'ready' && state.books.length === 0 && (
          <div className="catalog__empty">
            <p className="catalog__empty-title">
              Ainda não há edições disponíveis em <strong>{ACTIVE_REGION}</strong>.
            </p>
          </div>
        )}

        {state.kind === 'ready' &&
          (() => {
            const query = normalizeText(search.trim());
            // busca antes do sort; esgotados por último, sort estável preserva a ordem da API
            const visible = state.books
              .filter((book) => !query || normalizeText(book.title).includes(query))
              .sort((a, b) => Number(a.amount === 0) - Number(b.amount === 0));
            if (state.books.length > 0 && visible.length === 0) {
              return (
                <div className="catalog__empty">
                  <p className="catalog__empty-title">
                    Nenhum título encontrado para <strong>{search.trim()}</strong>.
                  </p>
                </div>
              );
            }
            return visible.map((book) => <LivroEntry key={book.id} book={book} />);
          })()}
      </main>
    </div>
  );
}
