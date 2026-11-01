import { Link } from 'react-router-dom';
import { Brand } from './Brand.jsx';
import { ContentContainer } from './ContentContainer.jsx';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="checker" aria-hidden="true" />
      <ContentContainer className="footer-main">
        <Link className="brand-link" to="/" aria-label="Leia+, página inicial"><Brand /></Link>
        <p>Um clube da escola.<br /><strong>Um mundo de histórias.</strong></p>
        <div className="footer-links">
          <Link className="text-link" to="/sobre">Sobre o clube</Link>
          <a className="text-link" href="#inicio">Voltar ao início <span aria-hidden="true">↑</span></a>
        </div>
      </ContentContainer>
      <ContentContainer className="footer-bottom">
        <span>Leia+ · Clube do livro escolar</span>
        <span>Entre páginas, a gente se encontra.</span>
      </ContentContainer>
    </footer>
  );
}
