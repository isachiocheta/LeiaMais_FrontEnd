import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { ErrorState } from '../components/ErrorState.jsx';

export function RouteErrorPage() {
  const location = useLocation();
  useEffect(() => {
    document.title = 'Não foi possível abrir a página | Leia+';
  }, [location.key]);

  return (
    <ContentContainer className="inner-page">
      <PageHeader eyebrow="VAMOS TENTAR MAIS UMA VEZ" title="Este capítulo não abriu." />
      <ErrorState
        title="Não foi possível abrir a página"
        message="Verifique sua conexão e tente recarregar."
        onRetry={() => window.location.reload()}
        retryLabel="Recarregar a página"
      />
    </ContentContainer>
  );
}
