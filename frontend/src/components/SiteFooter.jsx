import { Brand } from './Brand.jsx';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="checker" aria-hidden="true" />
      <div className="page-width footer-main">
        <a className="brand-link" href="/" aria-label="Leia+, página inicial"><Brand /></a>
        <p>Um clube da escola.<br /><strong>Um mundo de histórias.</strong></p>
        <a className="text-link" href="#inicio">Voltar ao início <span aria-hidden="true">↑</span></a>
      </div>
      <div className="page-width footer-bottom">
        <span>Leia+ · Clube do livro escolar</span>
        <span>Entre páginas, a gente se encontra.</span>
      </div>
    </footer>
  );
}
