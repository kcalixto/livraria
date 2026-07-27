import { useState } from 'react';
import { bookCoverPath } from '../lib/covers';

// capa mini com o mesmo fallback listrado do catálogo quando não há arquivo
// (ou quando o livro ainda não tem slug — dado legado pré-migração)
export function CoverThumb({
  slug,
  title,
  onBroken,
  role,
}: {
  slug: string | undefined;
  title: string;
  onBroken?: () => void;
  role?: string; // "cell" quando a capa é coluna de uma grid com roles de tabela
}) {
  const [broken, setBroken] = useState(false);

  return (
    <span className="bo-livros__cover" role={role}>
      {broken || !slug ? (
        <span className="bo-livros__cover-fallback" title={title} />
      ) : (
        <img
          src={bookCoverPath(slug)}
          alt=""
          onError={() => {
            setBroken(true);
            onBroken?.();
          }}
        />
      )}
    </span>
  );
}
