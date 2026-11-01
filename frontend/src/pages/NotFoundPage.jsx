import { Link } from 'react-router-dom';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { PrimaryButton } from '../components/PrimaryButton.jsx';

export function NotFoundPage() {
  return (
    <ContentContainer className="inner-page not-found-page">
      <PageHeader eyebrow="PÁGINA NÃO ENCONTRADA" title="Essa página ficou fora da história." />
      <ContentCard>
        <EmptyState
          title="Vamos voltar a uma página conhecida?"
          description="Não encontramos esse endereço. Você pode conhecer o clube ou voltar ao início."
          action={<>
            <PrimaryButton component={Link} to="/">Ir para a página inicial</PrimaryButton>
            <Link className="text-link" to="/sobre">Sobre o clube <span aria-hidden="true">→</span></Link>
          </>}
        />
      </ContentCard>
    </ContentContainer>
  );
}
