import { Link } from 'react-router-dom';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { PrimaryButton } from '../components/PrimaryButton.jsx';

export function AccessDeniedPage() {
  return (
    <ContentContainer className="inner-page">
      <PageHeader eyebrow="ACESSO NÃO PERMITIDO" title="Esta página não está disponível para seu perfil." description="Sua conta está conectada, mas não possui permissão para acessar este conteúdo." />
      <ContentCard className="member-card">
        <p>Você pode voltar para sua área ou conhecer o funcionamento do clube.</p>
        <div className="member-links">
          <PrimaryButton component={Link} to="/minha-area">Voltar à minha área</PrimaryButton>
          <Link className="text-link" to="/sobre">Sobre o clube <span aria-hidden="true">↗</span></Link>
        </div>
      </ContentCard>
    </ContentContainer>
  );
}
