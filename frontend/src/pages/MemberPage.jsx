import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { PrimaryButton } from '../components/PrimaryButton.jsx';
import { CurrentReading } from '../components/CurrentReading.jsx';

export function MemberPage() {
  const { user } = useAuth();
  return (
    <ContentContainer className="inner-page member-page">
      <PageHeader eyebrow="SEU ESPAÇO NO LEIA+" title={`Olá, ${user.nome}!`} description="Você está conectado ao clube." />
      <ContentCard className="member-card">
        <h2>Sua identificação</h2>
        <dl>
          <div><dt>Nome</dt><dd>{user.nome}</dd></div>
          <div><dt>E-mail</dt><dd>{user.email}</dd></div>
          <div><dt>Perfil</dt><dd>{user.perfil === 'ADMIN_CLUBE' ? 'Administração do clube' : 'Leitor'}</dd></div>
        </dl>
        <div className="member-links">
          <PrimaryButton component={Link} to="/catalogo">Explorar catálogo</PrimaryButton>
          <Link className="text-link" to="/ciclos">Ciclos de leitura</Link>
          <Link className="text-link" to="/encontros">Agenda do clube</Link>
          <Link className="text-link" to="/minhas-leituras">Histórico de leituras</Link>
          {user.perfil === 'ADMIN_CLUBE' && <Link className="text-link" to="/admin/livros">Administrar livros</Link>}
          <Link className="text-link" to="/sobre">Sobre o clube</Link>
          <Link className="text-link" to="/">Página inicial <span aria-hidden="true">↗</span></Link>
        </div>
      </ContentCard>
      {user.perfil === 'LEITOR' && <CurrentReading />}
    </ContentContainer>
  );
}
