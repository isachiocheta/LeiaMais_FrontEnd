import { Link } from 'react-router-dom';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { PrimaryButton } from '../components/PrimaryButton.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { BookIllustration } from '../components/BookIllustration.jsx';
import { ConnectionCheck } from '../components/ConnectionCheck.jsx';
import flower from '../assets/flor2.png';

export function AboutPage() {
  return (
    <ContentContainer className="inner-page about-page">
      <div className="about-heading">
        <PageHeader
          eyebrow="UM CLUBE. MUITAS MANEIRAS DE LER."
          title="Sobre o clube"
          description="O Leia+ aproxima pessoas da escola por meio dos livros, das conversas e das descobertas que uma leitura pode trazer."
        />
        <img src={flower} alt="" width="76" height="98" className="about-flower" />
      </div>

      <ContentCard component="section" className="about-intro" aria-labelledby="about-intro-title">
        <div>
          <p className="eyebrow">ENTRE PÁGINAS, A GENTE SE ENCONTRA</p>
          <h2 id="about-intro-title">Um livro é só o começo.</h2>
          <p>O Leia+ é o clube do livro da escola. Um espaço para quem já ama ler e para quem está começando a descobrir esse gosto.</p>
          <p>As leituras são organizadas em ciclos. Depois de ter seu cadastro aprovado, você pode participar desses ciclos, acompanhar seu progresso e se inscrever nos encontros para trocar impressões sobre os livros.</p>
        </div>
        <BookIllustration />
      </ContentCard>

      <section className="about-section" aria-labelledby="profiles-title">
        <p className="eyebrow">PESSOAS DIFERENTES, UMA HISTÓRIA EM COMUM</p>
        <h2 id="profiles-title">Dois perfis, um clube</h2>
        <div className="profile-grid">
          <ContentCard component="article" className="profile-card" aria-labelledby="reader-title">
            <span className="profile-marker" aria-hidden="true">01</span>
            <h3 id="reader-title">Leitor</h3>
            <p>É quem participa das leituras e traz novas perspectivas para as conversas.</p>
            <ul>
              <li>Consulta os livros, os ciclos e os encontros do clube.</li>
              <li>Participa dos ciclos e acompanha seu progresso de leitura.</li>
              <li>Inscreve-se nos encontros disponíveis.</li>
            </ul>
          </ContentCard>
          <ContentCard component="article" className="profile-card profile-card-sand" aria-labelledby="admin-title">
            <span className="profile-marker" aria-hidden="true">02</span>
            <h3 id="admin-title">Administração do clube</h3>
            <p>É o perfil responsável pela organização do clube e pela gestão dos acessos.</p>
            <ul>
              <li>Analisa os cadastros e aprova o acesso dos leitores.</li>
              <li>Organiza o catálogo, os ciclos de leitura e os encontros.</li>
              <li>Acompanha os participantes dos ciclos e as inscrições nos encontros.</li>
            </ul>
          </ContentCard>
        </div>
      </section>

      <ContentCard component="section" className="approval-card" aria-labelledby="approval-title">
        <p className="eyebrow">ANTES DO PRIMEIRO ENCONTRO</p>
        <h2 id="approval-title">Como funciona a aprovação?</h2>
        <p>O cadastro público solicita uma conta de leitor. Ele não libera o acesso automaticamente nem permite escolher o perfil de administração.</p>
        <ol className="approval-steps">
          <li><h3>Você solicita a entrada</h3><p>Ao informar nome, e-mail e senha, seu cadastro fica na situação <StatusBadge status="PENDENTE" />.</p></li>
          <li><h3>A administração analisa</h3><p>A administração do clube analisa a solicitação e decide sobre a liberação do acesso.</p></li>
          <li><h3>A aprovação libera o acesso</h3><p>Quando aprovado, o cadastro passa para <StatusBadge status="ATIVO" />. Você pode então entrar na sua conta e participar das leituras.</p></li>
        </ol>
        <p className="approval-footnote">Contas pendentes ou inativas não têm acesso à área autenticada.</p>
      </ContentCard>

      <ConnectionCheck />

      <div className="about-closing">
        <p>Cada leitor traz uma perspectiva.<br /><strong>É na troca que a história cresce.</strong></p>
        <PrimaryButton component={Link} to="/" endIcon={<span aria-hidden="true">↗</span>}>Voltar à página inicial</PrimaryButton>
      </div>
    </ContentContainer>
  );
}
