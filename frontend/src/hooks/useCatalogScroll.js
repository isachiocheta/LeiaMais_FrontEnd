import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const positions = new Map();
function remember(key) {
  positions.delete(key);
  positions.set(key, window.scrollY);
  if (positions.size > 50) positions.delete(positions.keys().next().value);
}

export function useCatalogScroll(ready) {
  const { key } = useLocation();
  const navigationType = useNavigationType();
  const restoring = useRef(false);
  useLayoutEffect(() => {
    restoring.current = navigationType === 'POP' && positions.has(key);
    const save = () => { if (!restoring.current) remember(key); };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [key, navigationType]);
  useLayoutEffect(() => {
    if (ready && restoring.current) {
      restoring.current = false;
      window.scrollTo(0, positions.get(key));
    }
  }, [ready, key]);
  return () => remember(key);
}
