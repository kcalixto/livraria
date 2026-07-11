import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError, apiAuthPost, apiGet } from '../../api/client';
import { clearToken } from '../../backoffice/auth';
import { textToCents } from '../../lib/format';
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
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [date, setDate] = useState(todayISO());
  const [costText, setCostText] = useState('');
  const [errors, setErrors] = useState<{ books?: string; cost?: string }>({});
  const [apiError, setApiError] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const titleOf = useMemo(() => {
    const map = new Map((books ?? []).map((b) => [b.id, b.title]));
    return (id: string) => map.get(id) ?? id;
  }, [books]);

  const available = useMemo(() => {
    const query = normalize(search.trim());
    return (books ?? []).filter(
      (b) => !selected.has(b.id) && (!query || normalize(b.title).includes(query)),
    );
  }, [books, search, selected]);

  function addBook(id: string) {
    setSelected((prev) => new Map(prev).set(id, 1));
  }

  function setAmount(id: string, amount: number) {
    setSelected((prev) => {
      const next = new Map(prev);
      next.set(id, amount);
      return next;
    });
  }

  function removeBook(id: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault();

    const nextErrors: { books?: string; cost?: string } = {};
    const entries = [...selected.entries()].filter(([, amount]) => amount >= 1);
    if (entries.length === 0) nextErrors.books = 'Adicione pelo menos um livro ao lote.';
    const totalCost = textToCents(costText);
    if (totalCost === null) nextErrors.cost = 'Informe um valor válido (ex.: 80,00).';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setApiError(false);
    try {
      await apiAuthPost('/backoffice/lotes', {
        date,
        region: ACTIVE_REGION_VALUE,
        books: entries.map(([book_id, amount]) => ({ book_id, amount })),
        total_cost: totalCost,
      });
      navigate('/backoffice/lotes');
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
            <label className="field-label" htmlFor="lote-valor">
              Valor total (R$)
            </label>
            <input
              id="lote-valor"
              className={`field-input${errors.cost ? ' field-input--error' : ''}`}
              placeholder="80,00"
              value={costText}
              onChange={(e) => setCostText(e.target.value)}
            />
            {errors.cost && <div className="field-error">{errors.cost}</div>}
          </div>
          <div>
            <span className="field-label">Região</span>
            <div className="lote-form__region">{ACTIVE_REGION}</div>
          </div>
        </div>

        <div className="lote-form__section">Livros adquiridos</div>
        {errors.books && <div className="field-error">{errors.books}</div>}

        {selected.size > 0 && (
          <div className="lote-form__selected">
            {[...selected.entries()].map(([id, amount]) => (
              <div key={id} className="lote-form__selected-row">
                <span className="lote-form__selected-title">{titleOf(id)}</span>
                <input
                  className="field-input lote-form__qty"
                  inputMode="numeric"
                  aria-label={`Quantidade de ${titleOf(id)}`}
                  value={amount === 0 ? '' : String(amount)}
                  onChange={(e) =>
                    setAmount(id, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)
                  }
                />
                <button
                  type="button"
                  className="cart-item__remove"
                  onClick={() => removeBook(id)}
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          className="field-input lote-form__search"
          placeholder="Buscar por título…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="lote-form__available">
          {available.map((book) => (
            <div key={book.id} className="lote-form__available-row">
              <span>{book.title}</span>
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
