import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import Button from '@mui/material/Button';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Brand } from './Brand.jsx';
import { ContentContainer } from './ContentContainer.jsx';

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const isMobile = useMediaQuery('(max-width: 700px)');
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.key, isMobile]);

  function onKeyDown(event) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <header id="inicio" className="site-header" tabIndex={-1} onKeyDown={onKeyDown}>
      <ContentContainer className="header-inner">
        <Link className="brand-link" to="/" aria-label="Leia+, página inicial" onClick={() => setOpen(false)}><Brand /></Link>
        <Button
          ref={triggerRef}
          className="mobile-menu-button"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={isMobile && open}
          aria-controls="public-navigation"
          onClick={() => setOpen((current) => !current)}
        >
          Menu <span aria-hidden="true">{open ? '×' : '☰'}</span>
        </Button>
        <nav id="public-navigation" className="site-nav" aria-label="Navegação principal" hidden={isMobile && !open}>
          <NavLink to="/" end onClick={() => setOpen(false)}>Início</NavLink>
          <NavLink to="/sobre" onClick={() => setOpen(false)}>Sobre o clube</NavLink>
        </nav>
        <span className="header-caption"><span aria-hidden="true">✳</span> Histórias que aproximam</span>
      </ContentContainer>
      <div className="checker" aria-hidden="true" />
    </header>
  );
}
