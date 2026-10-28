import { useEffect, useState } from "react";
import { ApiError, apiGet } from "../../api/client";

interface PublicReadInfo {
  status: string;
  result: {
    name: string;
    books: {
      book_name: string;
      status: string;
    }[];
  }[];
}

type Result =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "notfound"; read: PublicReadInfo }
  | { kind: "error" }
  | { kind: "found"; read: PublicReadInfo };

export function Leitura() {
  const [result, setResult] = useState<Result | null>(null);

  async function consult() {
    setResult({ kind: "loading" });
    try {
      const [read] = await Promise.all([
        apiGet<PublicReadInfo>(`/leitura/list`),
      ]);
      setResult({
        kind: "found",
        read: read,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setResult({ kind: "notfound", read: { status: "", result: [] } });
        return;
      }
      setResult({ kind: "error" });
    }
  }

  useEffect(() => {
    const load = async () => {
      if (result === null) {
        await consult();
      }
    };
    load();
  }, [result]);

  return (
    <div className="bo-content">
      {result && result.kind === "found" && (
        <div className="leituras-table" aria-label="Lotes de aquisição">
          <div className="leituras-table__cols">
            <span>nome</span>
            <span>Livro</span>
            <span>Status</span>
          </div>

          <div>
            {result.read.result.map(({ name, books }) => {
              return (
                <div className="leituras-table__rows">
                  <span className="leituras-table__name">{name}</span>
                  {books.map(({ book_name, status }) => (
                    <div className="leituras-table__row">
                      <span></span>
                      <span className="leituras-table__book_name">
                        {book_name}
                      </span>
                      <span className="leituras-table__status">{status}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
