import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ApiError, apiGet } from "../../api/client";
import { clearToken } from "../../backoffice/auth";
import { CoverThumb } from "../../components/CoverThumb";
import { formatPrice } from "../../lib/format";
import type { Book } from "../../lib/types";

// id encurtado clicável: copia o uuid completo (nome do arquivo da capa)
function IdChip({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button className="id-chip" title={id} onClick={() => void copy()}>
      {copied ? "copiado ✓" : `${id.slice(0, 4)}…`}
    </button>
  );
}

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unauthorized" }
  | { kind: "ready"; books: Book[] };

export function Livros() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const books = await apiGet<Book[]>("/livros");
      setState({ kind: "ready", books });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        setState({ kind: "unauthorized" });
        return;
      }
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "unauthorized")
    return <Navigate to="/backoffice" replace />;
  if (state.kind === "loading")
    return <div className="bo-loading">Carregando…</div>;
  if (state.kind === "error") {
    return (
      <div className="bo-state">
        <div className="alert alert--error">
          Não foi possível carregar os livros.
        </div>
        <button className="btn btn--secondary" onClick={() => void load()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="bo-content">
      <div className="bo-livros__toolbar">
        <Link to="/backoffice/livros/novo" className="btn btn--primary">
          Novo livro
        </Link>
      </div>

      {state.books.length === 0 ? (
        <div className="bo-empty">
          <div className="bo-empty__title">Nenhum livro cadastrado</div>
          <div className="bo-empty__sub">Crie o primeiro em "Novo livro".</div>
        </div>
      ) : (
        <div className="bo-livros">
          <div className="bo-livros__cols">
            <span>Capa</span>
            <span>Id</span>
            <span>Título</span>
            <span>Autor</span>
            <span>Preço</span>
            <span>Ano</span>
            <span className="t-right">Ações</span>
          </div>
          {state.books.map((book) => (
            <div key={book.id} className="bo-livros__row">
              <CoverThumb id={book.id} title={book.title} />
              <span>
                <IdChip id={book.id} />
              </span>
              <span className="bo-livros__title">{book.title}</span>
              <span className="bo-livros__author">{book.author ?? "—"}</span>
              <span className="bo-livros__price">
                {formatPrice(book.price)}
              </span>
              <span className="bo-livros__year">{book.year ?? "—"}</span>
              <span className="t-right bo-livros__actions">
                <Link
                  className="stage-action"
                  to={`/backoffice/livros/${book.id}/editar`}
                >
                  Editar
                </Link>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
