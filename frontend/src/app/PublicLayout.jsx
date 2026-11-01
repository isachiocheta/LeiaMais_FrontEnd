import { useRef } from 'react';
import { Outlet, ScrollRestoration, useNavigation } from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader.jsx';
import { SiteFooter } from '../components/SiteFooter.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { usePageNavigation } from '../hooks/usePageNavigation.js';

export function PublicLayout() {
  const mainRef = useRef(null);
  const navigation = useNavigation();
  usePageNavigation(mainRef);

  return (
    <div className="public-layout">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <SiteHeader />
      <main id="conteudo" ref={mainRef} tabIndex={-1}>
        {navigation.state !== 'idle' && <LoadingState compact message="Abrindo a próxima página…" />}
        <Outlet />
      </main>
      <SiteFooter />
      <ScrollRestoration storageKey="leia-scroll-positions" />
    </div>
  );
}
