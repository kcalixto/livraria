import { useState } from 'react';
import { bookCoverPath } from '../lib/covers';

// capa mini com o mesmo fallback listrado do catálogo quando não há arquivo
export function CoverThumb({ id, title }: { id: string; title: string }) {
  const [broken, setBroken] = useState(false);

  return (
    <span className="bo-livros__cover">
      {broken ? (
        <span className="bo-livros__cover-fallback" title={title} />
      ) : (
        <img src={bookCoverPath(id)} alt="" onError={() => setBroken(true)} />
      )}
    </span>
  );
}
