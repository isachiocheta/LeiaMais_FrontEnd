import { useLayoutEffect, useRef } from 'react';
import { useLocation, useMatches } from 'react-router-dom';

export function usePageNavigation(mainRef) {
  const location = useLocation();
  const matches = useMatches();
  const previousPage = useRef(null);
  const page = `${location.pathname}${location.search}`;
  const title = [...matches].reverse().find((match) => match.handle?.title)?.handle.title;
  const preserveSearchFocus = matches.some((match) => match.handle?.preserveSearchFocus);
  const previousPath = useRef(null);

  useLayoutEffect(() => {
    document.title = title || 'Leia+ | Histórias que aproximam';
    // Focar sem rolar permite que ScrollRestoration recupere a posição no voltar.
    // Âncoras da mesma página mantêm seu próprio comportamento de navegação.
    if ((previousPage.current !== page || !location.hash) && !(preserveSearchFocus && previousPath.current === location.pathname)) {
      mainRef.current?.focus({ preventScroll: true });
    }
    previousPage.current = page;
    previousPath.current = location.pathname;
  }, [page, title, location.key, location.hash, location.pathname, preserveSearchFocus, mainRef]);
}
