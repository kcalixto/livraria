import { CoverThumb } from '../../components/CoverThumb';
import { Loading } from '../../components/Loading';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError, apiAuthPost, apiGet } from '../../api/client';
import { clearToken } from '../../backoffice/auth';
import { useDirtyGuard } from '../../backoffice/useDirtyGuard';
import { formatPrice } from '../../lib/format';
import { ACTIVE_REGION, ACTIVE_REGION_VALUE } from '../../lib/region';
import { socialPriceOf } from '../../lib/types';
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
  // linhas compradas pelo preço social (o custo real pago no lote)
  const [socialCost, setSocialCost] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(todayISO());
  const [observation, setObservation] = useState('');
  // input de quantidade em edição (id + texto cru), pra permitir campo vazio
  const [qtyDraft, setQtyDraft] = useState<{ id: string; text: string } | null>(null);
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

  // custo do lote é CALCULADO: Σ preço (cheio ou social, por linha) × quantidade
  const unitCost = (id: string): number => {
    const book = bookOf(id);
    if (!book) return 0;
    return socialCost.has(id) ? socialPriceOf(book) : book.price;
  };
  const totalCost = [...selected.entries()].reduce(
    (sum, [id, amount]) => sum + unitCost(id) * amount,
    0,
  );

  function toggleSocialCost(id: string) {
    setSocialCost((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // fecha o dropdown junto: o operador confere o livro entrando na lista
  function addBook(id: string) {
    setSelected((prev) => new Map(prev).set(id, 1));
    setSearch('');
    setSearchOpen(false);
  }

  // 0 é quantidade válida (rascunho de digitação): só o stepper de menos
  // remove a linha, e o Salvar trava enquanto houver zerado
  function setAmount(id: string, amount: number) {
    setSelected((prev) => new Map(prev).set(id, Math.max(0, amount)));
  }

  function removeBook(id: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setQtyDraft(null);
  }

  // enquanto o input está em foco o valor vive no rascunho: dá pra apagar o
  // "1" e digitar "10" sem a linha sumir no meio do caminho
  function commitDraft() {
    if (!qtyDraft) return;
    setAmount(qtyDraft.id, parseInt(qtyDraft.text, 10) || 0);
    setQtyDraft(null);
  }

  function qtyValue(id: string, amount: number): string {
    return qtyDraft?.id === id ? qtyDraft.text : String(amount);
  }

  // cadastro inconsistente: título na lista com quantidade 0
  const hasZeroed = [...selected.values()].some((amount) => amount === 0);

  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault();

    const entries = [...selected.entries()].filter(([, amount]) => amount > 0);
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
        ...(observation.trim() && { observation: observation.trim() }),
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
  if (!books) return <Loading />;

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
            <span className="field-label">Total do lote</span>
            <div className="lote-form__total">{formatPrice(totalCost)}</div>
            <span className="lote-form__total-hint">Σ preço × quantidade</span>
          </div>
        </div>

        <label className="field-label" htmlFor="lote-observacao">
          Observação (opcional)
        </label>
        <textarea
          id="lote-observacao"
          rows={2}
          maxLength={200}
          className="field-input livro-form__textarea"
          placeholder="Contexto da compra: de quem veio, condição, combinado…"
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
        />
        <div className="lote-form__counter">{observation.length}/200</div>

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
                  <CoverThumb slug={book.slug} title={book.title} />
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
                  <CoverThumb slug={book?.slug} title={title} />
                  <span className="lote-form__selected-title">{title}</span>
                  <label className="lote-form__social-toggle">
                    <input
                      type="checkbox"
                      checked={socialCost.has(id)}
                      onChange={() => toggleSocialCost(id)}
                    />
                    custo social
                  </label>
                  <span className="lote-form__selected-subtotal">
                    {book ? formatPrice(unitCost(id) * amount) : '—'}
                  </span>
                  <span className="stepper">
                    <button
                      type="button"
                      className="stepper__btn"
                      aria-label={`Menos uma unidade de ${title}`}
                      onClick={() =>
                        amount <= 1 ? removeBook(id) : setAmount(id, amount - 1)
                      }
                    >
                      −
                    </button>
                    <input
                      className="stepper__value lote-form__qty"
                      inputMode="numeric"
                      aria-label={`Quantidade de ${title}`}
                      value={qtyValue(id, amount)}
                      onFocus={() => setQtyDraft({ id, text: String(amount) })}
                      onBlur={commitDraft}
                      onChange={(e) =>
                        setQtyDraft({ id, text: e.target.value.replace(/\D/g, '') })
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

        {hasZeroed && (
          <div className="field-error">
            Informe a quantidade dos títulos zerados (ou remova com o −).
          </div>
        )}
        <button
          className="btn btn--primary btn--block"
          type="submit"
          disabled={saving || hasZeroed}
        >
          {saving ? 'Salvando…' : 'Salvar lote'}
        </button>
      </form>
    </div>
  );
}
