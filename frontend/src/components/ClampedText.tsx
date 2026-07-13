import { useState } from 'react';
import { splitParagraphs } from '../lib/format';

// texto longo com clamp e "ver mais"/"ver menos" (regra do catálogo)
export function ClampedText({
  text,
  limit,
  className,
}: {
  text: string;
  limit: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const paragraphs = splitParagraphs(text);
  const plain = paragraphs.join(' ');

  if (plain.length <= limit) {
    return (
      <div className={className}>
        {paragraphs.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className={className}>
        <p>
          {plain.slice(0, limit).trimEnd()}…{' '}
          <button className="ver-mais" onClick={() => setExpanded(true)}>
            ver mais
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {paragraphs.map((para, i) => (
        <p key={i}>
          {para}
          {i === paragraphs.length - 1 && (
            <>
              {' '}
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
