import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiAuthPost, apiAuthPut, apiGet } from '../../api/client';
import { clearToken } from '../../backoffice/auth';
import { useDirtyGuard } from '../../backoffice/useDirtyGuard';
import { centsToText, textToCents } from '../../lib/format';
import type { Book } from '../../lib/types';

interface FieldErrors {
  title?: string;
  price?: string;
}


export function LivroForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [priceText, setPriceText] = useState('');
  const [pages, setPages] = useState('');
  const [edition, setEdition] = useState('');
  const [year, setYear] = useState('');
  const [format, setFormat] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingBook, setLoadingBook] = useState(editing);

  // sujo = campos diferentes do estado inicial (vazio ao criar, carregado ao editar)
  const snapshot = JSON.stringify([title, author, description, priceText, pages, edition, year, format]);
  const baselineRef = useRef(JSON.stringify(['', '', '', '', '', '', '', '']));
  useDirtyGuard(snapshot !== baselineRef.current);

  useEffect(() => {
    if (!editing) return;
    apiGet<Book[]>('/livros')
      .then((books) => {
        const book = books.find((b) => b.id === id);
        if (!book) {
          setApiError(true);
          return;
        }
        setTitle(book.title);
        setAuthor(book.author ?? '');
        setDescription(book.description ?? '');
        setPriceText(centsToText(book.price));
        setPages(book.pages !== undefined ? String(book.pages) : '');
        setEdition(book.edition ?? '');
        setYear(book.year !== undefined ? String(book.year) : '');
        setFormat(book.format ?? '');
        baselineRef.current = JSON.stringify([
          book.title,
          book.author ?? '',
          book.description ?? '',
          centsToText(book.price),
          book.pages !== undefined ? String(book.pages) : '',
          book.edition ?? '',
          book.year !== undefined ? String(book.year) : '',
          book.format ?? '',
        ]);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          setUnauthorized(true);
          return;
        }
        setApiError(true);
      })
      .finally(() => setLoadingBook(false));
  }, [editing, id]);

  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault();

    const nextErrors: FieldErrors = {};
    const price = textToCents(priceText);
    if (!title.trim()) nextErrors.title = 'Informe o título.';
    if (price === null) nextErrors.price = 'Informe um preço válido (ex.: 49,90).';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload: Record<string, unknown> = {
      title: title.trim(),
      price,
    };
    if (description.trim()) payload.description = description.trim();
    if (author.trim()) payload.author = author.trim();
    if (pages.trim()) payload.pages = parseInt(pages, 10);
    if (edition.trim()) payload.edition = edition.trim();
    if (year.trim()) payload.year = parseInt(year, 10);
    if (format.trim()) payload.format = format.trim();

    setSaving(true);
    setApiError(false);
    try {
      if (editing) {
        await apiAuthPut(`/backoffice/livros/${id}`, payload);
      } else {
        await apiAuthPost('/backoffice/livros', payload);
      }
      navigate('/backoffice/livros', { state: { toast: 'Livro salvo' } });
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
  if (loadingBook) return <div className="bo-loading">Carregando…</div>;

  return (
    <div className="bo-content">
      <div className="livro-form__header">
        <Link to="/backoffice/livros">← Voltar pra lista</Link>
        <span className="livro-form__title">{editing ? 'Editar livro' : 'Novo livro'}</span>
      </div>

      <form className="livro-form" onSubmit={(e) => void submit(e)}>
        <label className="field-label" htmlFor="livro-titulo">
          Título
        </label>
        <input
          id="livro-titulo"
          className={`field-input${errors.title ? ' field-input--error' : ''}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {errors.title && <div className="field-error">{errors.title}</div>}

        <label className="field-label" htmlFor="livro-autor">
          Autor
        </label>
        <input
          id="livro-autor"
          className="field-input"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
        />

        <label className="field-label" htmlFor="livro-descricao">
          Descrição (parágrafos separados por linha em branco)
        </label>
        <textarea
          id="livro-descricao"
          rows={8}
          className="field-input livro-form__textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="livro-form__grid">
          <div>
            <label className="field-label" htmlFor="livro-preco">
              Preço (R$)
            </label>
            <input
              id="livro-preco"
              className={`field-input${errors.price ? ' field-input--error' : ''}`}
              placeholder="49,90"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
            />
            {errors.price && <div className="field-error">{errors.price}</div>}
          </div>
          <div>
            <label className="field-label" htmlFor="livro-paginas">
              Páginas
            </label>
            <input
              id="livro-paginas"
              className="field-input"
              inputMode="numeric"
              value={pages}
              onChange={(e) => setPages(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="livro-edicao">
              Edição
            </label>
            <input
              id="livro-edicao"
              className="field-input"
              placeholder="2ª edição"
              value={edition}
              onChange={(e) => setEdition(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="livro-ano">
              Ano
            </label>
            <input
              id="livro-ano"
              className="field-input"
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="livro-formato">
              Formato
            </label>
            <input
              id="livro-formato"
              className="field-input"
              placeholder="Ensaio · 14x21cm"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            />
          </div>
        </div>

        <div className="alert alert--warn livro-form__cover-note">
          A capa entra em frontend/public/images/&lt;stage&gt;/&lt;id&gt;.jpg — lembre que é
          preciso um novo build/deploy do site pra ela renderizar.
        </div>

        {apiError && (
          <div className="alert alert--error livro-form__api-error">
            Não foi possível salvar. Tente de novo.
          </div>
        )}

        <button className="btn btn--primary btn--block" type="submit" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </div>
  );
}
