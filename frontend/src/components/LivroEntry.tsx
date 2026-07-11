import { useState } from "react";
import { useCart } from "../cart/CartContext";
import { bookCoverPath } from "../lib/covers";
import { buildMeta, formatPrice, splitParagraphs } from "../lib/format";
import type { Book } from "../lib/types";
import { StockBadge } from "./StockBadge";
import { StatusTag } from "./StatusTag";

const DESCRIPTION_CLAMP = 220;

function ClampedDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const paragraphs = splitParagraphs(description);
  const plain = paragraphs.join(" ");

  if (plain.length <= DESCRIPTION_CLAMP) {
    return (
      <div className="livro-entry__desc">
        {paragraphs.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className="livro-entry__desc">
        <p>
          {plain.slice(0, DESCRIPTION_CLAMP).trimEnd()}…{" "}
          <button className="ver-mais" onClick={() => setExpanded(true)}>
            ver mais
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="livro-entry__desc">
      {paragraphs.map((para, i) => (
        <p key={i}>
          {para}
          {i === paragraphs.length - 1 && (
            <>
              {" "}
              <button className="ver-mais" onClick={() => setExpanded(false)}>
                ver menos
              </button>
            </>
          )}
        </p>
      ))}
    </div>
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

        <ClampedDescription description={book.description} />

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
