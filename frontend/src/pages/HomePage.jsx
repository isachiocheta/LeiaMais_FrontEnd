import { Link } from 'react-router-dom';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { PrimaryButton } from '../components/PrimaryButton.jsx';
import { BookIllustration } from '../components/BookIllustration.jsx';
import flower from '../assets/flor2.png';
import stemFlower from '../assets/flor1.png';
import { useAuth } from '../hooks/useAuth.js';

const steps = [
  { title: 'Primeiro, o cadastro', text: 'Você informa seu nome, e-mail e senha para solicitar sua entrada no clube.' },
  { title: 'Depois, a aprovação', text: 'A administração do clube analisa seu cadastro. O acesso é liberado quando sua conta é aprovada.' },
  { title: 'E então, a leitura!', text: 'Com o acesso liberado, você pode participar dos ciclos de leitura, acompanhar seu progresso e se inscrever nos encontros.' },
];

export function HomePage() {
  const { status } = useAuth();
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <ContentContainer className="hero-wrap">
          <div className="hero-topline"><span>O CLUBE DO LIVRO DA ESCOLA</span><span aria-hidden="true">UM NOVO CAPÍTULO COMEÇA AQUI ↗</span></div>
          <ContentCard className="hero-panel">
            <div className="hero-copy">
              <PageHeader
                id="hero-title"
                className="hero-page-header"
                eyebrow={<><span className="tiny-star" aria-hidden="true">✳</span> UM CLUBE. MUITAS HISTÓRIAS.</>}
                title={<>Ler é bom.<br />Ler <span className="underlined">junto</span><br />é ainda melhor.</>}
              />
              <p className="hero-description">Um livro abre caminhos. Um clube aproxima pessoas. No Leia+, cada página é um convite para descobrir e compartilhar.</p>
              <div className="hero-actions">
                {status === 'authenticated' ? <>
                  <PrimaryButton component={Link} to="/minha-area" endIcon={<span aria-hidden="true">↗</span>}>Minha área</PrimaryButton>
                  <Link className="text-link" to="/sobre">Sobre o clube</Link>
                </> : <>
                  <PrimaryButton component={Link} to="/cadastro" endIcon={<span aria-hidden="true">↗</span>}>Solicitar cadastro</PrimaryButton>
                  <Link className="text-link" to="/login">Já tenho conta · Entrar</Link>
                </>}
              </div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <span className="art-caption">SEU LUGAR ENTRE AS PÁGINAS</span>
              <BookIllustration />
              <div className="reading-note"><span>LEMBRETE DO DIA</span><p>Boas histórias<br />merecem companhia.</p></div>
              <img className="hero-flower" src={flower} width="92" height="119" alt="" />
            </div>
          </ContentCard>
          <div className="hero-bottomline"><span>Mais páginas. Mais conversas. Mais conexões.</span><Link to="#como-funciona">Como funciona <span aria-hidden="true">↓</span></Link></div>
        </ContentContainer>
      </section>

      <ContentContainer component="section" id="o-clube" className="club-section" aria-labelledby="club-title">
        <div className="club-heading"><p className="eyebrow">PRAZER, SOMOS O LEIA+</p><h2 id="club-title">Cada leitura,<br />um novo encontro.</h2><img className="club-flower" src={stemFlower} width="80" height="104" alt="" loading="lazy" /></div>
        <div className="club-copy"><p>O Leia+ é o clube do livro da escola: um espaço para quem já ama ler e para quem está descobrindo esse gosto agora.</p><p>Aqui, a leitura continua na conversa. Os ciclos de leitura e os encontros convidam você a trocar impressões, ouvir outros pontos de vista e construir sua própria relação com os livros.</p><div className="club-footnote"><span aria-hidden="true">✳</span><span>Não precisa ter lido de tudo.<br /><strong>A curiosidade já é um bom começo.</strong></span></div></div>
      </ContentContainer>

      <section id="como-funciona" className="how-section" aria-labelledby="how-title">
        <ContentContainer>
          <div className="section-heading"><div><p className="eyebrow">DO PRIMEIRO OLÁ À PRÓXIMA PÁGINA</p><h2 id="how-title">Como a história começa</h2></div><p>Três passos para fazer parte<br /> das nossas leituras.</p></div>
          <ol className="steps">{steps.map((step, index) => <li key={step.title}><span className="step-number" aria-hidden="true">0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
          <div className="closing-note"><span aria-hidden="true">✳</span><p>Histórias diferentes.<br className="mobile-break" /> <strong>Um lugar para compartilhar.</strong></p><span aria-hidden="true">✳</span></div>
        </ContentContainer>
      </section>
    </>
  );
}
