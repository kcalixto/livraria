import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, apiGet, apiPost } from "../../api/client";
import { Header } from "../../components/Header";
import { formatOrderCode } from "../../lib/format";

interface PublicReadInfo {
  name: string;
  items: {
    book_name: string;
    status: string;
  }[];
}

type Result =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "notfound"; read: PublicReadInfo }
  | { kind: "error" }
  | { kind: "found"; read: PublicReadInfo };

type BookAddResult =
  { kind: "idle" } | { kind: "loading" } | { kind: "error" } | { kind: "done" };

export function MinhaLeitura() {
  const [searchParams] = useSearchParams();
  // vindo da done-screen: o código chega na query e o input já sai preenchido
  const [name, setName] = useState(() => {
    const fromQuery = searchParams.get("codigo");
    return fromQuery ? formatOrderCode(fromQuery.toUpperCase()) : "";
  });
  const [bookName, setBookName] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [bookAddResult, setBookAddResult] = useState<BookAddResult>({
    kind: "idle",
  });

  async function consult(e: { preventDefault: () => void }) {
    e.preventDefault();
    const normalized = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (!normalized) return;

    setResult({ kind: "loading" });
    try {
      const [read] = await Promise.all([
        apiGet<PublicReadInfo>(`/leitura/${normalized}`),
      ]);
      setResult({
        kind: "found",
        read: read,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setResult({ kind: "notfound", read: { items: [], name: name } });
        return;
      }
      setResult({ kind: "error" });
    }
  }

  async function addBook(e: { preventDefault: () => void }) {
    e.preventDefault();
    const normalized = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (!normalized) return;

    setBookAddResult({ kind: "loading" });
    try {
      await Promise.all([
        apiPost<PublicReadInfo>(`/leitura/add`, {
          name: normalized,
          book_name: bookName,
          status: "lido",
        }),
      ]);
      setBookAddResult({ kind: "done" });
      setBookName("");
      await consult(e);
    } catch (err) {
      setBookAddResult({ kind: "error" });
    }
  }

  return (
    <div className="page">
      <Header />
      <div className="consulta">
        <h1 className="consulta__title">Lista de leitura</h1>
        <p className="consulta__sub">Digite o seu nome</p>

        <form className="consulta__form" onSubmit={(e) => void consult(e)}>
          <div className="consulta__field">
            <label className="field-label" htmlFor="consulta-codigo">
              Nome
            </label>
            <input
              id="consulta-codigo"
              className="field-input"
              autoFocus
              placeholder="Lucas"
              value={name}
              onChange={(e) => {
                if (name !== "") {
                  setResult({ kind: "idle" });
                }
                setName(e.target.value);
              }}
            />
          </div>
          <button className="btn btn--primary" type="submit">
            {result.kind === "loading" ? "Consultando…" : "Consultar"}
          </button>
        </form>

        {result.kind === "error" && (
          <div className="alert alert--error consulta__alert" role="alert">
            Não foi possível consultar agora. Tente de novo.
          </div>
        )}

        {(result.kind === "found" || result.kind === "notfound") && (
          <div>
            <hr />
            <div>
              <span className="field-label">Adicionar Livro</span>
              <form className="add__form" onSubmit={(e) => void addBook(e)}>
                <div className="add__field">
                  <input
                    id="add-book-name"
                    className="field-input"
                    autoFocus
                    placeholder="Manifesto do Partido Comunista"
                    value={bookName}
                    onChange={(e) => setBookName(e.target.value)}
                    disabled={bookAddResult.kind === "loading"}
                  />
                </div>
                <button className="btn btn--primary" type="submit">
                  {bookAddResult.kind === "loading"
                    ? "Adicionando…"
                    : "Adicionar"}
                </button>
              </form>
            </div>

            <div className="consulta__result">
              {result.read.items.map((item, i) => (
                <div key={i} className="consulta__unit">
                  <div className="consulta__unit-head">
                    <span className="consulta__unit-title">
                      {item.book_name}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        gap: "0.25rem",
                        alignItems: "center",
                      }}
                    >
                      <span className={`consulta__unit-status`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
