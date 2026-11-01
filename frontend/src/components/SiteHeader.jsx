import { Brand } from './Brand.jsx';

export function SiteHeader() {
  return (
    <header id="inicio" className="site-header">
      <div className="page-width header-inner">
        <a className="brand-link" href="/" aria-label="Leia+, página inicial"><Brand /></a>
        <nav aria-label="Navegação principal">
          <a href="/#o-clube">O clube</a>
          <a href="/#como-funciona">Como funciona</a>
        </nav>
        <span className="header-caption"><span aria-hidden="true">✳</span> Histórias que aproximam</span>
      </div>
      <div className="checker" aria-hidden="true" />
    </header>
  );
}
