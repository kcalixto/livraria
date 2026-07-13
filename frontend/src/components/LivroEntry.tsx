import { useState } from "react";
import { useCart } from "../cart/CartContext";
import { bookCoverPath } from "../lib/covers";
import { buildMeta, formatPrice } from "../lib/format";
import type { Book } from "../lib/types";
import { ClampedText } from "./ClampedText";
import { StockBadge } from "./StockBadge";
import { StatusTag } from "./StatusTag";

const DESCRIPTION_CLAMP = 220;

function ClampedDescription({ description }: { description: string }) {
  return (
    <ClampedText text={description} limit={DESCRIPTION_CLAMP} className="livro-entry__desc" />
  );
}

export function LivroEntry({ book }: { book: Book }) {
  const { add } = useCart();
  const [coverBroken, setCoverBroken] = useState(false);
  const soldOut = book.amount <= 0;
  const meta = buildMeta(book);

  return (
    <article className="livro-entry">
      <div className="livro-entry__cover">
        {coverBroken ? (
          <div className="livro-entry__cover-fallback">
            <span>{book.title}</span>
          </div>
        ) : (
          <img
            src={bookCoverPath(book.id)}
            alt={`Capa de ${book.title}`}
            onError={() => setCoverBroken(true)}
          />
        )}
      </div>

      <div className="livro-entry__body">
        <h3 className="livro-entry__title">{book.title}</h3>
        {book.author && (
          <div className="livro-entry__author">({book.author})</div>
        )}

        {book.description && <ClampedDescription description={book.description} />}

        {meta && <div className="livro-entry__meta">{meta}</div>}

        <div className="livro-entry__buy">
          <span className="livro-entry__price">{formatPrice(book.price)}</span>
          {soldOut ? (
            <span className="livro-entry__no-stock">Sem estoque na região</span>
          ) : (
            <>
              <StatusTag status={book.status} />
              <StockBadge amount={book.amount} />
              <button
                className="btn btn--primary"
                onClick={() =>
                  add({ id: book.id, title: book.title, price: book.price })
                }
              >
                Adicionar ao carrinho
              </button>
            </>
          )}
        </div>
      </div>

      {soldOut && <span className="esgotado-seal">Esgotado</span>}
    </article>
  );
}
