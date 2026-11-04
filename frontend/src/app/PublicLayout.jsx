import { useRef } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation, useMatches, useNavigation } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import { SiteHeader } from '../components/SiteHeader.jsx';
import { SiteFooter } from '../components/SiteFooter.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { usePageNavigation } from '../hooks/usePageNavigation.js';
import { useAuth } from '../hooks/useAuth.js';
import { SessionProblem } from '../components/SessionProblem.jsx';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { loginDestination } from '../utils/return-to.js';

export function PublicLayout() {
  const mainRef = useRef(null);
  const navigation = useNavigation();
  const location = useLocation();
  const matches = useMatches();
  const auth = useAuth();
  usePageNavigation(mainRef);

  return (
    <div className="public-layout">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <SiteHeader />
      <main id="conteudo" ref={mainRef} tabIndex={-1}>
        {navigation.state !== 'idle' && <LoadingState compact message="Abrindo a próxima página…" />}
        {auth.status === 'temporary_error' && !matches.some((match) => match.handle?.handlesSessionError || match.handle?.requiresAuth) && <ContentContainer className="session-notice"><SessionProblem /></ContentContainer>}
        {auth.reason === 'expired' && auth.status === 'unauthenticated' && location.pathname !== '/login' && !matches.some((match) => match.handle?.requiresAuth) && <ContentContainer className="session-notice"><Alert severity="warning">Sua sessão não está mais disponível. <Link to={loginDestination(location)}>Entre novamente.</Link></Alert></ContentContainer>}
        <Outlet />
      </main>
      <SiteFooter />
      <ScrollRestoration storageKey="leia-scroll-positions" />
    </div>
  );
}
