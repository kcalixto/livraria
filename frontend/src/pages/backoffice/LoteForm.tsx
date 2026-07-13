import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError, apiAuthPost, apiGet } from '../../api/client';
import { clearToken } from '../../backoffice/auth';
import { useDirtyGuard } from '../../backoffice/useDirtyGuard';
import { formatPrice } from '../../lib/format';
import { ACTIVE_REGION, ACTIVE_REGION_VALUE } from '../../lib/region';
import type { Book } from '../../lib/types';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function LoteForm() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [date, setDate] = useState(todayISO());
  const [booksError, setBooksError] = useState('');
  const [apiError, setApiError] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchAreaRef = useRef<HTMLDivElement>(null);

  // lote com livros adicionados = trabalho em andamento
  useDirtyGuard(selected.size > 0);

  useEffect(() => {
    apiGet<Book[]>('/livros')
      .then(setBooks)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          setUnauthorized(true);
          return;
        }
        setApiError(true);
      });
  }, []);

  // dropdown fecha ao clicar fora da área de busca
  useEffect(() => {
    if (!searchOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (searchAreaRef.current && !searchAreaRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [searchOpen]);

  const bookOf = useMemo(() => {
    const map = new Map((books ?? []).map((b) => [b.id, b]));
    return (id: string) => map.get(id);
  }, [books]);

  const available = useMemo(() => {
    const query = normalize(search.trim());
    return (books ?? []).filter(
      (b) => !selected.has(b.id) && (!query || normalize(b.title).includes(query)),
    );
  }, [books, search, selected]);

  // custo do lote é CALCULADO: Σ preço do catálogo × quantidade
  const totalCost = useMemo(
    () =>
      [...selected.entries()].reduce(
        (sum, [id, amount]) => sum + (bookOf(id)?.price ?? 0) * amount,
        0,
      ),
    [selected, bookOf],
  );

  // dropdown fica aberto: o fluxo comum é adicionar vários livros em sequência
  function addBook(id: string) {
    setSelected((prev) => new Map(prev).set(id, 1));
    setSearch('');
  }

  function setAmount(id: string, amount: number) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (amount < 1) next.delete(id);
      else next.set(id, amount);
      return next;
    });
  }

  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault();

    const entries = [...selected.entries()];
    if (entries.length === 0) {
      setBooksError('Adicione pelo menos um livro ao lote.');
      return;
    }
    setBooksError('');

    setSaving(true);
    setApiError(false);
    try {
      await apiAuthPost('/backoffice/lotes', {
        date,
        region: ACTIVE_REGION_VALUE,
        books: entries.map(([book_id, amount]) => ({ book_id, amount })),
        total_cost: totalCost,
      });
      navigate('/backoffice/lotes', { state: { toast: 'Lote registrado' } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        setUnauthorized(true);
        return;
      }
      setApiError(true);
    } finally {
      setSaving(false);
    }
  }

  if (unauthorized) return <Navigate to="/backoffice" replace />;
  if (!books) return <div className="bo-loading">Carregando…</div>;

  return (
    <div className="bo-content">
      <div className="livro-form__header">
        <Link to="/backoffice/lotes">← Voltar pros lotes</Link>
        <span className="livro-form__title">Novo lote</span>
      </div>

      <form className="lote-form" onSubmit={(e) => void submit(e)}>
        <div className="livro-form__grid">
          <div>
            <label className="field-label" htmlFor="lote-data">
              Data da compra
            </label>
            <input
              id="lote-data"
              type="date"
              className="field-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <span className="field-label">Região</span>
            <div className="lote-form__region">{ACTIVE_REGION}</div>
          </div>
          <div>
            <span className="field-label">Total do lote (calculado)</span>
            <div className="lote-form__total">{formatPrice(totalCost)}</div>
          </div>
        </div>

        <div className="lote-form__section">Livros adquiridos</div>
        {booksError && <div className="field-error">{booksError}</div>}

        <div className="lote-form__search-area" ref={searchAreaRef}>
          <input
            className="field-input lote-form__search"
            placeholder="Buscar por título…"
            value={search}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchOpen(true);
            }}
          />
          {searchOpen && (
            <div className="lote-form__available">
              {available.map((book) => (
                <div key={book.id} className="lote-form__available-row">
                  <span>
                    {book.title}
                    <span className="lote-form__available-price">
                      {formatPrice(book.price)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="stage-action"
                    onClick={() => addBook(book.id)}
                  >
                    Adicionar
                  </button>
                </div>
              ))}
              {available.length === 0 && (
                <div className="lote-form__no-results">Nenhum título encontrado.</div>
              )}
            </div>
          )}
        </div>

        {selected.size > 0 && (
          <div className="lote-form__selected">
            {[...selected.entries()].map(([id, amount]) => {
              const book = bookOf(id);
              const title = book?.title ?? id;
              return (
                <div key={id} className="lote-form__selected-row">
                  <span className="lote-form__selected-title">{title}</span>
                  <span className="lote-form__selected-subtotal">
                    {book ? formatPrice(book.price * amount) : '—'}
                  </span>
                  <span className="stepper">
                    <button
                      type="button"
                      className="stepper__btn"
                      aria-label={`Menos uma unidade de ${title}`}
                      onClick={() => setAmount(id, amount - 1)}
                    >
                      −
                    </button>
                    <input
                      className="stepper__value lote-form__qty"
                      inputMode="numeric"
                      aria-label={`Quantidade de ${title}`}
                      value={String(amount)}
                      onChange={(e) =>
                        setAmount(id, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)
                      }
                    />
                    <button
                      type="button"
                      className="stepper__btn"
                      aria-label={`Mais uma unidade de ${title}`}
                      onClick={() => setAmount(id, amount + 1)}
                    >
                      +
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {apiError && (
          <div className="alert alert--error livro-form__api-error">
            Não foi possível salvar. Tente de novo.
          </div>
        )}

        <button className="btn btn--primary btn--block" type="submit" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar lote'}
        </button>
      </form>
    </div>
  );
}
