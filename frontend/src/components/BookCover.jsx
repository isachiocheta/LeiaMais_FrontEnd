import { useState } from 'react';
import { safeCoverUrl } from '../utils/book-cover.js';

function Cover({ src, title }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) return <img
    className="book-cover" src={src} alt={`Capa de ${title}`} width="240" height="360"
    loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}
  />;
  return <div className="book-cover book-cover-fallback" role="img" aria-label={`Capa indisponível para ${title}`}>
    <svg width="66" height="66" viewBox="0 0 66 66" fill="none" aria-hidden="true" focusable="false">
      <path d="M10 12h19c5 0 6 4 6 4s1-4 6-4h15v42H41c-5 0-6 3-6 3s-1-3-6-3H10V12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M35 17v39M17 23h10M17 31h10M42 23h7M42 31h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
    <span>Capa indisponível</span>
  </div>;
}

export function BookCover({ src, title }) {
  const safe = safeCoverUrl(src);
  return <Cover key={safe} src={safe} title={title} />;
}
